import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

test("global search matches the public catalog including Paperwork and preserves its response contract", async (t) => {
  const routeUrl = new URL("../app/api/tools/search/route.ts", import.meta.url).href;
  const tools = [
    {
      app: "paperwork",
      category: "Documents",
      categoryKey: null,
      description: "Create bills for clients",
      href: "/paperwork/invoice-generator",
      icon: { kind: "url", url: "https://example.test/invoice.png" },
      keywords: ["receipt", "billing"],
      name: "Invoice Generator",
      toolId: "paperwork.invoice-generator",
    },
    ...Array.from({ length: 8 }, (_, index) => ({
      app: "devtools",
      category: "Text Tools",
      categoryKey: "text-tools",
      description: "Manipulate text",
      href: `/devtools/text-${index}`,
      icon: { kind: "svg", svg: "<svg/>" },
      keywords: ["words"],
      name: `Text ${index}`,
      toolId: `devtools.text-${index}`,
    })),
  ];
  const state = { tools, reads: 0, failure: false };
  globalThis.__toolSearchTest = state;
  const modules = {
    "@sentry/core": "export const captureException = () => {};",
    "@/lib/tool-framework/catalog": `export const getPublicTools = async () => {
      const state = globalThis.__toolSearchTest;
      state.reads++;
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
          return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
      }
      return nextResolve(specifier, context);
    },
  });
  t.after(() => {
    hooks.deregister();
    delete globalThis.__toolSearchTest;
  });
  const { GET } = await import(routeUrl);
  const search = (query) =>
    GET(
      new Request(`https://app.test/api/tools/search${query === undefined ? "" : `?q=${encodeURIComponent(query)}`}`),
    );
  for (const query of [undefined, "", "   "]) {
    assert.deepEqual(await (await search(query)).json(), { results: [] });
  }
  assert.equal(state.reads, 0, "empty searches do not load the catalog");

  const { category, description, href, icon, name, toolId } = tools[0];
  for (const query of ["  INVOICE  ", "bills", "DOCUMENTS", "receipt"]) {
    assert.deepEqual(await (await search(query)).json(), {
      results: [{ category, description, href, icon, name, toolId }],
    });
  }
  const limited = await (await search("text")).json();
  assert.deepEqual(
    limited.results.map((tool) => tool.toolId),
    tools.slice(1, 7).map((tool) => tool.toolId),
  );
  assert.deepEqual(await (await search("does not exist")).json(), { results: [] });
  state.failure = true;
  const failed = await search("invoice");
  assert.equal(failed.status, 500);
  assert.deepEqual(await failed.json(), { error: "Database unavailable" });
  state.failure = false;
  assert.equal((await search("invoice")).status, 200);
});
