import { afterEach, expect, test, vi } from "vitest";
import { DataBridgeKeys, PostgresApiProvider } from "../lib/paperwork/shared/dataBridge.ts";
import { validatePaperworkStorageValue } from "../lib/paperwork/storageValidation.ts";

afterEach(() => vi.unstubAllGlobals());
function browser() {
  const store = new Map();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  });
  return store;
}
const json = (body, status = 200) =>
  Response.json(body, { status, headers: { "x-paperwork-owner": `anon_v2_${"a".repeat(64)}` } });
test("hydration preserves local drafts and edits made while loading, and notifies readiness", async () => {
  browser();
  let resolve;
  const waiting = new Promise((r) => {
    resolve = r;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      if (url.endsWith("/vendors")) return waiting;
      if (options?.method === "POST") return json({ success: true });
      return json({ found: true, value: { receiptNumber: "remote" } });
    }),
  );
  const provider = new PostgresApiProvider();
  const listener = vi.fn();
  provider.subscribe(listener);
  provider.set(DataBridgeKeys.RECEIPT_DRAFT, { receiptNumber: "local edit" });
  resolve(json({ success: true, vendors: [] }));
  await provider.whenReady();
  await provider.retry();
  expect(provider.getReceiptDraft()).toEqual({ receiptNumber: "local edit" });
  expect(provider.getStatus().ready).toBe(true);
  expect(listener).toHaveBeenCalled();
});
test("serialized cloud saves report non-ok responses and retry newest state", async () => {
  browser();
  let fail = true;
  const saves = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      if (options?.method === "POST") {
        saves.push(JSON.parse(options.body));
        return json({ success: !fail }, fail ? 500 : 200);
      }
      return json(url.endsWith("/vendors") ? { success: true, vendors: [] } : { found: false, value: null });
    }),
  );
  const provider = new PostgresApiProvider();
  await provider.whenReady();
  provider.set(DataBridgeKeys.RECEIPT_DRAFT, { receiptNumber: "one" });
  provider.set(DataBridgeKeys.RECEIPT_DRAFT, { receiptNumber: "two" });
  // First retry waits for the queue and exercises failure reporting.
  await provider.retry();
  expect(provider.getStatus().error).toMatch(/save failed/i);
  expect(provider.getReceiptDraft().receiptNumber).toBe("two");
  fail = false;
  await provider.retry();
  expect(saves.at(-1).value.receiptNumber).toBe("two");
  expect(provider.getStatus()).toMatchObject({ ready: true, pending: 0, error: null });
});
test("tool-specific stored shapes accept incomplete drafts and reject malformed structures", () => {
  for (const [key, value] of [
    [DataBridgeKeys.INVOICE_DRAFT, { lineItems: [], business: { name: "" } }],
    [DataBridgeKeys.W9_DRAFT, { vendors: [], requestDate: "" }],
    [DataBridgeKeys.TAX_DRAFT, { grossRevenue: 0, priorYearTaxKnown: false }],
    [DataBridgeKeys.EXPENSE_DRAFT, { expenses: [{ amount: 5, receiptAttached: false }], mileageRows: [] }],
  ])
    expect(() => validatePaperworkStorageValue(key, value)).not.toThrow();
  for (const [key, value] of [
    [DataBridgeKeys.INVOICE_DRAFT, []],
    [DataBridgeKeys.INVOICE_DRAFT, { lineItems: {} }],
    [DataBridgeKeys.INVOICE_DRAFT, { lineItems: [{ quantity: "3" }] }],
    [DataBridgeKeys.RECEIPT_DRAFT, { salesTaxRate: -1 }],
    [DataBridgeKeys.MILEAGE_DRAFT, { trips: [{ date: "2026-02-31", miles: 5 }] }],
    [DataBridgeKeys.TAX_DRAFT, { grossRevenue: NaN }],
    [DataBridgeKeys.W9_DRAFT, { vendors: ["bad"] }],
  ])
    expect(() => validatePaperworkStorageValue(key, value)).toThrow(/invalid/i);
});

test("persisted contracts distinguish draft editing, workflow status and calculated summaries", () => {
  for (const [key, value] of [
    [DataBridgeKeys.NEC_DRAFT, { filingStatus: "Review required" }],
    [DataBridgeKeys.INVOICE_DRAFT, { lineItems: [{ quantity: "", unitPrice: "" }] }],
    [DataBridgeKeys.TAX_DRAFT, { taxYear: "", grossRevenue: "" }],
    [
      DataBridgeKeys.TAX_SUMMARY,
      {
        filingStatus: "single",
        assumptions: ["Estimate only"],
        paymentSchedule: [{ dueDate: "2026-04-15", amount: 100 }],
      },
    ],
    [DataBridgeKeys.NEC_SUMMARY, { issues: ["Review this vendor"], boxTotals: { federalWithholding: 0 } }],
  ])
    expect(() => validatePaperworkStorageValue(key, value)).not.toThrow();
  for (const [key, value] of [
    [DataBridgeKeys.INVOICE_DRAFT, { business: { name: null } }],
    [DataBridgeKeys.TAX_SUMMARY, { estimatedTotalTax: "" }],
    [DataBridgeKeys.TAX_DRAFT, { filingStatus: "Review required" }],
    [DataBridgeKeys.NEC_DRAFT, { filingStatus: 3 }],
    [DataBridgeKeys.RECEIPT_SUMMARY, { unexpected: [] }],
  ])
    expect(() => validatePaperworkStorageValue(key, value)).toThrow();
});

