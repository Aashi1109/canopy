import { expect, test, vi } from "vitest";

const fixture = vi.hoisted(() => ({ events: [], user: { id: "alice", name: "Alice" }, invalidationError: false }));
globalThis.__cachedUserAdapterTest = fixture;

vi.mock("@/lib/admin/index.ts", () => ({
  async getCachedUser(id) {
    fixture.events.push(["cached-user", id]);
    return fixture.user;
  },
  async withUserCacheInvalidation(operation) {
    fixture.events.push("scope-open");
    try {
      return await operation(async (ids) => {
        fixture.events.push(["invalidate", ids]);
        if (fixture.invalidationError) throw new Error("Invalidation unavailable");
      });
    } finally {
      fixture.events.push("scope-close");
    }
  },
}));

const { cachedUserAdapter } = await import("@/lib/auth/cachedUserAdapter.ts");

function setup() {
  fixture.events = [];
  fixture.invalidationError = false;
  fixture.user = { id: "alice", name: "Alice" };
  const state = { session: { id: "session", userId: "alice", token: "secret" }, ids: ["alice"] };
  const raw = {
    id: "fixture",
    async findOne(args) {
      fixture.events.push(["findOne", args]);
      return state.session;
    },
    async count(args) {
      fixture.events.push(["count", args]);
      return state.ids.length;
    },
    async findMany(args) {
      fixture.events.push(["findMany", args]);
      return state.ids.slice(0, args.limit ?? 100).map((id) => ({ id }));
    },
    async transaction(callback) {
      fixture.events.push("begin");
      try {
        const result = await callback(raw);
        fixture.events.push("commit");
        return result;
      } catch (error) {
        fixture.events.push("rollback");
        throw error;
      }
    },
  };
  for (const method of ["create", "update", "updateMany", "delete", "deleteMany"]) {
    raw[method] = async (args) => {
      fixture.events.push([method, args]);
      return method.endsWith("Many") ? state.ids.length : { id: "alice" };
    };
  }
  return { state, adapter: cachedUserAdapter(raw) };
}

const sessionQuery = { model: "session", where: [{ field: "token", value: "secret" }], join: { user: true } };
const userQuery = { model: "user", where: [{ field: "id", value: "alice" }] };

test("session lookups keep fresh sessions and attach the cached user", async () => {
  const { state, adapter } = setup();
  expect(await adapter.findOne(sessionQuery)).toEqual({ ...state.session, user: fixture.user });
  expect(fixture.events).toEqual([
    ["findOne", { ...sessionQuery, join: undefined }],
    ["cached-user", "alice"],
  ]);
  fixture.events = [];
  state.session = null;
  expect(await adapter.findOne(sessionQuery)).toBe(null);
  expect(fixture.events.length).toBe(1);
});

test("partial projections and unrelated reads retain adapter behavior", async () => {
  const { adapter } = setup();
  for (const args of [
    { ...sessionQuery, select: ["id"] },
    userQuery,
    { ...sessionQuery, join: { user: true, account: true } },
  ]) {
    await adapter.findOne(args);
    expect(fixture.events.pop()).toEqual(["findOne", args]);
    expect(fixture.events.length).toBe(0);
  }
});

test("all user update and delete paths invalidate before writing", async () => {
  const { adapter } = setup();
  for (const method of ["update", "updateMany", "delete", "deleteMany"]) {
    fixture.events = [];
    const args = { ...userQuery, ...(method.startsWith("update") ? { update: { name: "New name" } } : {}) };
    await adapter[method](args);
    expect(fixture.events).toEqual(["scope-open", ["invalidate", ["alice"]], [method, args], "scope-close"]);
  }
});

test("bulk invalidation resolves every matching user beyond adapter default limits", async () => {
  const { adapter, state } = setup();
  state.ids = Array.from({ length: 125 }, (_, index) => `user-${index}`);
  const args = { model: "user", where: [{ field: "status", value: "active" }], update: { status: "suspended" } };
  expect(await adapter.updateMany(args)).toBe(125);
  expect(fixture.events.find((event) => event[0] === "invalidate")).toEqual(["invalidate", state.ids]);
  expect(fixture.events.find((event) => event[0] === "findMany")[1].limit).toBe(125);
});

test("transaction invalidation fences persist through commit and rollback while reads bypass cache", async () => {
  const { adapter } = setup();
  for (const fail of [false, true]) {
    fixture.events = [];
    const operation = adapter.transaction(async (transaction) => {
      await transaction.findOne(sessionQuery);
      await transaction.update({ ...userQuery, update: { name: "Updated" } });
      await transaction.delete(userQuery);
      if (fail) throw new Error("Rollback requested");
      return "done";
    });
    if (fail) await expect(operation).rejects.toThrow(/Rollback requested/);
    else expect(await operation).toBe("done");
    expect(fixture.events.slice(0, 3)).toEqual(["scope-open", "begin", ["findOne", sessionQuery]]);
    expect(fixture.events.slice(-2)).toEqual([fail ? "rollback" : "commit", "scope-close"]);
    expect(fixture.events.filter((event) => event === "scope-open").length).toBe(1);
    expect(fixture.events.filter((event) => event[0] === "invalidate").length).toBe(2);
  }
});

test("failed invalidation prevents writes; other records and user creation are unaffected", async () => {
  const { adapter } = setup();
  fixture.invalidationError = true;
  await expect(adapter.delete(userQuery)).rejects.toThrow(/Invalidation unavailable/);
  expect(fixture.events.some((event) => event[0] === "delete")).toBe(false);
  fixture.events = [];
  const session = { ...userQuery, model: "session" };
  await adapter.delete(session);
  const user = { model: "user", data: { id: "alice" } };
  await adapter.create(user);
  expect(fixture.events).toEqual([
    ["delete", session],
    ["create", user],
  ]);
});
