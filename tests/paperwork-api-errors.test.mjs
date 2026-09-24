import { afterAll, afterEach, beforeEach, expect, test, vi } from "vitest";

const fixture = vi.hoisted(() => {
  const shared = { error: null, available: true, captured: [] };
  globalThis.__paperworkApiErrors = shared;
  return shared;
});

vi.mock("@sentry/core", () => ({
  captureException: (error) => fixture.captured.push(error),
}));
vi.mock("@/lib/admin/index.ts", () => ({
  getAvailableToolBySlug: async () => {
    if (fixture.error !== null) throw fixture.error;
    return fixture.available ? { componentKey: "invoice-generator" } : null;
  },
  getAvailableTools: async () => {
    if (fixture.error !== null) throw fixture.error;
    return fixture.available ? [{ componentKey: "invoice-generator" }] : [];
  },
  getPublishedTemplates: async () => [],
}));
vi.mock("@/lib/tool-framework/catalog", () => ({
  getPaperworkTools: async () => {
    if (fixture.error !== null) throw fixture.error;
    return fixture.available ? [{ componentKey: "invoice-generator" }] : [];
  },
}));
vi.mock("@/lib/invoice-templates/index.ts", () => ({
  DocumentTypeSchema: { safeParse: (data) => ({ success: data === "invoice", data }) },
  getDocumentDefinition: () => ({ toolComponentKey: "invoice-generator" }),
}));
vi.mock("@/db/paperwork", () => ({ db: {} }));
vi.mock("@/db/paperworkSchema", () => ({ keyValuePairTable: {}, vendorProfilesTable: {} }));
vi.mock("@/db/bootstrap", () => ({
  ensureDatabaseBootstrapped: async () => {},
  ensureUserExists: async () => {},
}));
vi.mock("@/lib/tool-framework/manifest", () => ({ getToolManifest: async () => ({}) }));

const templates = await import("@/app/api/paperwork/templates/route.ts");
const storage = await import("@/app/api/paperwork/storage/route.ts");
const storageKey = await import("@/app/api/paperwork/storage/[key]/route.ts");
const vendors = await import("@/app/api/paperwork/vendors/route.ts");

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

afterAll(() => {
  delete globalThis.__paperworkApiErrors;
});
afterEach(() => vi.restoreAllMocks());
beforeEach(() => {
  fixture.captured = [];
});

test("Paperwork APIs return the original message without the stack and retain fallback/status", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  for (const [name, call, fallback] of operations) {
    fixture.error = new Error("Service connection timed out.");
    let response = await call();
    expect(fixture.captured.at(-1)).toBe(fixture.error);
    expect(response.status, name).toBe(500);
    expect(await response.json(), name).toEqual({ error: fixture.error.message });
    fixture.error = new Error(" ");
    response = await call();
    expect(fixture.captured.at(-1)).toBe(fixture.error);
    expect(response.status, name).toBe(500);
    expect(await response.json(), name).toEqual({ error: fallback });
  }
});

test("Paperwork access and input errors retain their original statuses and messages", async () => {
  fixture.error = null;
  fixture.available = false;
  for (const [name, call] of operations) {
    const response = await call();
    expect(response.status, name).toBe(404);
    expect(await response.json(), name).toEqual({ error: "Tool not found." });
  }
  const response = await vendors.POST(request("vendors", { vendors: "invalid" }));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "Vendor payload must contain a vendor array." });
  const oversized = await vendors.POST(
    new Request("https://app.example/api/paperwork/vendors", {
      method: "POST",
      headers: { "content-length": "4000000" },
    }),
  );
  expect(oversized.status).toBe(413);
  expect(await oversized.json()).toEqual({ error: "API payload is too large." });
  expect(fixture.captured, "expected access and input errors are not reported").toEqual([]);
});
