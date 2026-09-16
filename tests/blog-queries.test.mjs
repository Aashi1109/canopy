import assert from "node:assert/strict";
import test from "node:test";
import { BlogValidationError } from "../lib/blog/document.ts";
import {
  decodeBlogCursor,
  encodeBlogCursor,
  paginateBlogRows,
  getBlogPost,
  getBlogRevision,
  getPublishedBlogPost,
  listBlogPosts,
  listBlogRevisions,
  listBlogTaxonomy,
  listPublishedBlogPosts,
  listPublishedBlogTaxonomy,
} from "../lib/blog/queries.ts";

test("blog date cursors retain database microseconds and reject invalid or mismatched cursors", () => {
  const cursor = { kind: "published", value: "2026-09-16T10:00:00.123456Z", id: "post-1" };
  assert.deepEqual(decodeBlogCursor(encodeBlogCursor(cursor), "published"), cursor);
  assert.equal(decodeBlogCursor(undefined, "published"), null);
  assert.throws(() => decodeBlogCursor(encodeBlogCursor(cursor), "admin"), BlogValidationError);
  for (const input of ["", "!bad", "a".repeat(1201), Buffer.from("not json").toString("base64url")]) {
    assert.throws(() => decodeBlogCursor(input, "published"), /cursor/);
  }
  for (const value of [
    "2026-02-30T10:00:00.123456Z",
    "2026-09-16T10:00:00.123Z",
    "invalid",
    "0000-01-01T00:00:00.000000Z",
  ]) {
    assert.throws(() => encodeBlogCursor({ ...cursor, value }));
  }
  assert.throws(() => encodeBlogCursor({ ...cursor, id: "' OR true; --" }));
  assert.throws(
    () => decodeBlogCursor(Buffer.from(JSON.stringify({ ...cursor, extra: true })).toString("base64url"), "published"),
    /cursor/,
  );
});

test("keyset pagination emits a next cursor only when a further row exists", () => {
  const rows = Array.from({ length: 13 }, (_, index) => ({
    id: `post-${index}`,
    time: "2026-09-16T10:00:00.000001Z",
  }));
  const cursor = (row) => ({ kind: "published", value: row.time, id: row.id });
  assert.deepEqual(paginateBlogRows([], 12, cursor), { items: [], nextCursor: null });
  assert.equal(paginateBlogRows(rows.slice(0, 12), 12, cursor).nextCursor, null);
  const page = paginateBlogRows(rows, 12, cursor);
  assert.equal(page.items.length, 12);
  assert.equal(decodeBlogCursor(page.nextCursor, "published").id, "post-11");
  assert.equal(rows.length, 13);
});

test("taxonomy and revision cursors retain their own ordering and scope", () => {
  for (const kind of ["category", "tag"]) {
    const cursor = { kind, value: "Résumé & Guides", id: "term-1" };
    assert.deepEqual(decodeBlogCursor(encodeBlogCursor(cursor), kind), cursor);
  }
  const revision = { kind: "history", value: 12, id: "post-1" };
  assert.deepEqual(decodeBlogCursor(encodeBlogCursor(revision), "history"), revision);
  assert.throws(() => encodeBlogCursor({ ...revision, value: 0 }));
  assert.throws(() => encodeBlogCursor({ ...revision, value: 2.5 }));
  assert.throws(() => encodeBlogCursor({ kind: "category", value: "invalid\u0000name", id: "term-1" }));
  assert.throws(() => encodeBlogCursor({ kind: "tag", value: "\ud800", id: "term-1" }));
});

test("query boundaries reject malformed filters and IDs before opening a database connection", async () => {
  const operations = [
    () => listPublishedBlogPosts({ search: "x".repeat(201) }),
    () => listPublishedBlogPosts({ search: "invalid\u0000query" }),
    () => listBlogPosts("admin", { search: "\ud800" }),
    () => listBlogTaxonomy("admin", "category", { search: "\u0000" }),
    () => listPublishedBlogPosts({ category: "unsafe/category" }),
    () => listPublishedBlogPosts({ cursor: "bad-cursor" }),
    () => listPublishedBlogPosts({ limit: 100000 }),
    () => getPublishedBlogPost("../draft"),
    () => listBlogPosts("admin", { status: "everything" }),
    () => listBlogPosts("admin", { categoryId: "invalid id" }),
    () => getBlogPost("admin", ""),
    () => getBlogRevision("admin", "post", "../revision"),
    () => listBlogRevisions("admin", "post", encodeBlogCursor({ kind: "history", value: 1, id: "other-post" })),
    () => listBlogTaxonomy("admin", "author"),
    () => listPublishedBlogTaxonomy("category", { createdBy: "admin" }),
  ];
  for (const operation of operations) await assert.rejects(operation);
});
