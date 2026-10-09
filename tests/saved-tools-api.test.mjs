import { afterAll, beforeEach, expect, test, vi } from "vitest";

const previousAppUrl = process.env.APP_URL;
const state = vi.hoisted(() => {
  const shared = {
    session: null,
    ids: [],
    calls: [],
    failure: false,
    captured: [],
    adminLoads: 0,
    catalogReads: 0,
    catalogLocales: [],
    sessionGate: undefined,
    catalogGate: undefined,
    savedGate: undefined,
    catalogStarted: undefined,
  };
  globalThis.__savedToolsApiTest = shared;
  return shared;
});

vi.mock("@sentry/core", () => ({
  captureException: (error) => state.captured.push(error),
}));
vi.mock("@/lib/auth/session.ts", () => ({
  getSession: async (_headers, options) => {
    await state.sessionGate;
    if (state.session && options?.includeAdmin !== false) state.adminLoads++;
    return state.session;
  },
}));
vi.mock("@/lib/tool-framework/catalog", () => ({
  getPublicToolListings: async (locale) => {
    state.catalogReads++;
    state.catalogLocales.push(locale);
    state.catalogStarted?.resolve();
    await state.catalogGate;
    return [
      {
        toolId: "devtools.json-formatter",
        name: locale === "hi" ? "JSON फ़ॉर्मैटर" : "JSON Formatter",
        href: locale === "hi" ? "/hi/devtools/json-formatter" : "/devtools/json-formatter",
        category: "JSON",
        locale,
        keywords: ["json"],
      },
      {
        toolId: "paperwork.invoice-generator",
        name: "Invoice Generator",
        href: "/paperwork/invoice-generator",
        category: "Documents",
        locale,
        keywords: ["billing"],
      },
      {
        toolId: "media.crop-image",
        name: "Crop Image",
        href: "/media/crop-image",
        category: "Image Editing",
        locale,
        keywords: ["crop"],
      },
    ];
  },
}));
vi.mock("@/lib/user-preferences/savedTools", () => ({
  getSavedTools: async (userId) => {
    state.calls.push(userId);
    await state.savedGate;
    return state.ids;
  },
  changeSavedTools: async (userId, operation, ids) => {
    state.calls.push([userId, operation, ids]);
    if (state.failure) throw new Error("private database detail");
    state.ids =
      operation === "remove" ? state.ids.filter((id) => !ids.includes(id)) : [...new Set([...state.ids, ...ids])];
    return state.ids;
  },
}));

const { GET, POST } = await import("@/app/api/user-preferences/saved-tools/route.ts");

afterAll(() => {
  if (previousAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = previousAppUrl;
  delete globalThis.__savedToolsApiTest;
});

const request = (body, origin = "https://app.test") =>
  new Request("https://app.test/api/user-preferences/saved-tools", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  process.env.APP_URL = "https://app.test";
  state.session = null;
  state.ids = [];
  state.calls = [];
  state.failure = false;
  state.captured = [];
  state.adminLoads = 0;
  state.catalogReads = 0;
  state.catalogLocales = [];
  state.sessionGate = undefined;
  state.catalogGate = undefined;
  state.savedGate = undefined;
  state.catalogStarted = undefined;
});

