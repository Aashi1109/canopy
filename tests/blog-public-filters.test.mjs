import { test, expect } from "vitest";
import { blogListingHref, parseBlogFilters } from "../app/blog/lib/filters.ts";

test("blog URL filters normalize blank values and reject ambiguous or malformed inputs", () => {
  expect(parseBlogFilters({ search: "  useful guide  ", category: "", ignored: "tracking" })).toEqual({
    search: "useful guide",
    category: undefined,
    tag: undefined,
    cursor: undefined,
    categoryCursor: undefined,
  });
  for (const input of [
    { search: ["a", "b"] },
    { search: "x".repeat(201) },
    { search: "bad\u0000text" },
    { category: "../admin" },
    { tag: "bad slug" },
    { cursor: "x".repeat(1201) },
  ]) {
    expect(() => parseBlogFilters(input)).toThrow();
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
  expect(next.searchParams.get("search")).toBe("PDF & images");
  expect(next.searchParams.get("category")).toBe("guides");
  expect(next.searchParams.get("tag")).toBe("pdf");
  expect(next.searchParams.get("cursor")).toBe("next");
  expect(
    new URL(
      blogListingHref(filters, { category: undefined, cursor: undefined }),
      "https://example.test",
    ).searchParams.has("cursor"),
  ).toBe(false);
  expect(blogListingHref({})).toBe("/blog");
});
