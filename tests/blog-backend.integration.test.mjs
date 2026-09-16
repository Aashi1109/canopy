import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import postgres from "postgres";

const url = process.env.BLOG_TEST_DATABASE_URL;
test(
  "blog backend preserves drafts, snapshots, permissions and atomic publication",
  {
    skip: url ? false : "set BLOG_TEST_DATABASE_URL to a disposable PostgreSQL database",
  },
  async (t) => {
    const schema = `blog_domain_${randomUUID().replaceAll("-", "")}`;
    const admin = postgres(url, { max: 1, onnotice() {} });
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    const target = new URL(url);
    target.searchParams.set("search_path", schema);
    const previousUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = target.toString();
    const sql = postgres(target.toString(), { max: 5, onnotice() {} });
    const { sqlClient } = await import("../packages/database/src/index.ts");
    t.after(async () => {
      await sqlClient.end();
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
      await sql.end();
      await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    });
    for (const file of ["0001_auth_control_plane.sql", "0006_blogs.sql"]) {
      await sql.unsafe(
        await readFile(new URL(`../packages/database/drizzle/${file}`, import.meta.url), "utf8"),
      );
    }
    await sql`INSERT INTO auth_users (id,name,email) VALUES ('admin-a','A','a@test.invalid'),('admin-b','B','b@test.invalid'),('viewer','V','v@test.invalid')`;
    await sql`INSERT INTO user_roles (user_id,role_id) VALUES ('admin-a','admin'),('admin-b','admin')`;
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
      await assert.rejects(
        m.createBlogPost("viewer", { title: "No access" }),
        /permission|denied/i,
      );
      await assert.rejects(
        m.saveBlogTerm("admin-a", { kind: "tag", name: "Forgery", createdBy: "viewer" }),
      );
      const created = await Promise.all([
        m.createBlogPost("admin-a", { title: "Same Title" }),
        m.createBlogPost("admin-a", { title: "Same Title" }),
      ]);
      assert.equal(new Set(created.map((p) => p.slug)).size, 2);
      assert.ok(created.every((p) => /^same-title(?:-[a-f0-9]{8})?$/.test(p.slug)));
      post = created[0];
    });
    await t.test("taxonomy attribution is server assigned and no-op rename is stable", async () => {
      const renamed = await m.saveBlogTerm("admin-b", {
        kind: "category",
        id: category.id,
        name: "Tutorials",
      });
      assert.equal(renamed.createdBy, "admin-a");
      assert.equal(renamed.updatedBy, "admin-b");
      const same = await m.saveBlogTerm("admin-a", {
        kind: "category",
        id: category.id,
        name: "Tutorials",
      });
      assert.equal(same.updatedBy, "admin-b");
      assert.deepEqual(same.updatedAt, renamed.updatedAt);
      await assert.rejects(
        m.saveBlogTerm("admin-a", { kind: "category", name: "TUTORIALS" }),
        /exists/i,
      );
    });
    await t.test(
      "stale save cannot overwrite draft; slug is immutable and snapshot saves deduplicate",
      async () => {
        const initial = post;
        post = await m.saveBlogDraft("admin-a", {
          postId: post.id,
          version: post.version,
          document: content("First revision"),
          mode: "manual",
        });
        assert.equal(post.slug, initial.slug);
        await assert.rejects(
          m.saveBlogDraft("admin-a", {
            postId: post.id,
            version: initial.version,
            document: content("Lost update"),
          }),
          { code: "CONFLICT" },
        );
        await assert.rejects(
          m.saveBlogDraft("admin-a", {
            postId: post.id,
            version: post.version,
            document: { ...post.draftDocument, slug: "changed" },
          }),
        );
        const noOp = await m.saveBlogDraft("admin-a", {
          postId: post.id,
          version: post.version,
          document: post.draftDocument,
          mode: "manual",
        });
        assert.equal(noOp.version, post.version);
        assert.equal(noOp.revisionSequence, post.revisionSequence);
      },
    );
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
        const [frozen] = await sql`SELECT * FROM blog_post_schedules WHERE post_id=${post.id}`;
        post = await m.saveBlogDraft("admin-a", {
          postId: post.id,
          version: post.version,
          document: content("Private newer draft"),
        });
        await sql`UPDATE blog_post_schedules SET scheduled_at=NOW()-interval '1 minute' WHERE id=${frozen.id}`;
        const results = await Promise.all([m.publishDueBlogPosts(), m.publishDueBlogPosts()]);
        assert.equal(
          results.reduce((n, r) => n + r.published, 0),
          1,
        );
        const [stored] = await sql`SELECT * FROM blog_posts WHERE id=${post.id}`;
        assert.equal(stored.published_revision_id, frozen.revision_id);
        assert.equal(stored.draft_document.title, "Private newer draft");
        assert.equal(
          (await sql`SELECT * FROM blog_post_schedules WHERE post_id=${post.id}`).length,
          0,
        );
        post = {
          ...post,
          version: stored.version,
          publishedRevisionId: stored.published_revision_id,
        };
      },
    );
    await t.test(
      "restoration backs up draft and preserves live identity; trash returns only to draft",
      async () => {
        const live = post.publishedRevisionId;
        post = await m.restoreBlogRevision("admin-a", {
          postId: post.id,
          version: post.version,
          revisionId: firstRevision,
        });
        assert.equal(post.draftDocument.title, "First revision");
        assert.equal(post.publishedRevisionId, live);
        const backups =
          await sql`SELECT document FROM blog_revisions WHERE post_id=${post.id} AND reason='restore_backup'`;
        assert.ok(backups.some((r) => r.document.title === "Private newer draft"));
        post = await m.trashBlogPost("admin-a", { postId: post.id, version: post.version });
        assert.equal(post.publishedRevisionId, null);
        assert.ok(post.trashedAt);
        assert.equal(
          (await sql`SELECT * FROM blog_published_post_tags WHERE post_id=${post.id}`).length,
          0,
        );
        post = await m.restoreTrashedBlogPost("admin-a", {
          postId: post.id,
          version: post.version,
        });
        assert.equal(post.publishedRevisionId, null);
        assert.equal(post.trashedAt, null);
      },
    );
    await t.test(
      "revoked publisher leaves recoverable diagnostics without changing draft/version",
      async () => {
        post = await m.scheduleBlogPost("admin-b", {
          postId: post.id,
          version: post.version,
          scheduledAt: new Date(Date.now() + 60000).toISOString(),
        });
        await sql`UPDATE blog_post_schedules SET scheduled_at=NOW()-interval '1 minute' WHERE post_id=${post.id}`;
        await sql`UPDATE auth_users SET status='suspended' WHERE id='admin-b'`;
        const result = await m.publishDueBlogPosts();
        assert.equal(result.failed, 1);
        const [schedule] = await sql`SELECT * FROM blog_post_schedules WHERE post_id=${post.id}`;
        assert.equal(schedule.last_error_code, "PUBLISHER_FORBIDDEN");
        const [stored] =
          await sql`SELECT version, published_revision_id FROM blog_posts WHERE id=${post.id}`;
        assert.equal(stored.version, post.version);
        assert.equal(stored.published_revision_id, null);
        post = await m.cancelBlogSchedule("admin-a", { postId: post.id, version: post.version });
        assert.equal(
          (await sql`SELECT * FROM blog_post_schedules WHERE post_id=${post.id}`).length,
          0,
        );
      },
    );
  },
);
