import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { transformSync } from "next/dist/build/swc/index.js";

const root = new URL("../", import.meta.url);
const fixture = { error: null, available: true };
globalThis.__paperworkApiErrors = fixture;
const moduleUrl = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const stubs = {
  "@smarttools/control-plane": `
    export async function getAvailableToolBySlug() {
      const fixture = globalThis.__paperworkApiErrors;
      if (fixture.error !== null) throw fixture.error;
      return fixture.available ? { componentKey: "invoice-generator" } : null;
    }
    export async function getAvailableTools() {
      const tool = await getAvailableToolBySlug();
      return tool ? [tool] : [];
    }
    export async function getPublishedTemplates() { return []; }
  `,
  "@smarttools/invoice-templates": `
    export const DocumentTypeSchema = { safeParse: data => ({success: data === "invoice", data}) };
    export const getDocumentDefinition = () => ({toolComponentKey: "invoice-generator"});
  `,
  "@/db": "export const db = {};",
  "@/db/schema": "export const keyValuePairTable = {}; export const vendorProfilesTable = {};",
  "@/db/bootstrap": "export async function ensureDatabaseBootstrapped() {} export async function ensureUserExists() {}",
  "@/lib/tool-framework/manifest": "export async function getToolManifest() { return {}; }",
};
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (stubs[specifier]) return { shortCircuit: true, url: moduleUrl(stubs[specifier]) };
    if (specifier === "../tool-framework/manifest") {
      return { shortCircuit: true, url: moduleUrl(stubs["@/lib/tool-framework/manifest"]) };
    }
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, root).href, context);
    if (specifier === "../_lib/input") {
      return nextResolve(new URL("app/api/paperwork/_lib/input.ts", root).href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === new URL("lib/paperwork/toolAccess.ts", root).href) {
      return {
        format: "module",
        shortCircuit: true,
        source: transformSync(readFileSync(new URL(url), "utf8"), {
          filename: new URL(url).pathname,
          jsc: { parser: { syntax: "typescript" } },
          module: { type: "es6" },
        }).code,
      };
    }
    return nextLoad(url, context);
  },
});
const templates = await import("../app/api/paperwork/templates/route.ts");
const storage = await import("../app/api/paperwork/storage/route.ts");
const storageKey = await import("../app/api/paperwork/storage/[key]/route.ts");
const vendors = await import("../app/api/paperwork/vendors/route.ts");
hooks.deregister();

const request = (path, body) =>
  new Request(
    `https://app.example/api/paperwork/${path}`,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
const operations = [
  ["templates", () => templates.GET(request("templates")), "Templates are temporarily unavailable."],
  [
    "storage save",
    () => storage.POST(request("storage", { key: "paperwork_kit_invoice_draft", value: {} })),
    "Storage is unavailable.",
  ],
  [
    "storage load",
    () =>
      storageKey.GET(request("storage/paperwork_kit_invoice_draft"), {
        params: Promise.resolve({ key: "paperwork_kit_invoice_draft" }),
      }),
    "Storage is unavailable.",
  ],
  ["vendor load", () => vendors.GET(request("vendors")), "Vendor storage is unavailable."],
  ["vendor save", () => vendors.POST(request("vendors", { vendors: [] })), "Vendor storage is unavailable."],
];

test.after(() => {
  delete globalThis.__paperworkApiErrors;
});

test("Paperwork APIs return the original message without the stack and retain fallback/status", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const [name, call, fallback] of operations) {
    fixture.error = new Error("Service connection timed out.");
    let response = await call();
    assert.equal(response.status, 500, name);
    assert.deepEqual(await response.json(), { error: fixture.error.message }, name);
    fixture.error = new Error(" ");
    response = await call();
    assert.equal(response.status, 500, name);
    assert.deepEqual(await response.json(), { error: fallback }, name);
  }
});

test("Paperwork access and input errors retain their original statuses and messages", async () => {
  fixture.error = null;
  fixture.available = false;
  for (const [name, call] of operations) {
    const response = await call();
    assert.equal(response.status, 404, name);
    assert.deepEqual(await response.json(), { error: "Tool not found." }, name);
  }
  const response = await vendors.POST(request("vendors", { vendors: "invalid" }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Vendor payload must contain a vendor array." });
  const oversized = await vendors.POST(
    new Request("https://app.example/api/paperwork/vendors", {
      method: "POST",
      headers: { "content-length": "4000000" },
    }),
  );
  assert.equal(oversized.status, 413);
  assert.deepEqual(await oversized.json(), { error: "API payload is too large." });
});
