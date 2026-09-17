import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import redis from "redis";
import { Cache, closeRedis } from "@canopy/cache";

test("catalog caches database data, preserves published content, and refreshes after invalidation", async (t) => {
  const catalogUrl = new URL("../lib/tool-framework/catalog.ts", import.meta.url).href;
  const date = new Date("2026-09-16T00:00:00Z");
  const fixture = {
    reads: 0,
    rows: [
      {
        toolId: "devtools.markdown-previewer",
        iconUrl: "https://example.test/markdown.png",
        app: "devtools",
        slug: "markdown-previewer",
        name: "Preview Markdown",
        description: "Live preview",
        order: 0,
        enabled: true,
        archived: false,
        createdAt: date,
        updatedAt: date,
      },
    ],
    content: [
      {
        toolId: "devtools.markdown-previewer",
        category: null,
        keywords: null,
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
  const variables = ["REDIS_URL"];
  const previous = variables.map((key) => process.env[key]);
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (context.parentURL === catalogUrl && specifier === "@canopy/database") {
        return {
          shortCircuit: true,
          url: `data:text/javascript,${encodeURIComponent(`
          const fixture = globalThis.__catalogCacheTest;
          export const managedToolsTable = {};
          export const isDatabaseConfigured = () => true;
          export const db = { select() { return { async from() {
            fixture.reads++;
            return structuredClone(fixture.rows);
          } }; } };
          export const getToolContentRows = async () => structuredClone(fixture.content);
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
  t.after(async () => {
    await closeRedis();
    hooks.deregister();
    delete globalThis.__catalogCacheTest;
    variables.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  });
  process.env.REDIS_URL = "redis://cache.example.test:6379";
  let cached = null;
  const catalogCache = new Cache("catalog");
  t.mock.method(redis, "createClient", () => ({
    isOpen: false,
    isReady: false,
    on() {
      return this;
    },
    async connect() {
      this.isOpen = this.isReady = true;
      return this;
    },
    async sendCommand(command) {
      assert.equal(command[1], "catalog:all");
      if (command[0] === "GET") return cached;
      if (command[0] === "DEL") cached = null;
      else {
        assert.equal(command[0], "SET");
        cached = command[2];
      }
      return 1;
    },
    destroy() {
      this.isOpen = this.isReady = false;
    },
  }));
  const { getTools, resolveToolPage } = await import(catalogUrl);
  const first = await getTools();
  assert.equal(first.length, 1);
  assert.equal(first[0].seoTitle, "Published title");
  assert.deepEqual(first[0].icon, { kind: "url", url: fixture.rows[0].iconUrl });
  assert.deepEqual(await getTools(), first);
  assert.equal(fixture.reads, 1, "cache hits avoid all catalog database reads");
  assert.equal((await resolveToolPage("devtools", "markdown-previewer")).name, "Preview Markdown");

  fixture.rows[0].name = "Updated name";
  fixture.rows[0].iconUrl = null;
  fixture.content[0].publishedAt = null;
  await catalogCache.delete("all");
  const updated = await getTools();
  assert.equal(updated[0].name, "Updated name");
  assert.equal(updated[0].icon.kind, "svg", "cleared icons use the generated fallback");
  assert.notEqual(updated[0].seoTitle, "Published title", "unpublished content cannot leak from cache");
  assert.equal(fixture.reads, 2);

  cached = "{broken";
  assert.equal((await getTools())[0].name, "Updated name");
  assert.equal(fixture.reads, 3);
  fixture.rows[0].enabled = false;
  await catalogCache.delete("all");
  assert.deepEqual(await getTools(), []);
});
