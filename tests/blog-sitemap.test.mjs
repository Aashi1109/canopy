import { afterAll, beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ tools: [], posts: [], toolsError: false, postsError: false, limits: [] }));
globalThis.__blogSitemapTest = state;

vi.mock("@/lib/tool-framework/catalog", () => ({
  getPublicTools: async () => {
    if (state.toolsError) throw new Error("Tool catalog unavailable");
    return state.tools;
  },
}));
vi.mock("@/lib/blog/queries", () => ({
  getBlogSitemapEntries: async (limit) => {
    state.limits.push(limit);
    if (state.postsError) throw new Error("Blog catalog unavailable");
    return state.posts.slice(0, limit);
  },
}));

const { default: sitemap } = await import("@/app/sitemap.ts");
const originalUrl = process.env.APP_URL;
beforeEach(() => {
  Object.assign(state, { tools: [], posts: [], toolsError: false, postsError: false, limits: [] });
  process.env.APP_URL = "https://smarttools.example";
});
afterAll(() => {
  if (originalUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = originalUrl;
  delete globalThis.__blogSitemapTest;
});

test("sitemap preserves tool entries and adds blog publication timestamps and canonical URLs", async () => {
  const publishedUpdatedAt = new Date("2026-09-16T10:00:00Z");
  state.tools = [{ href: "/devtools/json-formatter" }, { href: "/paperwork/invoice-generator" }];
  state.posts = [{ slug: "using-json", publishedUpdatedAt }];
  expect(await sitemap()).toEqual([
    {
      url: "https://smarttools.example/devtools/json-formatter",
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: "https://smarttools.example/paperwork/invoice-generator",
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: "https://smarttools.example/blog/using-json",
      lastModified: publishedUpdatedAt,
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ]);
  expect(state.limits).toEqual([49998]);
});

test("either catalog can fail independently without losing the other catalog's URLs", async () => {
  state.tools = [{ href: "/media/image-converter" }];
  state.posts = [{ slug: "images", publishedUpdatedAt: new Date("2026-09-16T10:00:00Z") }];
  state.postsError = true;
  expect((await sitemap()).map((entry) => entry.url)).toEqual(["https://smarttools.example/media/image-converter"]);
  state.postsError = false;
  state.toolsError = true;
  expect((await sitemap()).map((entry) => entry.url)).toEqual(["https://smarttools.example/blog/images"]);
  state.postsError = true;
  expect(await sitemap()).toEqual([]);
});

test("sitemap bounds the combined catalog to 50,000 URLs and reserves existing tool capacity", async () => {
  state.tools = Array.from({ length: 49999 }, (_, index) => ({ href: `/devtools/tool-${index}` }));
  state.posts = [
    { slug: "first", publishedUpdatedAt: new Date() },
    { slug: "second", publishedUpdatedAt: new Date() },
  ];
  const entries = await sitemap();
  expect(entries.length).toBe(50000);
  expect(entries.at(-1).url).toBe("https://smarttools.example/blog/first");
  expect(state.limits).toEqual([1]);
  state.tools.push({ href: "/devtools/extra-a" }, { href: "/devtools/extra-b" });
  expect((await sitemap()).length).toBe(50000);
  expect(state.limits.at(-1)).toBe(0);
});

test("sitemap retains the local APP_URL fallback and handles empty catalogs", async () => {
  expect(await sitemap()).toEqual([]);
  delete process.env.APP_URL;
  state.tools = [{ href: "/paperwork/invoice-generator" }];
  expect((await sitemap())[0].url).toBe("http://localhost:3000/paperwork/invoice-generator");
});

test("sitemap query rejects unbounded limits and returns zero capacity without database work", async () => {
  const { getBlogSitemapEntries } = await vi.importActual("@/lib/blog/queries");
  expect(await getBlogSitemapEntries(0)).toEqual([]);
  for (const value of [-1, 50001, 1.5, Infinity, NaN, "10", null]) {
    await expect(getBlogSitemapEntries(value)).rejects.toThrow();
  }
}, 45000); // importActual loads the real query/db layer, which is slow to initialize under parallel load
