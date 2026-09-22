import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
const previousAppUrl = process.env.APP_URL;
const state = { session: null, ids: [], calls: [], failure: false, captured: [] };
globalThis.__savedToolsApiTest = state;
const routeRoot = new URL("../app/api/user-preferences/", import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    const stub = (source) => ({ shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` });
    if (context.parentURL?.startsWith(routeRoot)) {
      if (specifier === "@/lib/routing/requestOrigin.ts")
        return next(new URL("../lib/routing/requestOrigin.ts", import.meta.url).href, context);
      if (specifier === "@sentry/core")
        return stub("export const captureException = error => globalThis.__savedToolsApiTest.captured.push(error);");
      if (specifier === "@/lib/auth/session.ts")
        return stub("export async function getSession(){ return globalThis.__savedToolsApiTest.session; }");
      if (specifier === "@/lib/tool-framework/catalog")
        return stub(
          `export async function getPublicTools(){return [
            {toolId:"devtools.json-formatter", name:"JSON Formatter", href:"/devtools/json-formatter", category:"JSON", keywords:["json"]},
            {toolId:"paperwork.invoice-generator", name:"Invoice Generator", href:"/paperwork/invoice-generator", category:"Documents", keywords:["billing"]},
            {toolId:"media.crop-image", name:"Crop Image", href:"/media/crop-image", category:"Image Editing", keywords:["crop"]},
          ];}`,
        );
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
  if (previousAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = previousAppUrl;
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
  process.env.APP_URL = "https://app.test";
  state.session = null;
  state.ids = [];
  state.calls = [];
  state.failure = false;
  state.captured = [];
});
test("guest GET returns catalog without querying private preferences", async () => {
  const response = await GET(new Request("https://app.test/api/user-preferences/saved-tools"));
  const data = await response.json();
  assert.equal(data.userId, null);
  assert.deepEqual(data.tools, [
    { toolId: "devtools.json-formatter", name: "JSON Formatter", href: "/devtools/json-formatter", category: "JSON" },
    {
      toolId: "paperwork.invoice-generator",
      name: "Invoice Generator",
      href: "/paperwork/invoice-generator",
      category: "Documents",
    },
    { toolId: "media.crop-image", name: "Crop Image", href: "/media/crop-image", category: "Image Editing" },
  ]);
  assert.deepEqual(state.calls, []);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});
test("authenticated GET reads each account's current private preferences", async () => {
  for (const [id, savedTools] of [
    ["a", ["paperwork.invoice-generator"]],
    ["b", ["media.crop-image"]],
    ["a", []],
  ]) {
    state.session = { user: { id, status: "active" } };
    state.ids = savedTools;
    const response = await GET(new Request("https://app.test/api/user-preferences/saved-tools"));
    const data = await response.json();
    assert.equal(data.userId, id);
    assert.deepEqual(data.savedTools, savedTools);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  assert.deepEqual(state.calls, ["a", "b", "a"]);
});
test("writes require auth and reject cross-origin callers", async () => {
  assert.equal((await POST(request({ operation: "merge", toolIds: [], userId: "a" }))).status, 401);
  assert.equal((await POST(request({}, "https://evil.test"))).status, 403);
  assert.deepEqual(state.calls, []);
  assert.deepEqual(state.captured, []);
});
test("local admin origin can save when the internal request URL uses localhost", async () => {
  process.env.APP_URL = "http://localhost:3000";
  state.session = { user: { id: "admin", status: "active" } };
  const response = await POST(
    new Request("http://localhost:3000/api/user-preferences/saved-tools", {
      method: "POST",
      headers: {
        host: "admin.localhost:3000",
        origin: "http://admin.localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ userId: "admin", operation: "save", toolIds: ["devtools.json-formatter"] }),
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { userId: "admin", savedTools: ["devtools.json-formatter"] });
  assert.deepEqual(state.calls, [["admin", "save", ["devtools.json-formatter"]]]);
  assert.deepEqual(state.captured, []);
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
  assert.equal(state.captured.length, 1);
  assert.equal(state.captured[0].message, "private database detail");
});
