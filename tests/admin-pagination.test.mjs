import { expect, test } from "vitest";
import { adminPageHref, paginateAdminItems } from "../app/admin/(protected)/lib/pagination.ts";

const items = Array.from({ length: 61 }, (_, index) => index + 1);

test("admin lists return distinct pages and accurate totals", () => {
  const first = paginateAdminItems(items);
  const second = paginateAdminItems(items, "2");
  const last = paginateAdminItems(items, "3");
  expect(first.items).toEqual(items.slice(0, 25));
  expect(second.items).toEqual(items.slice(25, 50));
  expect(last.items).toEqual(items.slice(50));
  expect([second.page, second.pageCount, second.total, second.start, second.end]).toEqual([2, 3, 61, 26, 50]);
  expect([last.start, last.end]).toEqual([51, 61]);
  expect(paginateAdminItems(items.slice(0, 25)).pageCount).toBe(1);
});

test("admin lists validate page values and clamp stale pages after filtering", () => {
  for (const value of [undefined, "", "0", "-2", "2.5", "2x", "Infinity", "9007199254740992"]) {
    expect(paginateAdminItems(items, value).page, String(value)).toBe(1);
  }
  expect(paginateAdminItems(items, ["2", "3"]).page).toBe(2);
  expect(paginateAdminItems(items, []).page).toBe(1);
  expect(paginateAdminItems(items, "100").page).toBe(3);
  expect(paginateAdminItems(items.slice(0, 4), "3").items).toEqual([1, 2, 3, 4]);
  expect(paginateAdminItems([], "7")).toEqual({ items: [], page: 1, pageCount: 1, total: 0, start: 0, end: 0 });
});

test("admin page links retain encoded filters and link directly to first and last pages", () => {
  // An IP host has no subdomains, so appHref is a no-op and the raw admin path
  // is preserved — this isolates the filter/page encoding from subdomain routing.
  const previous = process.env.APP_URL;
  process.env.APP_URL = "https://10.0.0.1";
  try {
    const filters = { q: "Ada & Grace", role: "billing", unused: "", mode: "all" };
    const first = new URL(adminPageHref("/admin/users", 1, filters), "https://example.test");
    expect(first.pathname).toBe("/admin/users");
    expect(first.searchParams.get("q")).toBe(filters.q);
    expect(first.searchParams.get("role")).toBe("billing");
    expect(first.searchParams.has("unused")).toBe(false);
    expect(first.searchParams.has("page")).toBe(false);
    expect(first.searchParams.get("mode")).toBe("all");
    expect(new URL(adminPageHref("/admin/users", 3, filters), first).searchParams.get("page")).toBe("3");
    expect(adminPageHref("/admin/roles", 1)).toBe("/admin/roles");
  } finally {
    if (previous === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previous;
  }
});

test("admin pagination derives clean subdomain URLs from APP_URL and preserves filters", () => {
  const previous = process.env.APP_URL;
  process.env.APP_URL = "https://example.test";
  try {
    const destination = new URL(adminPageHref("/admin/users", 2, { q: "Ada & Grace", role: "editor" }));
    expect(destination.origin).toBe("https://admin.example.test");
    expect(destination.pathname).toBe("/users");
    expect(destination.searchParams.get("q")).toBe("Ada & Grace");
    expect(destination.searchParams.get("role")).toBe("editor");
    expect(destination.searchParams.get("page")).toBe("2");
    expect(adminPageHref("/admin/roles", 1)).toBe("https://admin.example.test/roles");
  } finally {
    if (previous === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previous;
  }
});
