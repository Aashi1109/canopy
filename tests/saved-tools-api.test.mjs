import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
const state = { session: null, ids: [], calls: [], failure: false };
globalThis.__savedToolsApiTest = state;
const routeRoot = new URL("../app/api/user-preferences/", import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    const stub = (source) => ({ shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` });
    if (context.parentURL?.startsWith(routeRoot)) {
      if (specifier === "@canopy/control-plane")
        return stub(
          'export const getAvailableTools = async () => [{toolId:"paperwork.invoice-generator", name:"Invoice Generator", slug:"invoice-generator"}];',
        );
      if (specifier === "@/lib/tool-framework/manifest") return stub("export const getToolManifest = async () => [];");
      if (specifier === "@canopy/auth/session")
        return stub("export async function getSession(){ return globalThis.__savedToolsApiTest.session; }");
      if (specifier === "@/lib/tool-framework/catalog")
        return stub(
          'export async function getTools(){return [{toolId:"devtools.json-formatter", name:"JSON Formatter", href:"/devtools/json-formatter", category:"json-tools"}];}',
        );
      if (specifier === "@/lib/tool-framework/categories")
        return stub('export const TOOL_CATEGORIES = {"json-tools":{label:"JSON"}};');
      if (specifier === "@/lib/user-preferences/savedTools")
        return stub(`
      export async function getSavedTools(userId) { globalThis.__savedToolsApiTest.calls.push(userId); return globalThis.__savedToolsApiTest.ids; }
      export async function changeSavedTools(userId, operation, ids) {
        const s = globalThis.__savedToolsApiTest; s.calls.push([userId,operation,ids]);
        if(s.failure) throw new Error("private database detail");
        s.ids = operation === "remove" ? s.ids.filter(id=>!ids.includes(id)) : [...new Set([...s.ids,...ids])]; return s.ids;
      }
    `);
    }
    return next(specifier, context);
  },
});
test.after(() => {
  hooks.deregister();
  delete globalThis.__savedToolsApiTest;
});
const { GET, POST } = await import("../app/api/user-preferences/saved-tools/route.ts");
const request = (body, origin = "https://app.test") =>
  new Request("https://app.test/api/user-preferences/saved-tools", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
test.beforeEach(() => {
  state.session = null;
  state.ids = [];
  state.calls = [];
  state.failure = false;
});
test("guest GET returns catalog without querying private preferences", async () => {
  const response = await GET(new Request("https://app.test/api/user-preferences/saved-tools"));
  const data = await response.json();
  assert.equal(data.userId, null);
  assert.equal(data.tools.length, 2);
  assert.ok(data.tools.some((tool) => tool.toolId === "paperwork.invoice-generator"));
  assert.deepEqual(state.calls, []);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});
test("writes require auth and reject cross-origin callers", async () => {
  assert.equal((await POST(request({ operation: "merge", toolIds: [], userId: "a" }))).status, 401);
  assert.equal((await POST(request({}, "https://evil.test"))).status, 403);
  assert.deepEqual(state.calls, []);
});
test("merge is scoped to session identity, deduplicates and filters stale tools", async () => {
  state.session = { user: { id: "a", status: "active" } };
  const response = await POST(
    request({
      userId: "a",
      operation: "merge",
      toolIds: ["devtools.json-formatter", "devtools.json-formatter", "media.retired"],
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).savedTools, ["devtools.json-formatter"]);
  assert.deepEqual(state.calls, [["a", "merge", ["devtools.json-formatter"]]]);
  assert.equal(
    (await POST(request({ userId: "b", operation: "save", toolIds: ["devtools.json-formatter"] }))).status,
    409,
  );
});
test("invalid, oversized and suspended requests cannot write", async () => {
  state.session = { user: { id: "a", status: "active" } };
  for (const body of [
    { userId: "a", operation: "replace", toolIds: [] },
    { userId: "a", operation: "save", toolIds: ["../../bad"] },
    { userId: "a", operation: "merge", toolIds: Array(501).fill("devtools.json-formatter") },
  ])
    assert.equal((await POST(request(body))).status, 400);
  state.session.user.status = "suspended";
  assert.equal((await POST(request({ userId: "a", operation: "merge", toolIds: [] }))).status, 403);
  assert.deepEqual(state.calls, []);
});
test("storage failures are actionable without exposing database details", async () => {
  state.session = { user: { id: "a", status: "active" } };
  state.failure = true;
  const response = await POST(request({ userId: "a", operation: "save", toolIds: ["devtools.json-formatter"] }));
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes("private database"));
});
