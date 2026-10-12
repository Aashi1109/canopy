vi.mock("@/lib/auth/session.ts", () => ({ getSession: async () => state.auth }));
import { beforeEach, expect, test, vi } from "vitest";
const state = vi.hoisted(() => ({ drafts: [], vendors: [], owners: [], auth: null }));
vi.mock("@sentry/core", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/paperwork/toolAccess", () => ({
  requireAvailableToolForStorageKey: async () => {},
  requireAnyAvailablePaperworkTool: async () => {},
  PaperworkToolAccessError: class extends Error {},
}));
vi.mock("drizzle-orm", () => ({ eq: (column, value) => ({ column, value }), and: (...conditions) => conditions }));
vi.mock("@/db/paperworkSchema", () => ({
  keyValuePairTable: { name: "drafts", userId: "owner", key: "key" },
  vendorProfilesTable: { name: "vendors", userId: "owner", id: "id" },
}));
vi.mock("@/db/bootstrap", () => ({
  ensureDatabaseBootstrapped: async () => {},
  ensureUserExists: async (id) => state.owners.push(id),
}));
vi.mock("@/db/paperwork", () => {
  const match = (row, conditions) =>
    (Array.isArray(conditions) ? conditions : [conditions]).every(
      (c) => row[c.column === "owner" ? "userId" : c.column] === c.value,
    );
  const db = {
    insert: (table) => ({
      values: (row) => ({
        onConflictDoUpdate: async () => {
          const rows = state[table.name];
          const old = rows.findIndex(
            (r) => r.userId === row.userId && (table.name === "drafts" ? r.key === row.key : r.id === row.id),
          );
          if (old >= 0) rows[old] = row;
          else rows.push(row);
        },
      }),
    }),
    select: () => ({
      from: (table) => ({
        where: (conditions) => {
          const rows = state[table.name].filter((row) => match(row, conditions));
          rows.limit = async (n) => rows.slice(0, n);
          return rows;
        },
      }),
    }),
    delete: (table) => ({
      where: async (condition) => {
        state[table.name] = state[table.name].filter((row) => !match(row, condition));
      },
    }),
    transaction: async (work) => work(db),
  };
  return { db };
});
const storage = await import("../app/api/paperwork/storage/route.ts");
const reader = await import("../app/api/paperwork/storage/[key]/route.ts");
const vendors = await import("../app/api/paperwork/vendors/route.ts");
const key = "paperworkkit.receipt.draft";
const request = (path, body, cookie, id = "default_user") =>
  new Request(`https://app.example/api/paperwork/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      origin: "https://app.example",
      "content-type": "application/json",
      "x-user-id": id,
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const cookie = (response) => response.headers.get("set-cookie").split(";")[0];
beforeEach(() => {
  state.drafts = [];
  state.vendors = [];
  state.owners = [];
  state.auth = null;
});
test("saved drafts isolate server-issued owners even with identical or forged browser ids", async () => {
  const first = await storage.POST(request("storage", { key, value: { receiptNumber: "private" } }));
  expect(first.status).toBe(200);
  const session = cookie(first);
  const other = await reader.GET(request(`storage/${key}`, undefined, null, state.owners[0]), {
    params: Promise.resolve({ key }),
  });
  expect(await other.json()).toEqual({ found: false, value: null });
  const own = await reader.GET(request(`storage/${key}`, undefined, session, "attacker supplied"), {
    params: Promise.resolve({ key }),
  });
  expect(await own.json()).toEqual({ found: true, value: { receiptNumber: "private" } });
});
test("vendor replacement removes deleted records only within its own owner", async () => {
  const a = await vendors.POST(request("vendors", { vendors: [{ id: "a", legalName: "A" }] }));
  const b = await vendors.POST(request("vendors", { vendors: [{ id: "b", legalName: "B" }] }));
  await vendors.POST(request("vendors", { vendors: [] }, cookie(a)));
  expect((await (await vendors.GET(request("vendors", undefined, cookie(a)))).json()).vendors).toEqual([]);
  expect((await (await vendors.GET(request("vendors", undefined, cookie(b)))).json()).vendors[0].legalName).toBe("B");
});
test("malformed JSON and invalid persisted shapes fail before writes", async () => {
  const response = await storage.POST(
    new Request("https://app.example/api/paperwork/storage", {
      method: "POST",
      headers: { origin: "https://app.example" },
      body: "{",
    }),
  );
  expect(response.status).toBe(400);
  expect((await response.json()).error).toMatch(/valid JSON/i);
  expect((await storage.POST(request("storage", { key, value: { lineItems: "wrong" } }))).status).toBe(400);
  expect(state.drafts).toEqual([]);
});

test("verified accounts isolate drafts and reject queued writes from a previous account", async () => {
  state.auth = { session: { id: "verified" }, user: { id: "account-a", status: "active" } };
  const initial = await vendors.GET(request("vendors"));
  const ownerA = initial.headers.get("x-paperwork-owner");
  const browserCookie = cookie(initial);
  const saveA = request("storage", { key, value: { receiptNumber: "A private" } }, browserCookie);
  saveA.headers.set("x-paperwork-owner", ownerA);
  expect((await storage.POST(saveA.clone())).status).toBe(200);
  state.auth = { session: { id: "verified-b" }, user: { id: "account-b", status: "active" } };
  expect((await storage.POST(saveA)).status).toBe(403);
  const readB = await reader.GET(request(`storage/${key}`, undefined, browserCookie), {
    params: Promise.resolve({ key }),
  });
  expect(await readB.json()).toEqual({ found: false, value: null });
  expect(readB.headers.get("x-paperwork-owner")).not.toBe(ownerA);
  state.auth = { session: { id: "verified" }, user: { id: "account-a", status: "active" } };
  const readA = await reader.GET(request(`storage/${key}`, undefined, browserCookie), {
    params: Promise.resolve({ key }),
  });
  expect(await readA.json()).toEqual({ found: true, value: { receiptNumber: "A private" } });
});
