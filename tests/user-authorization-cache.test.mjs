import { expect, test, vi, afterEach, onTestFinished } from "vitest";
import redis from "redis";
import { PgDialect } from "drizzle-orm/pg-core";
import { authUser, db } from "../db/index.ts";
import { Cache } from "../lib/cache/index.ts";
import { AuthorizationError, getUserAuthorization, withUserCacheInvalidation } from "../lib/admin/index.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

const initialTime = new Date("2026-09-16T00:00:00.000Z");
const editor = {
  id: "editor",
  name: "Editor",
  description: "Edit tools",
  access: { tools: { view: true, edit: true } },
  isSystem: false,
};
const reader = {
  id: "reader",
  name: "Reader",
  description: "Read tools",
  access: { tools: { view: true } },
  isSystem: false,
};

function setup(t) {
  const originalSelect = db.select;
  const variables = ["DATABASE_URL", "REDIS_URL"];
  const previous = variables.map((key) => process.env[key]);
  onTestFinished(() => {
    db.select = originalSelect;
    variables.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  });
  process.env.DATABASE_URL = "postgres://test:test@localhost/test";
  process.env.REDIS_URL = "redis://cache.example.test:6379";
  const state = {
    users: new Map([
      ["alice", { status: "active", updatedAt: initialTime, roles: [editor] }],
      ["bob", { status: "active", updatedAt: initialTime, roles: [reader] }],
    ]),
    entries: new Map(),
    statusReads: 0,
    roleReads: 0,
    redisError: false,
    databaseError: false,
    roleLoader: undefined,
  };
  const pending = new Map();
  const generations = new Map();
  vi.spyOn(Cache.prototype, "rememberGuarded").mockImplementation(async function (id, load, ttl) {
    expect(ttl).toBe(this.namespace === "user" ? 3600 : 86400);
    const key = `${this.namespace}:${id}`;
    if (!process.env.REDIS_URL || state.redisError || pending.has(key)) return load();
    if (state.entries.has(key)) return JSON.parse(state.entries.get(key));
    const generation = generations.get(key);
    const value = await load();
    if (!pending.has(key) && generations.get(key) === generation) state.entries.set(key, JSON.stringify(value));
    return value;
  });
  vi.spyOn(Cache.prototype, "beginInvalidation").mockImplementation(async function (id, ttl) {
    expect(ttl).toBe(this.namespace === "user" ? 3600 : 86400);
    if (state.redisError) throw new Error("Redis unavailable");
    const key = `${this.namespace}:${id}`;
    const token = crypto.randomUUID();
    state.entries.delete(key);
    generations.set(key, token);
    pending.set(key, token);
    return token;
  });
  vi.spyOn(Cache.prototype, "endInvalidation").mockImplementation(async function (id, token) {
    const key = `${this.namespace}:${id}`;
    if (pending.get(key) === token) pending.delete(key);
    generations.set(key, crypto.randomUUID());
    state.entries.delete(key);
  });
  const dialect = new PgDialect();
  db.select = (fields) => {
    const statusQuery = fields === undefined;
    let userId;
    const query = {
      from(table) {
        if (statusQuery) expect(table).toBe(authUser);
        return query;
      },
      leftJoin() {
        return query;
      },
      innerJoin() {
        return query;
      },
      where(condition) {
        [userId] = dialect.sqlToQuery(condition).params;
        return query;
      },
      limit() {
        return query;
      },
      then(resolve, reject) {
        if (state.databaseError) return Promise.reject(new Error("Database unavailable")).then(resolve, reject);
        const user = state.users.get(userId);
        if (statusQuery) {
          state.statusReads++;
          return Promise.resolve(
            user
              ? [
                  {
                    id: userId,
                    name: userId,
                    email: `${userId}@example.test`,
                    image: null,
                    emailVerified: true,
                    createdAt: initialTime,
                    status: user.status,
                    updatedAt: user.updatedAt,
                  },
                ]
              : [],
          ).then(resolve, reject);
        }
        state.roleReads++;
        const rows = (user?.roles ?? []).map((role) => ({
          status: user.status,
          roleId: role.id,
          roleName: role.name,
          roleDescription: role.description,
          roleAccess: structuredClone(role.access),
          roleIsSystem: role.isSystem,
        }));
        return Promise.resolve(state.roleLoader ? state.roleLoader(rows) : rows).then(resolve, reject);
      },
    };
    return query;
  };
  vi.spyOn(redis, "createClient").mockImplementation(() =>
    expect.fail("cache is mocked; no Redis connections expected"),
  );
  return state;
}

