import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { getBlogSitemapEntries } from "../lib/blog/queries.ts";

const sourceUrl = new URL("../app/sitemap.ts", import.meta.url).href;
const state = { tools: [], posts: [], toolsError: false, postsError: false, limits: [] };
globalThis.__blogSitemapTest = state;
const moduleUrl = (source) => ({
  shortCircuit: true,
  url: `data:text/javascript,${encodeURIComponent(source)}`,
});
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL === sourceUrl) {
      if (specifier === "@/lib/tool-framework/catalog")
        return moduleUrl(`
        export async function getPublicTools() {
          const state = globalThis.__blogSitemapTest;
          if (state.toolsError) throw new Error("Tool catalog unavailable");
          return state.tools;
        }
      `);
      if (specifier === "@/lib/blog/queries")
        return moduleUrl(`
        export async function getBlogSitemapEntries(limit) {
          const state = globalThis.__blogSitemapTest;
          state.limits.push(limit);
          if (state.postsError) throw new Error("Blog catalog unavailable");
          return state.posts.slice(0, limit);
        }
      `);
    }
    if (specifier === "@/lib/config/config.ts")
      return next(new URL("../lib/config/config.ts", import.meta.url).href, context);
    return next(specifier, context);
  },
});
const { default: sitemap } = await import(sourceUrl);
hooks.deregister();
const originalUrl = process.env.APP_URL;
test.beforeEach(() => {
  Object.assign(state, { tools: [], posts: [], toolsError: false, postsError: false, limits: [] });
  process.env.APP_URL = "https://smarttools.example";
});
test.after(() => {
  if (originalUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = originalUrl;
  delete globalThis.__blogSitemapTest;
});

test("sitemap preserves tool entries and adds blog publication timestamps and canonical URLs", async () => {
  const publishedUpdatedAt = new Date("2026-09-16T10:00:00Z");
  state.tools = [{ href: "/devtools/json-formatter" }, { href: "/paperwork/invoice-generator" }];
  state.posts = [{ slug: "using-json", publishedUpdatedAt }];
  assert.deepEqual(await sitemap(), [
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
  assert.deepEqual(state.limits, [49998]);
});

test("either catalog can fail independently without losing the other catalog's URLs", async () => {
  state.tools = [{ href: "/media/image-converter" }];
  state.posts = [{ slug: "images", publishedUpdatedAt: new Date("2026-09-16T10:00:00Z") }];
  state.postsError = true;
  assert.deepEqual(
    (await sitemap()).map((entry) => entry.url),
    ["https://smarttools.example/media/image-converter"],
  );
  state.postsError = false;
  state.toolsError = true;
  assert.deepEqual(
    (await sitemap()).map((entry) => entry.url),
    ["https://smarttools.example/blog/images"],
  );
  state.postsError = true;
  assert.deepEqual(await sitemap(), []);
});

test("sitemap bounds the combined catalog to 50,000 URLs and reserves existing tool capacity", async () => {
  state.tools = Array.from({ length: 49999 }, (_, index) => ({ href: `/devtools/tool-${index}` }));
  state.posts = [
    { slug: "first", publishedUpdatedAt: new Date() },
    { slug: "second", publishedUpdatedAt: new Date() },
  ];
  const entries = await sitemap();
  assert.equal(entries.length, 50000);
  assert.equal(entries.at(-1).url, "https://smarttools.example/blog/first");
  assert.deepEqual(state.limits, [1]);
  state.tools.push({ href: "/devtools/extra-a" }, { href: "/devtools/extra-b" });
  assert.equal((await sitemap()).length, 50000);
  assert.equal(state.limits.at(-1), 0);
});

test("sitemap retains the local APP_URL fallback and handles empty catalogs", async () => {
  assert.deepEqual(await sitemap(), []);
  delete process.env.APP_URL;
  state.tools = [{ href: "/paperwork/invoice-generator" }];
  assert.equal((await sitemap())[0].url, "http://localhost:3000/paperwork/invoice-generator");
});

test("sitemap query rejects unbounded limits and returns zero capacity without database work", async () => {
  assert.deepEqual(await getBlogSitemapEntries(0), []);
  for (const value of [-1, 50001, 1.5, Infinity, NaN, "10", null]) {
    await assert.rejects(() => getBlogSitemapEntries(value));
  }
});
