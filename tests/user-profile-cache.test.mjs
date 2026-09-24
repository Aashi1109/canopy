import { expect, test, vi, afterEach, onTestFinished } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { Cache } from "../lib/cache/index.ts";
import { authUser, db } from "../db/index.ts";
import { getCachedUser, withUserCacheInvalidation } from "../lib/admin/index.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

function setup(t) {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgres://test:test@localhost/test";
  onTestFinished(() => {
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
  onTestFinished(() => {
    db.select = originalSelect;
  });
  db.select = () => {
    let id;
    const query = {
      from(table) {
        expect(table).toBe(authUser);
        return query;
      },
      where(condition) {
        [id] = dialect.sqlToQuery(condition).params;
        return query;
      },
      async limit(count) {
        expect(count).toBe(1);
        state.reads++;
        return users.has(id) ? [structuredClone(users.get(id))] : [];
      },
    };
    return query;
  };
  vi.spyOn(Cache.prototype, "rememberGuarded").mockImplementation(async function (id, load, ttl) {
    expect(ttl).toBe(this.namespace === "user" ? 3600 : 86400);
    if (this.namespace === "user-roles") id = `user-roles:${id}`;
    if (state.disabled || state.pending.has(id)) return load();
    if (state.entries.has(id)) return JSON.parse(state.entries.get(id));
    const version = state.versions.get(id);
    const value = await load();
    if (!state.pending.has(id) && state.versions.get(id) === version) state.entries.set(id, JSON.stringify(value));
    return value;
  });
  vi.spyOn(Cache.prototype, "beginInvalidation").mockImplementation(async function (id, ttl) {
    expect(ttl).toBe(this.namespace === "user" ? 3600 : 86400);
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
  vi.spyOn(Cache.prototype, "endInvalidation").mockImplementation(async function (id, token, ttl) {
    expect(ttl).toBe(this.namespace === "user" ? 3600 : 86400);
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
  expect(await getCachedUser("alice")).toEqual(state.users.get("alice"));
  const cached = await getCachedUser("alice");
  expect(cached).toEqual(state.users.get("alice"));
  expect(cached.createdAt instanceof Date).toBeTruthy();
  expect(cached.updatedAt instanceof Date).toBeTruthy();
  expect(await getCachedUser("bob")).toEqual(state.users.get("bob"));
  expect(state.reads).toBe(2);
});

test("profile edits, suspension, reactivation, and deletion invalidate the cached user", async (t) => {
  const state = setup(t);
  await getCachedUser("alice");
  for (const change of [{ name: "Updated", image: "/avatar.png" }, { status: "suspended" }, { status: "active" }]) {
    await withUserCacheInvalidation(async (invalidate) => {
      await invalidate(["alice", "alice"]);
      Object.assign(state.users.get("alice"), change);
      expect(await getCachedUser("alice")).toEqual(state.users.get("alice"));
    });
    expect(await getCachedUser("alice")).toEqual(state.users.get("alice"));
  }
  expect(state.begins, "duplicate invalidation in one operation is acquired once").toEqual([
    "alice",
    "user-roles:alice",
    "alice",
    "user-roles:alice",
    "alice",
    "user-roles:alice",
  ]);
  await withUserCacheInvalidation(async (invalidate) => {
    await invalidate(["alice"]);
    state.users.delete("alice");
  });
  expect(await getCachedUser("alice")).toBe(null);
  const reads = state.reads;
  expect(await getCachedUser("alice")).toBe(null);
  expect(state.reads).toBe(reads);
  expect(state.pending.size).toBe(0);
});

test("rollback releases the fence and reloads the original profile", async (t) => {
  const state = setup(t);
  const original = await getCachedUser("alice");
  await expect(
    withUserCacheInvalidation(async (invalidate) => {
      await invalidate(["alice"]);
      const before = structuredClone(state.users.get("alice"));
      state.users.get("alice").name = "Uncommitted";
      expect((await getCachedUser("alice")).name).toBe("Uncommitted");
      state.users.set("alice", before);
      throw new Error("Rolled back");
    }),
  ).rejects.toThrow(/Rolled back/);
  expect(state.pending.size).toBe(0);
  expect(await getCachedUser("alice")).toEqual(original);
  expect(state.reads).toBe(3);
});

test("partial invalidation failure releases previous fences before rejecting", async (t) => {
  const state = setup(t);
  state.failBegin = "bob";
  let mutated = false;
  await expect(
    withUserCacheInvalidation(async (invalidate) => {
      await invalidate(["alice", "bob"]);
      mutated = true;
    }),
  ).rejects.toThrow(/Invalidation unavailable/);
  expect(mutated).toBe(false);
  expect(state.ends).toEqual(["alice", "user-roles:alice"]);
  expect(state.pending.size).toBe(0);
});

test("cache bypass and invalid cache data always reload the database", async (t) => {
  const state = setup(t);
  state.disabled = true;
  await getCachedUser("alice");
  await getCachedUser("alice");
  expect(state.reads).toBe(2);
  await withUserCacheInvalidation(async (invalidate) => {
    await invalidate(["alice"]);
  });
  expect(state.pending.size).toBe(0);
  state.disabled = false;
  for (const bad of [
    false,
    { ...state.users.get("alice"), id: "bob" },
    { ...state.users.get("alice"), status: "unknown" },
    { ...state.users.get("alice"), updatedAt: "bad date" },
  ]) {
    state.entries.set("alice", JSON.stringify(bad));
    expect(await getCachedUser("alice")).toEqual(state.users.get("alice"));
  }
  expect(state.reads).toBe(6);
});

test("failed roles invalidation releases the user fence and prevents the mutation", async (t) => {
  const state = setup(t);
  state.failBegin = "user-roles:alice";
  let mutated = false;
  await expect(
    withUserCacheInvalidation(async (invalidate) => {
      await invalidate(["alice"]);
      mutated = true;
    }),
  ).rejects.toThrow(/Invalidation unavailable/);
  expect(mutated).toBe(false);
  expect(state.ends).toEqual(["alice"]);
  expect(state.pending.size).toBe(0);
});