test("authorization caches each user profile for one hour and roles for one day", async (t) => {
  const state = setup(t);
  expect(await getUserAuthorization("alice")).toEqual({ roles: [editor], access: editor.access });
  expect(await getUserAuthorization("alice")).toEqual({ roles: [editor], access: editor.access });
  expect(await getUserAuthorization("bob")).toEqual({ roles: [reader], access: reader.access });
  expect(state.roleReads).toBe(2);
  expect(state.statusReads).toBe(2);
  expect([...state.entries.keys()].filter((key) => key.startsWith("user-roles:"))).toEqual([
    "user-roles:alice",
    "user-roles:bob",
  ]);
  expect(JSON.parse(state.entries.get("user-roles:alice"))).toEqual([editor]);
});

test("user invalidation refreshes the same roles key without a timestamp change", async (t) => {
  const state = setup(t);
  await getUserAuthorization("alice");
  await withUserCacheInvalidation(async (invalidate) => {
    await invalidate(["alice"]);
    state.users.set("alice", { status: "active", updatedAt: initialTime, roles: [reader] });
  });
  expect(await getUserAuthorization("alice")).toEqual({ roles: [reader], access: reader.access });
  expect(state.roleReads).toBe(2);
  expect([...state.entries.keys()]).toEqual(["user:alice", "user-roles:alice"]);
  expect(await getUserAuthorization("alice")).toEqual({ roles: [reader], access: reader.access });
  expect(state.roleReads).toBe(2);
});

test("suspended and deleted users cannot reuse cached authorization", async (t) => {
  const state = setup(t);
  await getUserAuthorization("alice");
  await withUserCacheInvalidation(async (invalidate) => {
    await invalidate(["alice"]);
    state.users.get("alice").status = "suspended";
  });
  await expect(getUserAuthorization("alice")).rejects.toThrow(AuthorizationError);
  await withUserCacheInvalidation(async (invalidate) => {
    await invalidate(["alice"]);
    state.users.delete("alice");
  });
  await expect(getUserAuthorization("alice")).rejects.toThrow(AuthorizationError);
  expect(state.roleReads).toBe(1);
});

test("authorization falls back to the database without working Redis", async (t) => {
  const state = setup(t);
  delete process.env.REDIS_URL;
  expect(await getUserAuthorization("alice")).toEqual({ roles: [editor], access: editor.access });
  process.env.REDIS_URL = "redis://cache.example.test:6379";
  state.redisError = true;
  expect(await getUserAuthorization("alice")).toEqual({ roles: [editor], access: editor.access });
  expect(state.roleReads).toBe(2);
  expect(state.entries.size).toBe(0);
});

test("cached authorization avoids the database until explicit invalidation", async (t) => {
  const state = setup(t);
  await getUserAuthorization("alice");
  state.databaseError = true;
  expect(await getUserAuthorization("alice")).toEqual({ roles: [editor], access: editor.access });
  await withUserCacheInvalidation(async (invalidate) => {
    await invalidate(["alice"]);
  });
  await expect(getUserAuthorization("alice")).rejects.toThrow(/Database unavailable/);
});

test("a late cache fill from before an update cannot replace current authorization", async (t) => {
  const state = setup(t);
  let release;
  let started;
  const loading = new Promise((resolve) => {
    started = resolve;
  });
  state.roleLoader = (rows) =>
    new Promise((resolve) => {
      release = () => resolve(rows);
      started();
    });
  const staleRead = getUserAuthorization("alice");
  await loading;
  await withUserCacheInvalidation(async (invalidate) => {
    await invalidate(["alice"]);
    state.users.set("alice", { status: "active", updatedAt: initialTime, roles: [reader] });
  });
  state.roleLoader = undefined;
  expect(await getUserAuthorization("alice")).toEqual({ roles: [reader], access: reader.access });
  release();
  await staleRead;
  expect(await getUserAuthorization("alice")).toEqual({ roles: [reader], access: reader.access });
  expect(state.roleReads).toBe(2);
});
