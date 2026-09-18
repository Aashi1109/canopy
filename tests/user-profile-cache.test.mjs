import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { Cache } from "../lib/cache/index.ts";
import { authUser, db } from "../db/index.ts";
import { getCachedUser, withUserCacheInvalidation } from "../lib/admin/index.ts";

function setup(t) {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgres://test:test@localhost/test";
  t.after(() => {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  });
  const createdAt = new Date("2026-09-17T00:00:00Z");
  const users = new Map(
    ["alice", "bob"].map((id) => [
      id,
      {
        id,
        name: id,
        email: `${id}@example.test`,
        emailVerified: true,
        image: null,
        status: "active",
        createdAt,
        updatedAt: createdAt,
      },
    ]),
  );
  const state = {
    users,
    entries: new Map(),
    pending: new Map(),
    versions: new Map(),
    reads: 0,
    disabled: false,
    failBegin: null,
    begins: [],
    ends: [],
  };
  const dialect = new PgDialect();
  const originalSelect = db.select;
  t.after(() => {
    db.select = originalSelect;
  });
  db.select = () => {
    let id;
    const query = {
      from(table) {
        assert.equal(table, authUser);
        return query;
      },
      where(condition) {
        [id] = dialect.sqlToQuery(condition).params;
        return query;
      },
      async limit(count) {
        assert.equal(count, 1);
        state.reads++;
        return users.has(id) ? [structuredClone(users.get(id))] : [];
      },
    };
    return query;
  };
  t.mock.method(Cache.prototype, "rememberGuarded", async function (id, load, ttl) {
    assert.equal(ttl, this.namespace === "user" ? 3600 : 86400);
    if (this.namespace === "user-roles") id = `user-roles:${id}`;
    if (state.disabled || state.pending.has(id)) return load();
    if (state.entries.has(id)) return JSON.parse(state.entries.get(id));
    const version = state.versions.get(id);
    const value = await load();
    if (!state.pending.has(id) && state.versions.get(id) === version) state.entries.set(id, JSON.stringify(value));
    return value;
  });
  t.mock.method(Cache.prototype, "beginInvalidation", async function (id, ttl) {
    assert.equal(ttl, this.namespace === "user" ? 3600 : 86400);
    if (this.namespace === "user-roles") id = `user-roles:${id}`;
    if (id === state.failBegin) throw new Error("Invalidation unavailable");
    state.begins.push(id);
    if (state.disabled) return null;
    const token = crypto.randomUUID();
    state.entries.delete(id);
    state.versions.set(id, token);
    state.pending.set(id, token);
    return token;
  });
  t.mock.method(Cache.prototype, "endInvalidation", async function (id, token, ttl) {
    assert.equal(ttl, this.namespace === "user" ? 3600 : 86400);
    if (this.namespace === "user-roles") id = `user-roles:${id}`;
    if (token === null) return;
    state.ends.push(id);
    if (state.pending.get(id) === token) state.pending.delete(id);
    state.entries.delete(id);
  });
  return state;
}

test("user profiles cache independently for one hour and hydrate dates", async (t) => {
  const state = setup(t);
  assert.deepEqual(await getCachedUser("alice"), state.users.get("alice"));
  const cached = await getCachedUser("alice");
  assert.deepEqual(cached, state.users.get("alice"));
  assert.ok(cached.createdAt instanceof Date);
  assert.ok(cached.updatedAt instanceof Date);
  assert.deepEqual(await getCachedUser("bob"), state.users.get("bob"));
  assert.equal(state.reads, 2);
});

test("profile edits, suspension, reactivation, and deletion invalidate the cached user", async (t) => {
  const state = setup(t);
  await getCachedUser("alice");
  for (const change of [{ name: "Updated", image: "/avatar.png" }, { status: "suspended" }, { status: "active" }]) {
    await withUserCacheInvalidation(async (invalidate) => {
      await invalidate(["alice", "alice"]);
      Object.assign(state.users.get("alice"), change);
      assert.deepEqual(await getCachedUser("alice"), state.users.get("alice"));
    });
    assert.deepEqual(await getCachedUser("alice"), state.users.get("alice"));
  }
  assert.deepEqual(
    state.begins,
    ["alice", "user-roles:alice", "alice", "user-roles:alice", "alice", "user-roles:alice"],
    "duplicate invalidation in one operation is acquired once",
  );
  await withUserCacheInvalidation(async (invalidate) => {
    await invalidate(["alice"]);
    state.users.delete("alice");
  });
  assert.equal(await getCachedUser("alice"), null);
  const reads = state.reads;
  assert.equal(await getCachedUser("alice"), null);
  assert.equal(state.reads, reads);
  assert.equal(state.pending.size, 0);
});

test("rollback releases the fence and reloads the original profile", async (t) => {
  const state = setup(t);
  const original = await getCachedUser("alice");
  await assert.rejects(
    withUserCacheInvalidation(async (invalidate) => {
      await invalidate(["alice"]);
      const before = structuredClone(state.users.get("alice"));
      state.users.get("alice").name = "Uncommitted";
      assert.equal((await getCachedUser("alice")).name, "Uncommitted");
      state.users.set("alice", before);
      throw new Error("Rolled back");
    }),
    /Rolled back/,
  );
  assert.equal(state.pending.size, 0);
  assert.deepEqual(await getCachedUser("alice"), original);
  assert.equal(state.reads, 3);
});

test("partial invalidation failure releases previous fences before rejecting", async (t) => {
  const state = setup(t);
  state.failBegin = "bob";
  let mutated = false;
  await assert.rejects(
    withUserCacheInvalidation(async (invalidate) => {
      await invalidate(["alice", "bob"]);
      mutated = true;
    }),
    /Invalidation unavailable/,
  );
  assert.equal(mutated, false);
  assert.deepEqual(state.ends, ["alice", "user-roles:alice"]);
  assert.equal(state.pending.size, 0);
});

test("cache bypass and invalid cache data always reload the database", async (t) => {
  const state = setup(t);
  state.disabled = true;
  await getCachedUser("alice");
  await getCachedUser("alice");
  assert.equal(state.reads, 2);
  await withUserCacheInvalidation(async (invalidate) => {
    await invalidate(["alice"]);
  });
  assert.equal(state.pending.size, 0);
  state.disabled = false;
  for (const bad of [
    false,
    { ...state.users.get("alice"), id: "bob" },
    { ...state.users.get("alice"), status: "unknown" },
    { ...state.users.get("alice"), updatedAt: "bad date" },
  ]) {
    state.entries.set("alice", JSON.stringify(bad));
    assert.deepEqual(await getCachedUser("alice"), state.users.get("alice"));
  }
  assert.equal(state.reads, 6);
});

test("failed roles invalidation releases the user fence and prevents the mutation", async (t) => {
  const state = setup(t);
  state.failBegin = "user-roles:alice";
  let mutated = false;
  await assert.rejects(
    withUserCacheInvalidation(async (invalidate) => {
      await invalidate(["alice"]);
      mutated = true;
    }),
    /Invalidation unavailable/,
  );
  assert.equal(mutated, false);
  assert.deepEqual(state.ends, ["alice"]);
  assert.equal(state.pending.size, 0);
});
