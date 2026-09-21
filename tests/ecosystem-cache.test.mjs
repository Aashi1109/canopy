import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { TOOL_CATEGORIES } from "../lib/tool-framework/categories.ts";

test("ecosystem groups use the public catalog, preserve previews and counts, and recover from failures", async (t) => {
  const routeUrl = new URL("../app/api/tools/ecosystem/route.ts", import.meta.url).href;
  const tools = ["paperwork", "devtools", "media"].flatMap((app) =>
    Array.from({ length: 5 }, (_, index) => ({
      app,
      categoryKey: app === "paperwork" ? null : app === "devtools" ? "text-tools" : "image-editing",
      href: `/${app}/tool-${index}`,
      icon: { kind: "url", url: `https://example.test/${app}-${index}.png` },
      name: `${app} tool ${index}`,
      toolId: `${app}.tool-${index}`,
    })),
  );
  const state = { tools, failure: false };
  globalThis.__ecosystemCacheTest = state;
  const modules = {
    "@sentry/core": "export const captureException = () => {};",
    "@/lib/tool-framework/catalog": `export const getPublicTools = async () => {
      const state = globalThis.__ecosystemCacheTest;
      if (state.failure) throw new Error("Database unavailable");
      return state.tools;
    };`,
  };
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (context.parentURL === routeUrl) {
        if (modules[specifier])
          return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(modules[specifier])}` };
        if (specifier.startsWith("@/"))
          return nextResolve(
            new URL(`../${specifier.slice(2)}${specifier.endsWith(".ts") ? "" : ".ts"}`, import.meta.url).href,
            context,
          );
      }
      return nextResolve(specifier, context);
    },
  });
  t.after(() => {
    hooks.deregister();
    delete globalThis.__ecosystemCacheTest;
  });
  const { GET } = await import(routeUrl);
  const { groups } = await (await GET()).json();
  assert.deepEqual(
    groups.map(({ id }) => id),
    ["documents", "developer", "media"],
  );
  for (const [index, app] of ["paperwork", "devtools", "media"].entries()) {
    const matching = tools.filter((tool) => tool.app === app);
    assert.equal(groups[index].count, 5);
    assert.equal(groups[index].href, `/${app}`);
    assert.deepEqual(
      groups[index].tools,
      matching.slice(0, app === "paperwork" ? 5 : 4).map(({ href, icon, name, toolId }) => ({
        href,
        icon,
        name,
        toolId,
      })),
    );
    assert.deepEqual(
      groups[index].categories,
      Object.entries(TOOL_CATEGORIES)
        .filter(([, category]) => category.app === app)
        .map(([key, category]) => ({
          count: matching.filter((tool) => tool.categoryKey === key).length,
          href: `/${app}?category=${encodeURIComponent(key)}`,
          label: category.label,
        })),
    );
  }

  state.tools = [];
  assert.ok((await (await GET()).json()).groups.every((group) => group.count === 0 && group.tools.length === 0));
  state.failure = true;
  const failed = await GET();
  assert.equal(failed.status, 500);
  assert.deepEqual(await failed.json(), { error: "Database unavailable" });
  state.failure = false;
  state.tools = tools;
  assert.deepEqual(await (await GET()).json(), { groups });
});