test("successful hydration retry clears its error and partial invoice rows restore safely", async () => {
  const local = browser();
  local.set(
    DataBridgeKeys.INVOICE_DRAFT,
    JSON.stringify({ business: { name: "Business" }, lineItems: [{ description: "Service" }] }),
  );
  let fail = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      if (fail) return json({}, 500);
      return json(url.endsWith("/vendors") ? { success: true, vendors: [] } : { found: false, value: null });
    }),
  );
  const provider = new PostgresApiProvider();
  await provider.whenReady();
  expect(provider.getStatus().error).not.toBeNull();
  const invoice = provider.getInvoiceDraft();
  expect(invoice.business.name).toBe("Business");
  expect(invoice.client.name).toBe("");
  expect(invoice.lineItems[0]).toMatchObject({ description: "Service", quantity: 1, unitPrice: 0, taxable: true });
  fail = false;
  await provider.retry();
  expect(provider.getStatus().error).toBeNull();
});

test("local drafts partition verified accounts and old queues never upload into a new account", async () => {
  const local = browser();
  local.set(DataBridgeKeys.RECEIPT_DRAFT, JSON.stringify({ receiptNumber: "legacy browser draft" }));
  let owner = `account_v2_${"a".repeat(64)}`;
  const uploaded = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      if (options?.method === "POST") {
        if (options.headers["x-paperwork-owner"] !== owner) return Response.json({}, { status: 403 });
        uploaded.push(JSON.parse(options.body));
        return Response.json({ success: true }, { headers: { "x-paperwork-owner": owner } });
      }
      return Response.json(url.endsWith("/vendors") ? { success: true, vendors: [] } : { found: false, value: null }, {
        headers: { "x-paperwork-owner": owner },
      });
    }),
  );
  const first = new PostgresApiProvider();
  await first.whenReady();
  expect(first.getReceiptDraft()).toBeNull();
  first.set(DataBridgeKeys.RECEIPT_DRAFT, { receiptNumber: "Account A" });
  await first.retry();
  owner = `account_v2_${"b".repeat(64)}`;
  const second = new PostgresApiProvider();
  await second.whenReady();
  expect(second.getReceiptDraft()).toBeNull();
  first.set(DataBridgeKeys.RECEIPT_DRAFT, { receiptNumber: "stale A edit" });
  await first.retry();
  expect(first.getStatus().error).toMatch(/owner changed/i);
  expect(first.getStatus().reloadRequired).toBe(true);
  expect(uploaded).toHaveLength(1);
  expect(second.getReceiptDraft()).toBeNull();
  expect(local.get(DataBridgeKeys.RECEIPT_DRAFT)).toContain("legacy browser draft");
});

test("ownership verification failure quarantines local drafts and retries explicitly typed edits", async () => {
  const local = browser();
  local.set(DataBridgeKeys.RECEIPT_DRAFT, JSON.stringify({ receiptNumber: "another browser draft" }));
  let unavailable = true;
  const saves = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      if (unavailable) return Response.json({}, { status: 500 });
      if (options?.method === "POST") {
        saves.push(JSON.parse(options.body));
        return json({ success: true });
      }
      return json(url.endsWith("/vendors") ? { success: true, vendors: [] } : { found: false, value: null });
    }),
  );
  const provider = new PostgresApiProvider();
  await provider.whenReady();
  expect(provider.getReceiptDraft()).toBeNull();
  provider.set(DataBridgeKeys.RECEIPT_DRAFT, { receiptNumber: "explicit new edit" });
  await provider.retry();
  expect(provider.getStatus().error).not.toBeNull();
  unavailable = false;
  await provider.retry();
  expect(saves.at(-1).value.receiptNumber).toBe("explicit new edit");
  expect(provider.getReceiptDraft().receiptNumber).toBe("explicit new edit");
  expect(local.get(DataBridgeKeys.RECEIPT_DRAFT)).toContain("another browser draft");
});

test("nonblocking workspace startup skips default autosaves and still restores saved drafts", async () => {
  browser();
  let release;
  const delayed = new Promise((resolve) => {
    release = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) =>
      url.endsWith("/vendors") ? delayed : json({ found: true, value: { receiptNumber: "saved receipt" } }),
    ),
  );
  const provider = new PostgresApiProvider();
  provider.holdAutomaticSaves();
  provider.set(DataBridgeKeys.RECEIPT_DRAFT, { receiptNumber: "blank initial default" });
  expect(provider.getReceiptDraft()).toBeNull();
  release(json({ success: true, vendors: [] }));
  await provider.whenReady();
  expect(provider.getReceiptDraft()).toEqual({ receiptNumber: "saved receipt" });
});

test("explicit edits during nonblocking startup take precedence over late remote drafts", async () => {
  browser();
  let release;
  const delayed = new Promise((resolve) => {
    release = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      if (url.endsWith("/vendors") && options?.method !== "POST") return delayed;
      if (options?.method === "POST") return json({ success: true });
      return json({ found: true, value: { receiptNumber: "older remote" } });
    }),
  );
  const provider = new PostgresApiProvider();
  provider.holdAutomaticSaves();
  provider.beginUserEdit();
  provider.set(DataBridgeKeys.RECEIPT_DRAFT, { receiptNumber: "new typed receipt" });
  expect(provider.getReceiptDraft()).toEqual({ receiptNumber: "new typed receipt" });
  release(json({ success: true, vendors: [] }));
  await provider.whenReady();
  await provider.retry();
  expect(provider.getReceiptDraft()).toEqual({ receiptNumber: "new typed receipt" });
});
