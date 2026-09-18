import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const state = { failure: undefined, run: async () => ({ render: "text", text: "ok" }), captured: [] };
globalThis.__toolApiErrorsTest = state;
const routeRoot = new URL("../app/api/tools/", import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = (source) => ({ shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` });
    if (context.parentURL?.startsWith(routeRoot)) {
      if (specifier === "@sentry/core")
        return stub("export const captureException = error => globalThis.__toolApiErrorsTest.captured.push(error);");
      if (specifier === "next/server") return nextResolve("next/server.js", context);
      if (specifier === "@/lib/tool-framework/catalog")
        return stub("export async function getTools() { throw globalThis.__toolApiErrorsTest.failure; }");
      if (specifier === "@/lib/tool-framework/categories") return stub("export const TOOL_CATEGORIES = {};");
      if (specifier === "@/lib/tool-framework/icons") return stub("export const resolveIcon = () => null;");
      if (specifier === "@/lib/tool-framework/manifest") return stub("export const getToolManifest = async () => [];");
      if (specifier === "@/lib/admin/index.ts") return stub("export const getAvailableTools = async () => [];");
      if (specifier === "../../../../tools/test-error-tool/definition")
        return stub("export default { settings: { fields: {} } };");
      if (specifier === "../../../../tools/test-error-tool/run.server")
        return stub("export const run = (...args) => globalThis.__toolApiErrorsTest.run(...args);");
      if (specifier.startsWith("../../../../tools/test-module-error/"))
        return stub('throw new Error("Tool module dependency unavailable");');
      if (specifier.startsWith("../../../../tools/test-module-empty/")) return stub('throw new Error("");');
      if (specifier.startsWith("@/"))
        return nextResolve(
          new URL(`../${specifier.slice(2)}${specifier.endsWith(".ts") ? "" : ".ts"}`, import.meta.url).href,
          context,
        );
    }
    return nextResolve(specifier, context);
  },
});
test.after(() => {
  hooks.deregister();
  delete globalThis.__toolApiErrorsTest;
});
const { GET: search } = await import("../app/api/tools/search/route.ts");
const { GET: ecosystem } = await import("../app/api/tools/ecosystem/route.ts");
const { POST } = await import("../app/api/tools/[key]/route.ts");
const { ToolError } = await import("../lib/tool-framework/run.ts");
test.beforeEach(() => {
  state.captured = [];
});
const post = (
  request = new Request("https://app.test/api/tools/test-error-tool", { method: "POST", body: "{}" }),
  key = "test-error-tool",
) => POST(request, { params: Promise.resolve({ key }) });

for (const [name, call, fallback] of [
  ["search", () => search(new Request("https://app.test/api/tools/search?q=test")), "Unable to search tools"],
  ["ecosystem", ecosystem, "Unable to load tool categories"],
]) {
  test(`${name} returns the caught message without stack and falls back for empty errors`, async () => {
    for (const failure of [
      new Error("Catalog connection timed out"),
      { message: "Catalog connection timed out", stack: "private stack" },
      null,
      new Error(""),
    ]) {
      state.failure = failure;
      const response = await call();
      assert.equal(state.captured.at(-1), failure);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: failure?.message || fallback });
    }
  });
}

test("tool execution keeps codes and statuses while returning original messages or its fallback", async () => {
  for (const failure of [
    new Error("Upstream quota exceeded"),
    { message: "Upstream quota exceeded", stack: "private stack" },
    undefined,
    new Error(""),
  ]) {
    state.run = async () => {
      throw failure;
    };
    const response = await post();
    assert.equal(state.captured.at(-1), failure);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: {
        code: "processing-failed",
        message: failure?.message || "This tool could not finish. The input may be malformed or unsupported.",
      },
    });
  }
  state.run = async () => {
    throw new ToolError("unsupported-input", "Image is too large", "Choose a smaller image.");
  };
  const response = await post();
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: { code: "unsupported-input", message: "Image is too large", recovery: "Choose a smaller image." },
  });
  const invalid = await post(undefined, "../private");
  assert.equal(invalid.status, 404);
  assert.deepEqual(await invalid.json(), { error: { code: "unknown-tool", message: "This tool is not available." } });
  assert.equal(state.captured.length, 4, "expected tool errors are not reported");
});

test("JSON read failures preserve invalid-request status and error messages with a fallback", async () => {
  for (const failure of [new Error("Unexpected end of JSON input"), undefined]) {
    const request = new Request("https://app.test/api/tools/test-error-tool", { method: "POST", body: "{}" });
    request.json = async () => {
      throw failure;
    };
    const response = await post(request);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: { code: "invalid-request", message: failure?.message || "Request body must be JSON." },
    });
  }
  assert.deepEqual(state.captured, []);
});

test("module loading failures preserve unknown-tool status while returning the original message or fallback", async () => {
  for (const [key, message] of [
    ["test-module-error", "Tool module dependency unavailable"],
    ["test-module-empty", "This tool is not available."],
  ]) {
    const response = await post(undefined, key);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: { code: "unknown-tool", message } });
  }
  assert.deepEqual(state.captured, []);
});
