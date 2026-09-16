import assert from "node:assert/strict";
import test from "node:test";
import { blogListingHref, parseBlogFilters } from "../app/blog/lib/filters.ts";

test("blog URL filters normalize blank values and reject ambiguous or malformed inputs", () => {
  assert.deepEqual(
    parseBlogFilters({ search: "  useful guide  ", category: "", ignored: "tracking" }),
    {
      search: "useful guide",
      category: undefined,
      tag: undefined,
      cursor: undefined,
      categoryCursor: undefined,
    },
  );
  for (const input of [
    { search: ["a", "b"] },
    { search: "x".repeat(201) },
    { search: "bad\u0000text" },
    { category: "../admin" },
    { tag: "bad slug" },
    { cursor: "x".repeat(1201) },
  ]) {
    assert.throws(() => parseBlogFilters(input));
  }
});

test("blog links retain active filters, encode text, and allow resetting pagination", () => {
  const filters = {
    search: "PDF & images",
    category: "guides",
    tag: "pdf",
    cursor: "cursor",
    categoryCursor: "terms",
  };
  const next = new URL(blogListingHref(filters, { cursor: "next" }), "https://example.test");
  assert.equal(next.searchParams.get("search"), "PDF & images");
  assert.equal(next.searchParams.get("category"), "guides");
  assert.equal(next.searchParams.get("tag"), "pdf");
  assert.equal(next.searchParams.get("cursor"), "next");
  assert.equal(
    new URL(
      blogListingHref(filters, { category: undefined, cursor: undefined }),
      "https://example.test",
    ).searchParams.has("cursor"),
    false,
  );
  assert.equal(blogListingHref({}), "/blog");
});
