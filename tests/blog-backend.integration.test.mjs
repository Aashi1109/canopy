import { expect, test, onTestFinished } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const url = process.env.BLOG_TEST_DATABASE_URL;
test(
  "blog backend preserves drafts, snapshots, permissions and atomic publication",
  {
    skip: url ? false : "set BLOG_TEST_DATABASE_URL to a disposable PostgreSQL database",
  },
  async (t) => {
    const schema = `blog_domain_${randomUUID().replaceAll("-", "")}`;
    const admin = new pg.Client({ connectionString: url });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    const target = new URL(url);
    target.searchParams.set("options", `-c search_path=${schema}`);
    const previousUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = target.toString();
    const sql = new pg.Pool({ connectionString: target.toString(), max: 5 });
    const { sqlClient } = await import("../db/index.ts");
    onTestFinished(async () => {
      await sqlClient.end();
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
      await sql.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    });
    for (const file of ["0001_auth_control_plane.sql", "0006_blogs.sql"]) {
      await sql.query(await readFile(new URL(`../db/migration/0001-baseline/${file}`, import.meta.url), "utf8"));
    }
    await sql.query(
      "INSERT INTO auth_users (id,name,email) VALUES ('admin-a','A','a@test.invalid'),('admin-b','B','b@test.invalid'),('viewer','V','v@test.invalid')",
    );
    await sql.query("INSERT INTO user_roles (user_id,role_id) VALUES ('admin-a','admin'),('admin-b','admin')");
    const m = await import("../lib/blog/mutations.ts");
    const { createBlogDocument } = await import("../lib/blog/document.ts");
    const category = await m.saveBlogTerm("admin-a", { kind: "category", name: "Guides" });
    const tag = await m.saveBlogTerm("admin-a", { kind: "tag", name: "PDF" });
    const content = (title) => ({
      ...createBlogDocument(title),
      excerpt: "Useful guide",
      category: { id: category.id, label: category.name },
      tags: [{ id: tag.id, label: tag.name }],
      body: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: `Body for ${title}` }] }],
      },
    });
    let post;
    await t.test("permission denial, forged fields, and concurrent slug collisions", async () => {
      await expect(m.createBlogPost("viewer", { title: "No access" })).rejects.toThrow(/permission|denied/i);
      await expect(m.saveBlogTerm("admin-a", { kind: "tag", name: "Forgery", createdBy: "viewer" })).rejects.toThrow();
      const created = await Promise.all([
        m.createBlogPost("admin-a", { title: "Same Title" }),
        m.createBlogPost("admin-a", { title: "Same Title" }),
      ]);
      expect(new Set(created.map((p) => p.slug)).size).toBe(2);
      expect(created.every((p) => /^same-title(?:-[a-f0-9]{8})?$/.test(p.slug))).toBeTruthy();
      post = created[0];
    });
    await t.test("taxonomy attribution is server assigned and no-op rename is stable", async () => {
      const renamed = await m.saveBlogTerm("admin-b", {
        kind: "category",
        id: category.id,
        name: "Tutorials",
      });
      expect(renamed.createdBy).toBe("admin-a");
      expect(renamed.updatedBy).toBe("admin-b");
      const same = await m.saveBlogTerm("admin-a", {
        kind: "category",
        id: category.id,
        name: "Tutorials",
      });
      expect(same.updatedBy).toBe("admin-b");
      expect(same.updatedAt).toEqual(renamed.updatedAt);
      await expect(m.saveBlogTerm("admin-a", { kind: "category", name: "TUTORIALS" })).rejects.toThrow(/exists/i);
    });
    await t.test("stale save cannot overwrite draft; slug is immutable and snapshot saves deduplicate", async () => {
      const initial = post;
      post = await m.saveBlogDraft("admin-a", {
        postId: post.id,
        version: post.version,
        document: content("First revision"),
        mode: "manual",
      });
      expect(post.slug).toBe(initial.slug);
      await expect(
        m.saveBlogDraft("admin-a", {
          postId: post.id,
          version: initial.version,
          document: content("Lost update"),
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(
        m.saveBlogDraft("admin-a", {
          postId: post.id,
          version: post.version,
          document: { ...post.draftDocument, slug: "changed" },
        }),
      ).rejects.toThrow();
      const noOp = await m.saveBlogDraft("admin-a", {
        postId: post.id,
        version: post.version,
        document: post.draftDocument,
        mode: "manual",
      });
      expect(noOp.version).toBe(post.version);
      expect(noOp.revisionSequence).toBe(post.revisionSequence);
    });
    let firstRevision;
    await t.test(
      "publication and scheduled updates use immutable snapshots while newer drafts stay private",
      async () => {
        post = await m.publishBlogPost("admin-a", { postId: post.id, version: post.version });
        firstRevision = post.publishedRevisionId;
        post = await m.saveBlogDraft("admin-a", {
          postId: post.id,
          version: post.version,
          document: content("Scheduled version"),
        });
        post = await m.scheduleBlogPost("admin-a", {
          postId: post.id,
          version: post.version,
          scheduledAt: new Date(Date.now() + 60000).toISOString(),
        });
        const [frozen] = (await sql.query("SELECT * FROM blog_post_schedules WHERE post_id=$1", [post.id])).rows;
        post = await m.saveBlogDraft("admin-a", {
          postId: post.id,
          version: post.version,
          document: content("Private newer draft"),
        });
        await sql.query("UPDATE blog_post_schedules SET scheduled_at=NOW()-interval '1 minute' WHERE id=$1", [
          frozen.id,
        ]);
        const results = await Promise.all([m.publishDueBlogPosts(), m.publishDueBlogPosts()]);
        expect(results.reduce((n, r) => n + r.published, 0)).toBe(1);
        const [stored] = (await sql.query("SELECT * FROM blog_posts WHERE id=$1", [post.id])).rows;
        expect(stored.published_revision_id).toBe(frozen.revision_id);
        expect(stored.draft_document.title).toBe("Private newer draft");
        expect((await sql.query("SELECT * FROM blog_post_schedules WHERE post_id=$1", [post.id])).rows.length).toBe(0);
        post = {
          ...post,
          version: stored.version,
          publishedRevisionId: stored.published_revision_id,
        };
      },
    );
    await t.test("restoration backs up draft and preserves live identity; trash returns only to draft", async () => {
      const live = post.publishedRevisionId;
      post = await m.restoreBlogRevision("admin-a", {
        postId: post.id,
        version: post.version,
        revisionId: firstRevision,
      });
      expect(post.draftDocument.title).toBe("First revision");
      expect(post.publishedRevisionId).toBe(live);
      const backups = (
        await sql.query("SELECT document FROM blog_revisions WHERE post_id=$1 AND reason='restore_backup'", [post.id])
      ).rows;
      expect(backups.some((r) => r.document.title === "Private newer draft")).toBeTruthy();
      post = await m.trashBlogPost("admin-a", { postId: post.id, version: post.version });
      expect(post.publishedRevisionId).toBe(null);
      expect(post.trashedAt).toBeTruthy();
      expect((await sql.query("SELECT * FROM blog_published_post_tags WHERE post_id=$1", [post.id])).rows.length).toBe(
        0,
      );
      post = await m.restoreTrashedBlogPost("admin-a", {
        postId: post.id,
        version: post.version,
      });
      expect(post.publishedRevisionId).toBe(null);
      expect(post.trashedAt).toBe(null);
    });
    await t.test("revoked publisher leaves recoverable diagnostics without changing draft/version", async () => {
      post = await m.scheduleBlogPost("admin-b", {
        postId: post.id,
        version: post.version,
        scheduledAt: new Date(Date.now() + 60000).toISOString(),
      });
      await sql.query("UPDATE blog_post_schedules SET scheduled_at=NOW()-interval '1 minute' WHERE post_id=$1", [
        post.id,
      ]);
      await sql.query("UPDATE auth_users SET status='suspended' WHERE id='admin-b'");
      const result = await m.publishDueBlogPosts();
      expect(result.failed).toBe(1);
      const [schedule] = (await sql.query("SELECT * FROM blog_post_schedules WHERE post_id=$1", [post.id])).rows;
      expect(schedule.last_error_code).toBe("PUBLISHER_FORBIDDEN");
      const [stored] = (await sql.query("SELECT version, published_revision_id FROM blog_posts WHERE id=$1", [post.id]))
        .rows;
      expect(stored.version).toBe(post.version);
      expect(stored.published_revision_id).toBe(null);
      post = await m.cancelBlogSchedule("admin-a", { postId: post.id, version: post.version });
      expect((await sql.query("SELECT * FROM blog_post_schedules WHERE post_id=$1", [post.id])).rows.length).toBe(0);
    });
  },
);