test("guest GET returns catalog without querying private preferences", async () => {
  const response = await GET(new Request("https://app.test/api/user-preferences/saved-tools"));
  const data = await response.json();
  expect(data.userId).toBe(null);
  expect(data.tools).toEqual([
    {
      toolId: "devtools.json-formatter",
      name: "JSON Formatter",
      href: "/devtools/json-formatter",
      category: "JSON",
      locale: "en",
    },
    {
      toolId: "paperwork.invoice-generator",
      name: "Invoice Generator",
      href: "/paperwork/invoice-generator",
      category: "Documents",
      locale: "en",
    },
    {
      toolId: "media.crop-image",
      name: "Crop Image",
      href: "/media/crop-image",
      category: "Image Editing",
      locale: "en",
    },
  ]);
  expect(state.calls).toEqual([]);
  expect(state.catalogLocales).toEqual(["en"]);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

test("GET returns localized tool names while preserving stable saved-tool paths and IDs", async () => {
  state.session = { user: { id: "a", status: "active" } };
  state.ids = ["devtools.json-formatter"];
  const response = await GET(new Request("https://app.test/api/user-preferences/saved-tools?locale=hi"));
  const data = await response.json();
  expect(response.status).toBe(200);
  expect(data.savedTools).toEqual(["devtools.json-formatter"]);
  expect(data.tools[0]).toEqual({
    toolId: "devtools.json-formatter",
    name: "JSON फ़ॉर्मैटर",
    href: "/devtools/json-formatter",
    category: "JSON",
    locale: "hi",
  });
  expect(state.catalogLocales).toEqual(["hi"]);
});

test("GET rejects unsupported locales before reading catalog or private preferences", async () => {
  state.session = { user: { id: "a", status: "active" } };
  const response = await GET(new Request("https://app.test/api/user-preferences/saved-tools?locale=unknown"));
  expect(response.status).toBe(400);
  expect(state.catalogReads).toBe(0);
  expect(state.calls).toEqual([]);
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
    expect(data.userId).toBe(id);
    expect(data.savedTools).toEqual(savedTools);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
  expect(state.calls).toEqual(["a", "b", "a"]);
});

test("saved tools reads and writes do not hydrate unrelated admin permissions", async () => {
  state.session = { user: { id: "a", status: "active" } };
  expect((await GET(new Request("https://app.test/api/user-preferences/saved-tools"))).status).toBe(200);
  expect(state.adminLoads).toBe(0);
  expect((await POST(request({ userId: "a", operation: "save", toolIds: ["devtools.json-formatter"] }))).status).toBe(
    200,
  );
  expect(state.adminLoads).toBe(0);
});

test("authenticated GET loads catalog and private preferences concurrently after session validation", async () => {
  state.session = { user: { id: "a", status: "active" } };
  state.ids = ["media.crop-image"];
  const session = Promise.withResolvers();
  const catalog = Promise.withResolvers();
  const saved = Promise.withResolvers();
  state.sessionGate = session.promise;
  state.catalogGate = catalog.promise;
  state.savedGate = saved.promise;
  state.catalogStarted = Promise.withResolvers();
  let settled = false;
  const pending = GET(new Request("https://app.test/api/user-preferences/saved-tools?locale=hi")).then((response) => {
    settled = true;
    return response;
  });
  try {
    await Promise.resolve();
    expect(state.catalogReads).toBe(0);
    expect(state.calls, "private data waits for session validation").toEqual([]);
    session.resolve();
    await state.catalogStarted.promise;
    expect(state.catalogLocales).toEqual(["hi"]);
    expect(state.calls, "preference loading starts before the catalog resolves").toEqual(["a"]);
    catalog.resolve();
    await Promise.resolve();
    expect(settled, "the response still waits for private preferences").toBe(false);
    saved.resolve();
    const response = await pending;
    const data = await response.json();
    expect(data.userId).toBe("a");
    expect(data.savedTools).toEqual(["media.crop-image"]);
    expect(data.tools.length).toBe(3);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  } finally {
    session.resolve();
    catalog.resolve();
    saved.resolve();
    await pending;
  }
});

test("suspended GET cannot start catalog or private preference reads", async () => {
  state.session = { user: { id: "a", status: "suspended" } };
  const response = await GET(new Request("https://app.test/api/user-preferences/saved-tools"));
  expect(response.status).toBe(403);
  expect(state.catalogReads).toBe(0);
  expect(state.calls).toEqual([]);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

test("writes require auth and reject cross-origin callers", async () => {
  expect((await POST(request({ operation: "merge", toolIds: [], userId: "a" }))).status).toBe(401);
  expect((await POST(request({}, "https://evil.test"))).status).toBe(403);
  expect(state.calls).toEqual([]);
  expect(state.captured).toEqual([]);
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
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ userId: "admin", savedTools: ["devtools.json-formatter"] });
  expect(state.calls).toEqual([["admin", "save", ["devtools.json-formatter"]]]);
  expect(state.captured).toEqual([]);
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
  expect(response.status).toBe(200);
  expect((await response.json()).savedTools).toEqual(["devtools.json-formatter"]);
  expect(state.calls).toEqual([["a", "merge", ["devtools.json-formatter"]]]);
  expect((await POST(request({ userId: "b", operation: "save", toolIds: ["devtools.json-formatter"] }))).status).toBe(
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
    expect((await POST(request(body))).status).toBe(400);
  state.session.user.status = "suspended";
  expect((await POST(request({ userId: "a", operation: "merge", toolIds: [] }))).status).toBe(403);
  expect(state.calls).toEqual([]);
});

test("storage failures are actionable without exposing database details", async () => {
  state.session = { user: { id: "a", status: "active" } };
  state.failure = true;
  const response = await POST(request({ userId: "a", operation: "save", toolIds: ["devtools.json-formatter"] }));
  expect(response.status).toBe(503);
  expect((await response.text()).includes("private database")).toBe(false);
  expect(state.captured.length).toBe(1);
  expect(state.captured[0].message).toBe("private database detail");
});
