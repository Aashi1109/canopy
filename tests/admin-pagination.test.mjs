import assert from "node:assert/strict";
import test from "node:test";
import { adminPageHref, paginateAdminItems } from "../app/admin/(protected)/lib/pagination.ts";

const items = Array.from({ length: 61 }, (_, index) => index + 1);

test("admin lists return distinct pages and accurate totals", () => {
  const first = paginateAdminItems(items);
  const second = paginateAdminItems(items, "2");
  const last = paginateAdminItems(items, "3");
  assert.deepEqual(first.items, items.slice(0, 25));
  assert.deepEqual(second.items, items.slice(25, 50));
  assert.deepEqual(last.items, items.slice(50));
  assert.deepEqual([second.page, second.pageCount, second.total, second.start, second.end], [2, 3, 61, 26, 50]);
  assert.deepEqual([last.start, last.end], [51, 61]);
  assert.equal(paginateAdminItems(items.slice(0, 25)).pageCount, 1);
});

test("admin lists validate page values and clamp stale pages after filtering", () => {
  for (const value of [undefined, "", "0", "-2", "2.5", "2x", "Infinity", "9007199254740992"]) {
    assert.equal(paginateAdminItems(items, value).page, 1, String(value));
  }
  assert.equal(paginateAdminItems(items, ["2", "3"]).page, 2);
  assert.equal(paginateAdminItems(items, []).page, 1);
  assert.equal(paginateAdminItems(items, "100").page, 3);
  assert.deepEqual(paginateAdminItems(items.slice(0, 4), "3").items, [1, 2, 3, 4]);
  assert.deepEqual(paginateAdminItems([], "7"), { items: [], page: 1, pageCount: 1, total: 0, start: 0, end: 0 });
});

test("admin page links retain encoded filters and link directly to first and last pages", () => {
  const filters = { q: "Ada & Grace", role: "billing", unused: "", mode: "all" };
  const first = new URL(adminPageHref("/admin/users", 1, filters), "https://example.test");
  assert.equal(first.pathname, "/admin/users");
  assert.equal(first.searchParams.get("q"), filters.q);
  assert.equal(first.searchParams.get("role"), "billing");
  assert.equal(first.searchParams.has("unused"), false);
  assert.equal(first.searchParams.has("page"), false);
  assert.equal(first.searchParams.get("mode"), "all");
  assert.equal(new URL(adminPageHref("/admin/users", 3, filters), first).searchParams.get("page"), "3");
  assert.equal(adminPageHref("/admin/roles", 1), "/admin/roles");
});
