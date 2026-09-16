import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import postgres from "postgres";
import { createBlogDocument } from "../lib/blog/document.ts";

const databaseUrl = process.env.BLOG_TEST_DATABASE_URL;

test("blog queries expose only live content and paginate with stable PostgreSQL precision", {
  skip: databaseUrl ? false : "set BLOG_TEST_DATABASE_URL to a disposable PostgreSQL database",
}, async (context) => {
  const schema = `blog_query_test_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(databaseUrl, { max: 1, onnotice() {} });
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  const sql = postgres(databaseUrl, { max: 1, connection: { search_path: schema }, onnotice() {} });
  const previousUrl = process.env.DATABASE_URL;
  const url = new URL(databaseUrl);
  url.searchParams.set("search_path", schema);
  process.env.DATABASE_URL = url.toString();
  const queries = await import("../lib/blog/queries.ts");
  const { sqlClient } = await import("../packages/database/src/index.ts");
  context.after(async () => {
    await sqlClient.end();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    await sql.end();
    await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  for (const migration of ["0001_auth_control_plane.sql", "0006_blogs.sql"]) {
    await sql.unsafe(await readFile(new URL(`../packages/database/drizzle/${migration}`, import.meta.url), "utf8"));
  }
  await sql`INSERT INTO auth_users (id, name, email) VALUES ('viewer', 'Viewer', 'viewer@example.test'), ('denied', 'Denied', 'denied@example.test')`;
  await sql`INSERT INTO roles (id, name, description, access) VALUES ('blog-viewer', 'Blog viewer', 'Blog read-only access', '{"admin":{"enter":true},"blog":{"view":true}}')`;
  await sql`INSERT INTO user_roles (user_id, role_id) VALUES ('viewer', 'blog-viewer')`;
  await sql`INSERT INTO blog_categories (id, name, slug, created_by, updated_by) VALUES ('category', 'Current Category', 'current-category', 'viewer', 'viewer'), ('unused-category', 'Unused Category', 'unused-category', 'viewer', 'viewer')`;
  await sql`INSERT INTO blog_tags (id, name, slug, created_by, updated_by) VALUES ('tag', 'Current Tag', 'current-tag', 'viewer', 'viewer'), ('unused-tag', 'Unused Tag', 'unused-tag', 'viewer', 'viewer')`;
  await sql`UPDATE managed_tools SET enabled = false WHERE tool_id = 'paperwork.invoice-generator'`;
  await sql`UPDATE managed_tools SET archived = true WHERE tool_id = 'paperwork.receipt-generator'`;

  const document = {
    ...createBlogDocument("Published quokka article"), excerpt: "Public excerpt",
    body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Public article body about quokkas." }] }] },
    category: { id: "category", label: "Old Category" }, tags: [{ id: "tag", label: "Old Tag" }],
    relatedToolIds: ["paperwork.invoice-generator", "paperwork.receipt-generator", "devtools.json-formatter", "paperwork.expense-report", "devtools.missing"],
  };
  for (let index = 0; index < 14; index++) {
    const id = `live-${String(index).padStart(2, "0")}`;
    await sql`INSERT INTO blog_posts (id, slug, draft_document, draft_hash, created_by, draft_updated_by) VALUES (${id}, ${id}, ${sql.json({ ...document, title: "Secret draft title" })}, 'draft-hash', 'viewer', 'viewer')`;
    await sql`INSERT INTO blog_revisions (id, post_id, revision_number, document, content_hash, reason, created_by) VALUES (${`revision-${id}`}, ${id}, 1, ${sql.json(document)}, 'live-hash', 'publish', 'viewer')`;
    await sql`UPDATE blog_posts SET published_revision_id = ${`revision-${id}`}, published_category_id = 'category', first_published_at = '2026-09-16T10:00:00.000001Z', published_updated_at = '2026-09-16T10:00:00.000001Z', published_search = to_tsvector('english', 'Published quokka article') WHERE id = ${id}`;
    await sql`INSERT INTO blog_published_post_tags (post_id, tag_id) VALUES (${id}, 'tag')`;
  }
  for (const id of ["draft-only", "trashed", "unpublished"]) {
    await sql`INSERT INTO blog_posts (id, slug, draft_document, draft_hash) VALUES (${id}, ${id}, ${sql.json({ ...document, title: "Hidden article" })}, 'draft')`;
    await sql`INSERT INTO blog_revisions (id, post_id, revision_number, document, content_hash, reason) VALUES (${`revision-${id}`}, ${id}, 1, ${sql.json(document)}, 'revision', 'create')`;
  }
  await sql`UPDATE blog_posts SET trashed_at = NOW() WHERE id = 'trashed'`;
  await sql`INSERT INTO blog_post_schedules (id, post_id, revision_id, scheduled_at, scheduled_by) VALUES ('schedule', 'draft-only', 'revision-draft-only', NOW(), 'viewer')`;

  await context.test("public list projects published summaries and preserves sub-millisecond keyset ties", async () => {
    const first = await queries.listPublishedBlogPosts();
    assert.equal(first.items.length, 12);
    assert.ok(first.nextCursor);
    assert.equal(first.items[0].id, "live-13");
    const second = await queries.listPublishedBlogPosts({ cursor: first.nextCursor });
    assert.deepEqual(second.items.map((row) => row.id), ["live-01", "live-00"]);
    assert.equal(second.nextCursor, null);
    assert.equal(new Set([...first.items, ...second.items].map((row) => row.id)).size, 14);
    for (const item of first.items) {
      assert.equal(item.title, document.title);
      assert.equal(item.category.label, "Current Category");
      for (const key of ["body", "document", "draftDocument", "createdBy", "draftUpdatedBy", "publishedSearch"]) assert.equal(Object.hasOwn(item, key), false);
    }
    assert.doesNotMatch(JSON.stringify(first), /Secret draft|viewer/);
  });

  await context.test("search and term filters use live projections only", async () => {
    const sitemap = await queries.getBlogSitemapEntries();
    assert.equal(sitemap.length, 14);
    assert.ok(sitemap.every((entry) => entry.slug.startsWith('live-')));
    assert.equal((await queries.getBlogSitemapEntries(2)).length, 2);
    assert.deepEqual(await queries.getBlogSitemapEntries(0), []);
    assert.equal((await queries.listPublishedBlogPosts({ search: "quokka" })).items.length, 12);
    assert.equal((await queries.listPublishedBlogPosts({ search: "Secret" })).items.length, 0);
    assert.equal((await queries.listPublishedBlogPosts({ category: "current-category", tag: "current-tag" })).items.length, 12);
    assert.equal((await queries.listPublishedBlogPosts({ category: "unused-category" })).items.length, 0);
    assert.equal((await queries.listPublishedBlogPosts({ tag: "unused-tag" })).items.length, 0);
    assert.equal((await queries.listPublishedBlogPosts({ search: "' OR true --" })).items.length, 0);
  });

  await context.test("article reads use live documents and current term names; hidden routes return null", async () => {
    for (const slug of ["draft-only", "trashed", "unpublished", "missing"]) assert.equal(await queries.getPublishedBlogPost(slug), null);
    const post = await queries.getPublishedBlogPost("live-00");
    assert.equal(post.document.title, document.title);
    assert.deepEqual(post.document.category, { id: "category", label: "Current Category" });
    assert.deepEqual(post.document.tags, [{ id: "tag", label: "Current Tag" }]);
    assert.equal(post.tags[0].slug, "current-tag");
    assert.deepEqual(post.relatedToolLinks.map((tool) => tool.href), ["/devtools/json-formatter", "/paperwork/expense-report"]);
    assert.deepEqual(post.document.relatedToolIds, ["devtools.json-formatter", "paperwork.expense-report"]);
    assert.doesNotMatch(JSON.stringify(post), /Secret draft|viewer/);
    assert.deepEqual((await queries.listPublishedBlogTaxonomy("category")).items, [{ id: "category", name: "Current Category", slug: "current-category" }]);
    assert.deepEqual((await queries.listPublishedBlogTaxonomy("tag")).items, [{ id: "tag", name: "Current Tag", slug: "current-tag" }]);
  });

  await context.test("admin reads enforce permission and expose frozen snapshots separately from drafts", async () => {
    const reads = [
      (actor) => queries.listBlogPosts(actor), (actor) => queries.getBlogPost(actor, "live-00"),
      (actor) => queries.listBlogRevisions(actor, "live-00"),
      (actor) => queries.getBlogRevision(actor, "live-00", "revision-live-00"),
      (actor) => queries.listBlogTaxonomy(actor, "category"),
    ];
    for (const read of reads) await assert.rejects(() => read("denied"), /permission|denied/i);
    const post = await queries.getBlogPost("viewer", "live-00");
    assert.equal(post.draftDocument.title, "Secret draft title");
    const revision = await queries.getBlogRevision("viewer", "live-00", "revision-live-00");
    assert.equal(revision.document.title, document.title);
    assert.equal(revision.document.category.label, "Old Category");
    assert.equal(await queries.getBlogRevision("viewer", "live-01", "revision-live-00"), null);
    const history = await queries.listBlogRevisions("viewer", "live-00");
    assert.equal(history.items.length, 1);
    assert.equal(Object.hasOwn(history.items[0], "document"), false);
    const scheduled = await queries.listBlogPosts("viewer", { status: "scheduled" });
    assert.deepEqual(scheduled.items.map((row) => row.id), ["draft-only"]);
    assert.equal(scheduled.items[0].schedule.id, "schedule");
    assert.deepEqual((await queries.listBlogPosts("viewer", { status: "draft" })).items.map((row) => row.id), ["unpublished"]);
    assert.deepEqual((await queries.listBlogPosts("viewer", { status: "trash" })).items.map((row) => row.id), ["trashed"]);
    assert.equal((await queries.listBlogTaxonomy("viewer", "category")).items[0].createdBy, "viewer");
  });
});
