import assert from "node:assert/strict";
import test from "node:test";
import axios from "axios";
import { PgDialect } from "drizzle-orm/pg-core";
import { authUser, db } from "@canopy/database";
import { Cache } from "@canopy/cache";
import { AuthorizationError, getUserAuthorization, withUserCacheInvalidation } from "@canopy/control-plane";

const initialTime = new Date("2026-09-16T00:00:00.000Z");
const changedTime = new Date("2026-09-16T00:00:01.000Z");
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
  const originalPost = axios.post;
  const variables = ["DATABASE_URL", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];
  const previous = variables.map((key) => process.env[key]);
  t.after(() => {
    db.select = originalSelect;
    axios.post = originalPost;
    variables.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  });
  process.env.DATABASE_URL = "postgres://test:test@localhost/test";
  process.env.UPSTASH_REDIS_REST_URL = "https://cache.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  const state = {
    users: new Map([
      ["alice", { status: "active", updatedAt: initialTime, roles: [editor] }],
      ["bob", { status: "active", updatedAt: initialTime, roles: [reader] }],
    ]),
    entries: new Map(),
    commands: [],
    statusReads: 0,
    roleReads: 0,
    redisError: false,
    databaseError: false,
    roleLoader: undefined,
  };
  const profileEntries = new Map();
  t.mock.method(Cache.prototype, "rememberGuarded", async function (id, load, ttl) {
    assert.equal(ttl, 3600);
    if (!process.env.UPSTASH_REDIS_REST_TOKEN || state.redisError) return load();
    if (profileEntries.has(id)) return JSON.parse(profileEntries.get(id));
    const value = await load();
    profileEntries.set(id, JSON.stringify(value));
    return value;
  });
  t.mock.method(Cache.prototype, "beginInvalidation", async function (id, ttl) {
    assert.equal(ttl, 3600);
    if (state.redisError) throw new Error("Redis unavailable");
    profileEntries.delete(id);
    return id;
  });
  t.mock.method(Cache.prototype, "endInvalidation", async function (id) {
    profileEntries.delete(id);
  });
  const dialect = new PgDialect();
  db.select = (fields) => {
    const statusQuery = fields === undefined;
    let userId;
    const query = {
      from(table) {
        if (statusQuery) assert.equal(table, authUser);
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
          return Promise.resolve(user ? [{
            id: userId, name: userId, email: `${userId}@example.test`, image: null,
            emailVerified: true, createdAt: initialTime, status: user.status, updatedAt: user.updatedAt,
          }] : []).then(
            resolve,
            reject,
          );
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
  axios.post = async (_url, command) => {
    state.commands.push(command);
    if (state.redisError) throw new Error("Redis unavailable");
    const [operation, key, value] = command;
    if (operation === "GET") return { data: { result: state.entries.get(key) ?? null } };
    assert.equal(operation, "SET");
    assert.deepEqual(command.slice(3), ["EX", "86400"]);
    state.entries.set(key, value);
    return { data: { result: "OK" } };
  };
  return state;
}

test("authorization caches each user profile for one hour and roles for one day", async (t) => {
  const state = setup(t);
  assert.deepEqual(await getUserAuthorization("alice"), { roles: [editor], access: editor.access });
  assert.deepEqual(await getUserAuthorization("alice"), { roles: [editor], access: editor.access });
  assert.deepEqual(await getUserAuthorization("bob"), { roles: [reader], access: reader.access });
  assert.equal(state.roleReads, 2);
  assert.equal(state.statusReads, 2);
  assert.deepEqual(
    [...state.entries.keys()],
    [`user-roles:alice:${initialTime.toISOString()}`, `user-roles:bob:${initialTime.toISOString()}`],
  );
  assert.deepEqual(JSON.parse(state.entries.values().next().value), [editor]);
});

test("updated users bypass previous role entries", async (t) => {
  const state = setup(t);
  await getUserAuthorization("alice");
  await withUserCacheInvalidation(async (invalidate) => {
    await invalidate(["alice"]);
    state.users.set("alice", { status: "active", updatedAt: changedTime, roles: [reader] });
  });
  assert.deepEqual(await getUserAuthorization("alice"), { roles: [reader], access: reader.access });
  assert.equal(state.roleReads, 2);
  assert.equal(state.entries.size, 2);
  assert.deepEqual(await getUserAuthorization("alice"), { roles: [reader], access: reader.access });
  assert.equal(state.roleReads, 2);
});

test("suspended and deleted users cannot reuse cached authorization", async (t) => {
  const state = setup(t);
  await getUserAuthorization("alice");
  const commandsBefore = state.commands.length;
  await withUserCacheInvalidation(async (invalidate) => {
    await invalidate(["alice"]);
    state.users.get("alice").status = "suspended";
  });
  await assert.rejects(getUserAuthorization("alice"), AuthorizationError);
  await withUserCacheInvalidation(async (invalidate) => {
    await invalidate(["alice"]);
    state.users.delete("alice");
  });
  await assert.rejects(getUserAuthorization("alice"), AuthorizationError);
  assert.equal(state.commands.length, commandsBefore);
  assert.equal(state.roleReads, 1);
});

test("authorization falls back to the database without working Redis", async (t) => {
  const state = setup(t);
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  assert.deepEqual(await getUserAuthorization("alice"), { roles: [editor], access: editor.access });
  assert.equal(state.commands.length, 0);
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  state.redisError = true;
  assert.deepEqual(await getUserAuthorization("alice"), { roles: [editor], access: editor.access });
  assert.equal(state.roleReads, 2);
  assert.equal(state.entries.size, 0);
});

test("cached authorization avoids the database until explicit invalidation", async (t) => {
  const state = setup(t);
  await getUserAuthorization("alice");
  state.databaseError = true;
  assert.deepEqual(await getUserAuthorization("alice"), { roles: [editor], access: editor.access });
  await withUserCacheInvalidation(async (invalidate) => { await invalidate(["alice"]); });
  await assert.rejects(getUserAuthorization("alice"), /Database unavailable/);
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
    state.users.set("alice", { status: "active", updatedAt: changedTime, roles: [reader] });
  });
  state.roleLoader = undefined;
  assert.deepEqual(await getUserAuthorization("alice"), { roles: [reader], access: reader.access });
  release();
  await staleRead;
  assert.deepEqual(await getUserAuthorization("alice"), { roles: [reader], access: reader.access });
  assert.equal(state.roleReads, 2);
});
