import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const manifestUrl = new URL("../lib/tool-framework/manifest.ts", import.meta.url).href;
const fixture = { configured: true, rows: [], content: [], queries: 0 };
globalThis.__smarttoolsDraftTest = fixture;
const moduleUrl = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === manifestUrl) {
      if (specifier === "@smarttools/database") {
        return {
          shortCircuit: true,
          url: moduleUrl(`
          const fixture = globalThis.__smarttoolsDraftTest;
          export const managedToolsTable = {};
          export const isDatabaseConfigured = () => fixture.configured;
          export const db = { select() { return { async from() {
            fixture.queries++;
            return fixture.rows;
          } }; } };
          export async function getToolContentRows() {
            fixture.queries++;
            return fixture.content;
          }
        `),
        };
      }
      if (specifier === "./catalog") {
        return {
          shortCircuit: true,
          url: moduleUrl(`
          export const definitionKeyOf = (id) => id.split(".")[1];
          export const loadSpec = async () => null;
        `),
        };
      }
      if (specifier === "./categories") {
        return nextResolve(
          new URL("../lib/tool-framework/categories.ts", import.meta.url).href,
          context,
        );
      }
    }
    return nextResolve(specifier, context);
  },
});
const { getAdminTools } = await import(manifestUrl);
hooks.deregister();

test("admin drafts match unpublished content by tool ID and require a configured database", async (t) => {
  t.after(() => {
    delete globalThis.__smarttoolsDraftTest;
  });
  const cases = [
    ["seed", {}, false],
    ["category", { category: "json-tools" }, true],
    ["title", { seoTitle: "Draft title" }, true],
    ["description", { seoDescription: "Draft description" }, true],
    ["keywords", { keywords: ["draft"] }, true],
    ["document", { contentDoc: { version: 1, howToUse: ["Upload a file"] } }, true],
    ["published", { seoTitle: "Published title", publishedAt: new Date() }, false],
    ["cleared", { category: " ", seoTitle: "", seoDescription: "\t", keywords: [] }, false],
    ["blank-keywords", { keywords: ["", " "] }, false],
    ["missing", null, false],
  ];
  fixture.rows = cases.map(([name], order) => ({
    toolId: `paperwork.${name}`,
    app: "paperwork",
    slug: name,
    name,
    description: name,
    order,
    enabled: true,
    archived: false,
  }));
  fixture.content = cases
    .filter(([, content]) => content !== null)
    .map(([name, content]) => ({
      toolId: `paperwork.${name}`,
      category: null,
      keywords: null,
      seoTitle: null,
      seoDescription: null,
      contentDoc: null,
      docVersion: 1,
      publishedAt: null,
      updatedAt: new Date(),
      ...content,
    }));
  fixture.content.unshift({
    toolId: "media.missing",
    seoTitle: "Another tool's draft",
    publishedAt: null,
  });
  assert.deepEqual(
    (await getAdminTools()).map(({ id, hasDraftContent }) => [id, hasDraftContent]),
    cases.map(([name, , expected]) => [`paperwork.${name}`, expected]),
  );

  fixture.configured = false;
  const queries = fixture.queries;
  assert.deepEqual(await getAdminTools(), []);
  assert.equal(fixture.queries, queries, "unconfigured database is never queried");
});
