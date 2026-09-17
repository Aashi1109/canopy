import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const adapterUrl = new URL("../packages/auth/src/cachedUserAdapter.ts", import.meta.url).href;
const fixture = { events: [], user: { id: "alice", name: "Alice" }, invalidationError: false };
globalThis.__cachedUserAdapterTest = fixture;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === adapterUrl && specifier === "@canopy/control-plane") {
      return {
        shortCircuit: true,
        url: `data:text/javascript,${encodeURIComponent(`
          const fixture = globalThis.__cachedUserAdapterTest;
          export async function getCachedUser(id) {
            fixture.events.push(["cached-user", id]);
            return fixture.user;
          }
          export async function withUserCacheInvalidation(operation) {
            fixture.events.push("scope-open");
            try {
              return await operation(async ids => {
                fixture.events.push(["invalidate", ids]);
                if (fixture.invalidationError) throw new Error("Invalidation unavailable");
              });
            } finally { fixture.events.push("scope-close"); }
          }
        `)}`,
      };
    }
    return nextResolve(specifier, context);
  },
});
const { cachedUserAdapter } = await import(adapterUrl);
hooks.deregister();

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
      return state.ids.slice(0, args.limit ?? 100).map(id => ({ id }));
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
    raw[method] = async args => {
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
  assert.deepEqual(await adapter.findOne(sessionQuery), { ...state.session, user: fixture.user });
  assert.deepEqual(fixture.events, [["findOne", { ...sessionQuery, join: undefined }], ["cached-user", "alice"]]);
  fixture.events = [];
  state.session = null;
  assert.equal(await adapter.findOne(sessionQuery), null);
  assert.equal(fixture.events.length, 1);
});

test("partial projections and unrelated reads retain adapter behavior", async () => {
  const { adapter } = setup();
  for (const args of [{ ...sessionQuery, select: ["id"] }, userQuery, { ...sessionQuery, join: { user: true, account: true } }]) {
    await adapter.findOne(args);
    assert.deepEqual(fixture.events.pop(), ["findOne", args]);
    assert.equal(fixture.events.length, 0);
  }
});

test("all user update and delete paths invalidate before writing", async () => {
  const { adapter } = setup();
  for (const method of ["update", "updateMany", "delete", "deleteMany"]) {
    fixture.events = [];
    const args = { ...userQuery, ...(method.startsWith("update") ? { update: { name: "New name" } } : {}) };
    await adapter[method](args);
    assert.deepEqual(fixture.events, ["scope-open", ["invalidate", ["alice"]], [method, args], "scope-close"]);
  }
});

test("bulk invalidation resolves every matching user beyond adapter default limits", async () => {
  const { adapter, state } = setup();
  state.ids = Array.from({ length: 125 }, (_, index) => `user-${index}`);
  const args = { model: "user", where: [{ field: "status", value: "active" }], update: { status: "suspended" } };
  assert.equal(await adapter.updateMany(args), 125);
  assert.deepEqual(fixture.events.find(event => event[0] === "invalidate"), ["invalidate", state.ids]);
  assert.equal(fixture.events.find(event => event[0] === "findMany")[1].limit, 125);
});

test("transaction invalidation fences persist through commit and rollback while reads bypass cache", async () => {
  const { adapter } = setup();
  for (const fail of [false, true]) {
    fixture.events = [];
    const operation = adapter.transaction(async transaction => {
      await transaction.findOne(sessionQuery);
      await transaction.update({ ...userQuery, update: { name: "Updated" } });
      await transaction.delete(userQuery);
      if (fail) throw new Error("Rollback requested");
      return "done";
    });
    if (fail) await assert.rejects(operation, /Rollback requested/);
    else assert.equal(await operation, "done");
    assert.deepEqual(fixture.events.slice(0, 3), ["scope-open", "begin", ["findOne", sessionQuery]]);
    assert.deepEqual(fixture.events.slice(-2), [fail ? "rollback" : "commit", "scope-close"]);
    assert.equal(fixture.events.filter(event => event === "scope-open").length, 1);
    assert.equal(fixture.events.filter(event => event[0] === "invalidate").length, 2);
  }
});

test("failed invalidation prevents writes; other records and user creation are unaffected", async () => {
  const { adapter } = setup();
  fixture.invalidationError = true;
  await assert.rejects(adapter.delete(userQuery), /Invalidation unavailable/);
  assert.equal(fixture.events.some(event => event[0] === "delete"), false);
  fixture.events = [];
  const session = { ...userQuery, model: "session" };
  await adapter.delete(session);
  const user = { model: "user", data: { id: "alice" } };
  await adapter.create(user);
  assert.deepEqual(fixture.events, [["delete", session], ["create", user]]);
});
