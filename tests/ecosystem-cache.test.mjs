import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import redis from "redis";
import { Cache, closeRedis } from "@canopy/cache";

test("ecosystem response reuses assembled data, refreshes after invalidation, and does not cache failures", async (t) => {
  const routeUrl = new URL("../app/api/tools/ecosystem/route.ts", import.meta.url).href;
  const fixture = { reads: 0, name: "Invoice Generator", failure: false };
  globalThis.__ecosystemCacheTest = fixture;
  const modules = {
    "@sentry/core": "export const captureException = () => {};",
    "@/lib/tool-framework/categories": `export const TOOL_CATEGORIES = {};`,
    "@/lib/tool-framework/catalog": `export const getTools = async () => [];`,
    "@/lib/tool-framework/icons": `export const resolveIcon = (_id, _name, iconUrl) => ({ kind: "url", url: iconUrl });`,
    "@/lib/tool-framework/manifest": `export const getToolManifest = async () => {
      const fixture = globalThis.__ecosystemCacheTest;
      fixture.reads++;
      if (fixture.failure) throw new Error("Database unavailable");
      return [];
    };`,
    "@canopy/control-plane": `export const getAvailableTools = async () => [{
      toolId: "paperwork.invoice-generator", slug: "invoice-generator",
      name: globalThis.__ecosystemCacheTest.name,
      iconUrl: "https://example.test/invoice.png",
    }];`,
    "@/utils/errorMessage": `export const errorMessage = (error) => error.message;`,
  };
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (context.parentURL === routeUrl && modules[specifier]) {
        return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(modules[specifier])}` };
      }
      return nextResolve(specifier, context);
    },
  });
  const variables = ["REDIS_URL"];
  const previous = variables.map((key) => process.env[key]);
  t.after(async () => {
    await closeRedis();
    hooks.deregister();
    delete globalThis.__ecosystemCacheTest;
    variables.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  });
  process.env.REDIS_URL = "redis://cache.example.test:6379";
  let cached = null;
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
      assert.equal(command[1], "ecosystem:all");
      if (command[0] === "GET") return cached;
      if (command[0] === "DEL") cached = null;
      else {
        assert.deepEqual(command.slice(3), ["EX", "300"]);
        cached = command[2];
      }
      return 1;
    },
    destroy() {
      this.isOpen = this.isReady = false;
    },
  }));
  const { GET } = await import(routeUrl);
  const first = await (await GET()).json();
  assert.equal(first.groups[0].tools[0].name, "Invoice Generator");
  assert.deepEqual(first.groups[0].tools[0].icon, { kind: "url", url: "https://example.test/invoice.png" });
  assert.deepEqual(await (await GET()).json(), first);
  assert.equal(fixture.reads, 1);

  fixture.name = "Updated Invoice Generator";
  await new Cache("ecosystem").delete("all");
  assert.equal((await (await GET()).json()).groups[0].tools[0].name, fixture.name);
  assert.equal(fixture.reads, 2);

  await new Cache("ecosystem").delete("all");
  fixture.failure = true;
  assert.equal((await GET()).status, 500);
  assert.equal(cached, null);
  fixture.failure = false;
  assert.equal((await GET()).status, 200);
  assert.equal(fixture.reads, 4);

  delete process.env.REDIS_URL;
  assert.equal((await GET()).status, 200, "navigation still loads without Redis");
  assert.equal(fixture.reads, 5);
});
