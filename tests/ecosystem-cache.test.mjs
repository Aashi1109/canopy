import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import axios from "axios";
import { Cache } from "@canopy/cache";

test("ecosystem response reuses assembled data, refreshes after invalidation, and does not cache failures", async (t) => {
  const routeUrl = new URL("../app/api/tools/ecosystem/route.ts", import.meta.url).href;
  const fixture = { reads: 0, name: "Invoice Generator", failure: false };
  globalThis.__ecosystemCacheTest = fixture;
  const modules = {
    "@/lib/tool-framework/categories": `export const TOOL_CATEGORIES = {};`,
    "@/lib/tool-framework/catalog": `export const getTools = async () => [];`,
    "@/lib/tool-framework/icons": `export const resolveIcon = (_id, _name, icon) => icon;`,
    "@/lib/tool-framework/manifest": `export const getToolManifest = async () => {
      const fixture = globalThis.__ecosystemCacheTest;
      fixture.reads++;
      if (fixture.failure) throw new Error("Database unavailable");
      return [];
    };`,
    "@canopy/control-plane": `export const getAvailableTools = async () => [{
      toolId: "paperwork.invoice-generator", slug: "invoice-generator",
      name: globalThis.__ecosystemCacheTest.name,
    }];`,
    "@canopy/database": `export const getToolIcons = async () => ({
      "paperwork.invoice-generator": { kind: "lucide", name: "Receipt" },
    });`,
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
  const variables = ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];
  const previous = variables.map((key) => process.env[key]);
  t.after(() => {
    hooks.deregister();
    delete globalThis.__ecosystemCacheTest;
    variables.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  });
  process.env.UPSTASH_REDIS_REST_URL = "https://cache.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  let cached = null;
  t.mock.method(axios, "post", async (_url, command) => {
    assert.equal(command[1], "ecosystem:all");
    if (command[0] === "GET") return { data: { result: cached } };
    if (command[0] === "DEL") cached = null;
    else {
      assert.deepEqual(command.slice(3), ["EX", "300"]);
      cached = command[2];
    }
    return { data: { result: 1 } };
  });
  const { GET } = await import(routeUrl);
  const first = await (await GET()).json();
  assert.equal(first.groups[0].tools[0].name, "Invoice Generator");
  assert.deepEqual(first.groups[0].tools[0].icon, { kind: "lucide", name: "Receipt" });
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

  delete process.env.UPSTASH_REDIS_REST_URL;
  assert.equal((await GET()).status, 200, "navigation still loads without Redis");
  assert.equal(fixture.reads, 5);
});
