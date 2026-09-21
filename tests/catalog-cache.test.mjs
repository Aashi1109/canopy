import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import redis from "redis";
import { catalogCache } from "../lib/tool-framework/catalogCache.ts";

test("separately loaded server modules share catalog storage and invalidation", async (t) => {
  const { catalogCache: separateModuleCache } = await import("../lib/tool-framework/catalogCache.ts?separate-bundle");
  t.after(() => catalogCache.clear());
  const snapshot = { tools: [], paperworkTools: [], publicTools: [] };
  catalogCache.set("all", snapshot);
  assert.equal(separateModuleCache.get("all"), snapshot);
  separateModuleCache.clear();
  assert.equal(catalogCache.has("all"), false);
});

test("public catalog caches resolved tools across ecosystems and refreshes on invalidation or expiry", async (t) => {
  const catalogUrl = new URL("../lib/tool-framework/catalog.ts", import.meta.url).href;
  const date = new Date("2026-09-16T00:00:00Z");
  const row = (app, key, changes = {}) => ({
    toolId: `${app}.${key}`,
    app,
    slug: key,
    name: key,
    description: "Public tool",
    order: 0,
    enabled: true,
    archived: false,
    iconUrl: null,
    createdAt: date,
    updatedAt: date,
    ...changes,
  });
  const fixture = {
    reads: 0,
    contentReads: 0,
    failure: false,
    configured: true,
    rows: [
      row("devtools", "markdown-previewer", { name: "Preview Markdown", iconUrl: "https://example.test/markdown.png" }),
      row("paperwork", "invoice-generator", { name: "Invoice Generator", slug: "custom-invoice" }),
      row("paperwork", "receipt-generator", { order: 2 }),
      row("paperwork", "disabled", { enabled: false }),
      row("paperwork", "archived", { archived: true }),
      row("paperwork", "no-slug", { slug: null }),
      row("paperwork", "reserved", { slug: "api" }),
      row("devtools", "not-shipped"),
    ],
    content: [
      {
        toolId: "devtools.markdown-previewer",
        category: null,
        keywords: ["published-keyword"],
        seoTitle: "Published title",
        seoDescription: null,
        contentDoc: null,
        docVersion: 1,
        publishedAt: date,
        updatedAt: date,
      },
    ],
  };
  globalThis.__catalogCacheTest = fixture;
  const previousRedis = process.env.REDIS_URL;
  process.env.REDIS_URL = "redis://cache.example.test:6379";
  let redisCalls = 0;
  t.mock.method(redis, "createClient", () => {
    redisCalls++;
    throw new Error("Public reads must not use Redis");
  });
  let now = 0;
  t.mock.method(Date, "now", () => now);
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (context.parentURL === catalogUrl && specifier === "../../db/index.ts") {
        return {
          shortCircuit: true,
          url: `data:text/javascript,${encodeURIComponent(`
          const fixture = globalThis.__catalogCacheTest;
          export const managedToolsTable = {};
          export const isDatabaseConfigured = () => fixture.configured;
          export const db = { select() { return { async from() {
            fixture.reads++;
            if (fixture.failure) throw new Error("Database unavailable");
            return structuredClone(fixture.rows);
          } }; } };
          export const getToolContentRows = async () => { fixture.contentReads++; return structuredClone(fixture.content); };
        `)}`,
        };
      }
      if (
        specifier.startsWith(".") &&
        !/\.[a-z]+$/i.test(specifier) &&
        context.parentURL?.includes("/lib/tool-framework/")
      ) {
        return nextResolve(new URL(`${specifier}.ts`, context.parentURL).href, context);
      }
      return nextResolve(specifier, context);
    },
  });
  t.after(() => {
    catalogCache.clear();
    hooks.deregister();
    delete globalThis.__catalogCacheTest;
    if (previousRedis === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousRedis;
  });
  const { getTools, getPublicTools, getPaperworkTools, resolveToolPage, relatedTools } = await import(catalogUrl);
  const [first, publicTools, paperwork] = await Promise.all([getTools(), getPublicTools(), getPaperworkTools()]);
  assert.equal(first.length, 1);
  assert.equal(first[0].seoTitle, "Published title");
  assert.deepEqual(first[0].icon, { kind: "url", url: fixture.rows[0].iconUrl });
  assert.equal(await getTools(), first, "the resolved catalog itself is reused");
  assert.equal(await getPublicTools(), publicTools);
  assert.equal(fixture.reads, 1, "concurrent consumers share one database load");
  assert.equal(fixture.contentReads, 1);
  assert.deepEqual(
    paperwork.map((tool) => tool.componentKey),
    ["invoice-generator", "receipt-generator"],
  );
  assert.equal(publicTools.length, 3, "unavailable, invalid and unshipped tools are excluded");
  const invoice = publicTools.find((tool) => tool.toolId === "paperwork.invoice-generator");
  assert.equal(invoice.href, "/paperwork/custom-invoice");
  assert.equal(invoice.category, "Documents");
  assert.equal(invoice.categoryKey, null);
  assert.deepEqual(publicTools[0].keywords, ["published-keyword"]);
  assert.equal((await resolveToolPage("devtools", "markdown-previewer")).name, "Preview Markdown");
  assert.deepEqual(await relatedTools(first[0].toolId), []);
  assert.equal(fixture.reads, 1);

  fixture.rows[0].name = "Updated name";
  fixture.rows[0].iconUrl = null;
  fixture.content[0].publishedAt = null;
  fixture.rows[1].name = "Updated Invoice";
  assert.equal((await getTools())[0].name, "Preview Markdown");
  catalogCache.clear();
  const updated = await getTools();
  assert.equal(updated[0].name, "Updated name");
  assert.equal(updated[0].icon.kind, "svg");
  assert.notEqual(updated[0].seoTitle, "Published title", "unpublished content cannot leak from cache");
  assert.equal((await getPublicTools()).find((tool) => tool.toolId === invoice.toolId).name, "Updated Invoice");
  assert.equal(fixture.reads, 2);

  now = 24 * 60 * 60 * 1_000 - 1;
  await getPublicTools();
  assert.equal(fixture.reads, 2, "snapshot lives for the full 24-hour TTL");
  now++;
  fixture.rows[0].enabled = false;
  assert.deepEqual(await getTools(), []);
  assert.equal((await getPublicTools()).length, 2);
  assert.equal(fixture.reads, 3);

  catalogCache.clear();
  fixture.failure = true;
  await assert.rejects(getPublicTools, /Database unavailable/);
  fixture.failure = false;
  assert.equal((await getPublicTools()).length, 2, "failed loads can be retried");
  assert.equal(fixture.reads, 5);
  assert.equal(redisCalls, 0, "public reads never contact Redis even when configured");

  catalogCache.clear();
  fixture.configured = false;
  assert.deepEqual(await getPublicTools(), []);
  assert.equal(fixture.reads, 5);
  fixture.configured = true;
  assert.equal((await getPublicTools()).length, 2, "missing configuration is not cached");
});
