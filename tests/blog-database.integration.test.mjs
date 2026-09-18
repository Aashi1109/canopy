import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

// Explicit opt-in only: never read the application's DATABASE_URL or env files.
const databaseUrl = process.env.BLOG_TEST_DATABASE_URL;

test(
  "blog migration enforces article identity, revision ownership, schedules, and retention",
  {
    skip: databaseUrl ? false : "set BLOG_TEST_DATABASE_URL to a disposable PostgreSQL database",
  },
  async (context) => {
    const schema = `blog_test_${randomUUID().replaceAll("-", "")}`;
    const admin = new pg.Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    const sql = new pg.Pool({
      connectionString: databaseUrl,
      max: 4,
      options: `-c search_path=${schema}`,
    });
    context.after(async () => {
      await sql.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    });
    const migration = await readFile(new URL("../db/migration/0001-baseline/0006_blogs.sql", import.meta.url), "utf8");
    await sql.query(
      await readFile(new URL("../db/migration/0001-baseline/0001_auth_control_plane.sql", import.meta.url), "utf8"),
    );
    const [adminBefore] = (await sql.query("SELECT access FROM roles WHERE id = 'admin'")).rows;
    const customAccess = { admin: { enter: true }, blog: { view: true, edit: false } };
    await sql.query(
      "INSERT INTO roles (id, name, description, access) VALUES ('editor', 'Editor', 'Custom editor', $1)",
      [JSON.stringify(customAccess)],
    );
    await sql.query(migration);

    await context.test(
      "migration grants system admin access without changing custom roles or removing protection",
      async () => {
        const [adminRole] = (await sql.query("SELECT access FROM roles WHERE id = 'admin'")).rows;
        const [customRole] = (await sql.query("SELECT access FROM roles WHERE id = 'editor'")).rows;
        assert.deepEqual(adminRole.access, {
          ...adminBefore.access,
          blog: { view: true, create: true, edit: true, publish: true, archive: true },
        });
        assert.deepEqual(customRole.access, customAccess);
        await assert.rejects(
          sql.query("UPDATE roles SET name = 'Changed' WHERE id = 'admin'"),
          /System roles are protected/,
        );
      },
    );

    await sql.query("INSERT INTO auth_users (id, name, email) VALUES ('author', 'Author', 'author@example.test')");
    await sql.query(
      "INSERT INTO blog_categories (id, name, slug, created_by, updated_by) VALUES ('category', 'Guides', 'guides', 'author', 'author')",
    );
    await sql.query(
      "INSERT INTO blog_tags (id, name, slug, created_by, updated_by) VALUES ('tag', 'PDF', 'pdf', 'author', 'author')",
    );
    await sql.query(
      "INSERT INTO blog_posts (id, slug, draft_document, draft_hash, created_by, draft_updated_by) VALUES\n    ('post-a', 'first-post', '{\"title\":\"Original\"}', 'hash-a', 'author', 'author'),\n    ('post-b', 'second-post', '{\"title\":\"Other\"}', 'hash-b', 'author', 'author')",
    );
    await sql.query(
      "INSERT INTO blog_revisions (id, post_id, revision_number, document, content_hash, reason, created_by) VALUES\n    ('revision-a', 'post-a', 1, '{\"title\":\"Original\"}', 'hash-a', 'create', 'author'),\n    ('revision-b', 'post-b', 1, '{\"title\":\"Other\"}', 'hash-b', 'create', 'author')",
    );

    await context.test("slugs are unique forever and cannot change with draft edits", async () => {
      await assert.rejects(
        sql.query("UPDATE blog_posts SET slug = 'changed' WHERE id = 'post-a'"),
        /slug is immutable/i,
      );
      await sql.query("UPDATE blog_posts SET draft_document = '{\"title\":\"Renamed\"}' WHERE id = 'post-a'");
      const [post] = (await sql.query("SELECT slug FROM blog_posts WHERE id = 'post-a'")).rows;
      assert.equal(post.slug, "first-post");
      await sql.query("UPDATE blog_posts SET trashed_at = NOW() WHERE id = 'post-b'");
      await assert.rejects(
        sql.query(
          "INSERT INTO blog_posts (id, slug, draft_document, draft_hash) VALUES ('duplicate', 'second-post', '{}', 'hash')",
        ),
        { code: "23505" },
      );
      await sql.query("UPDATE blog_posts SET trashed_at = NULL WHERE id = 'post-b'");
      await assert.rejects(
        sql.query(
          "INSERT INTO blog_posts (id, slug, draft_document, draft_hash) VALUES ('bad-slug', 'UPPER CASE', '{}', 'hash')",
        ),
        { code: "23514" },
      );
    });

    await context.test("snapshots and publication are constrained to their owning post", async () => {
      await assert.rejects(
        sql.query(
          "UPDATE blog_posts SET published_revision_id = 'revision-b', published_category_id = 'category', first_published_at = NOW(), published_updated_at = NOW() WHERE id = 'post-a'",
        ),
        { code: "23503" },
      );
      await assert.rejects(
        sql.query(
          "INSERT INTO blog_revisions (id, post_id, revision_number, document, content_hash, reason, source_revision_id) VALUES ('bad-restore', 'post-a', 2, '{}', 'hash', 'restore', 'revision-b')",
        ),
        { code: "23503" },
      );
      await assert.rejects(
        sql.query("UPDATE blog_posts SET published_revision_id = 'revision-a' WHERE id = 'post-a'"),
        {
          code: "23514",
        },
      );
      await assert.rejects(sql.query("UPDATE blog_posts SET draft_document = '[]' WHERE id = 'post-a'"), {
        code: "23514",
      });
      await assert.rejects(
        sql.query(
          "INSERT INTO blog_revisions (id, post_id, revision_number, document, content_hash, reason) VALUES ('bad-doc', 'post-a', 2, '[]', 'hash', 'create')",
        ),
        { code: "23514" },
      );
      await assert.rejects(
        sql.query(
          "INSERT INTO blog_revisions (id, post_id, revision_number, document, content_hash, reason) VALUES ('bad-number', 'post-a', 1, '{}', 'hash', 'create')",
        ),
        { code: "23505" },
      );
      await sql.query(
        "UPDATE blog_posts SET published_revision_id = 'revision-a', published_category_id = 'category', first_published_at = NOW(), published_updated_at = NOW(), published_search = to_tsvector('english', 'Original article') WHERE id = 'post-a'",
      );
      await assert.rejects(sql.query("UPDATE blog_posts SET trashed_at = NOW() WHERE id = 'post-a'"), {
        code: "23514",
      });
      await sql.query("INSERT INTO blog_published_post_tags (post_id, tag_id) VALUES ('post-a', 'tag')");
    });

    await context.test("taxonomy names are shared and case-insensitively unique", async () => {
      await assert.rejects(
        sql.query(
          "INSERT INTO blog_categories (id, name, slug) VALUES ('duplicate-category', 'GUIDES', 'other-guides')",
        ),
        { code: "23505" },
      );
      await assert.rejects(
        sql.query("INSERT INTO blog_tags (id, name, slug) VALUES ('duplicate-tag', 'pdf', 'other-pdf')"),
        {
          code: "23505",
        },
      );
      await sql.query("INSERT INTO blog_published_post_tags (post_id, tag_id) VALUES ('post-b', 'tag')");
      const [usage] = (
        await sql.query("SELECT COUNT(*)::integer AS count FROM blog_published_post_tags WHERE tag_id = 'tag'")
      ).rows;
      assert.equal(usage.count, 2);
    });

    await context.test("schedules freeze a same-post revision and permit only one active request", async () => {
      await assert.rejects(
        sql.query(
          "INSERT INTO blog_post_schedules (id, post_id, revision_id, scheduled_at) VALUES ('bad-schedule', 'post-a', 'revision-b', NOW())",
        ),
        { code: "23503" },
      );
      const results = await Promise.allSettled(
        ["schedule-a", "schedule-b"].map((id) =>
          sql.query(
            "INSERT INTO blog_post_schedules (id, post_id, revision_id, scheduled_at, scheduled_by) VALUES ($1, 'post-a', 'revision-a', NOW(), 'author')",
            [id],
          ),
        ),
      );
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      const rejected = results.find((result) => result.status === "rejected");
      assert.equal(rejected.reason.code, "23505");
      const [schedule] = (await sql.query("SELECT revision_id FROM blog_post_schedules WHERE post_id = 'post-a'")).rows;
      assert.equal(schedule.revision_id, "revision-a");
    });

    await context.test(
      "account deletion clears attribution without removing articles, terms, revisions, or schedules",
      async () => {
        await sql.query("DELETE FROM auth_users WHERE id = 'author'");
        for (const table of ["blog_categories", "blog_tags"]) {
          const [term] = (await sql.query(`SELECT created_by, updated_by FROM ${table}`)).rows;
          assert.deepEqual(term, { created_by: null, updated_by: null });
        }
        const [post] = (await sql.query("SELECT created_by, draft_updated_by FROM blog_posts WHERE id = 'post-a'"))
          .rows;
        assert.deepEqual(post, { created_by: null, draft_updated_by: null });
        const [revision] = (await sql.query("SELECT created_by, document FROM blog_revisions WHERE id = 'revision-a'"))
          .rows;
        assert.deepEqual(revision, { created_by: null, document: { title: "Original" } });
        const [schedule] = (
          await sql.query("SELECT scheduled_by, revision_id FROM blog_post_schedules WHERE post_id = 'post-a'")
        ).rows;
        assert.deepEqual(schedule, { scheduled_by: null, revision_id: "revision-a" });
      },
    );

    await context.test(
      "rerunning the migration preserves content, schedules, grants, and trigger enforcement",
      async () => {
        const before = (await sql.query("SELECT * FROM blog_posts ORDER BY id")).rows;
        const schedules = (await sql.query("SELECT * FROM blog_post_schedules ORDER BY id")).rows;
        const [roleBefore] = (await sql.query("SELECT * FROM roles WHERE id = 'admin'")).rows;
        await sql.query(migration);
        assert.deepEqual((await sql.query("SELECT * FROM blog_posts ORDER BY id")).rows, before);
        assert.deepEqual((await sql.query("SELECT * FROM blog_post_schedules ORDER BY id")).rows, schedules);
        const [roleAfter] = (await sql.query("SELECT * FROM roles WHERE id = 'admin'")).rows;
        assert.deepEqual(roleAfter, roleBefore);
        await assert.rejects(
          sql.query("UPDATE roles SET name = 'Changed' WHERE id = 'admin'"),
          /System roles are protected/,
        );
        await assert.rejects(
          sql.query("UPDATE blog_posts SET slug = 'changed' WHERE id = 'post-a'"),
          /slug is immutable/i,
        );
      },
    );
  },
);
