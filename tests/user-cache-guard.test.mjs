import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import axios from "axios";
import { Cache } from "@canopy/cache";

const run = promisify(execFile);

function configure(t, enabled = true) {
  for (const name of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
    const previous = process.env[name];
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
    if (enabled) process.env[name] = name.endsWith("URL") ? "https://cache.example.test" : "test-token";
    else delete process.env[name];
  }
}

test("guarded user cache bypasses unconfigured Redis and fails closed before writes", async (t) => {
  const cache = new Cache("user");
  await t.test("unconfigured caching allows database reads and mutations", async (t) => {
    configure(t, false);
    t.mock.method(axios, "post", () => assert.fail("Redis must not be called"));
    assert.deepEqual(await cache.rememberGuarded("one", async () => ({ active: true }), 3600), { active: true });
    assert.equal(await cache.beginInvalidation("one", 3600), null);
    await cache.endInvalidation("one", null, 3600);
  });
  await t.test("Redis outages preserve reads but block starting a mutation", async (t) => {
    configure(t);
    t.mock.method(console, "warn", () => {});
    t.mock.method(axios, "post", async () => {
      throw new Error("Redis unavailable");
    });
    assert.equal(await cache.rememberGuarded("one", async () => "database", 3600), "database");
    await assert.rejects(cache.beginInvalidation("one", 3600), /Redis unavailable/);
    await cache.endInvalidation("one", "already-committed", 3600);
  });
  await t.test("unexpected Redis acknowledgements block mutations", async (t) => {
    configure(t);
    t.mock.method(axios, "post", async () => ({ data: { result: null } }));
    await assert.rejects(cache.beginInvalidation("one", 3600), /Cache invalidation failed/);
  });
});

test("guarded user cache prevents stale fills and overlapping mutation races with real Redis", async (t) => {
  try {
    await run("redis-server", ["--version"]);
    await run("redis-cli", ["--version"]);
  } catch {
    t.skip("redis-server and redis-cli required for atomic Lua regression checks");
    return;
  }
  configure(t);
  const directory = await mkdtemp(join(tmpdir(), "user-cache-guard-"));
  const socket = join(directory, "redis.sock");
  const server = spawn("redis-server", ["--port", "0", "--unixsocket", socket, "--save", "", "--appendonly", "no"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverOutput = "";
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk;
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk;
  });
  t.after(async () => {
    server.kill();
    await new Promise((resolve) =>
      server.exitCode !== null || server.signalCode !== null ? resolve() : server.once("exit", resolve),
    );
    await rm(directory, { recursive: true, force: true });
  });
  const redis = async (...args) => {
    const { stdout } = await run("redis-cli", ["-s", socket, "--json", ...args]);
    return JSON.parse(stdout);
  };
  for (let attempt = 0; ; attempt++) {
    try {
      await redis("PING");
      break;
    } catch (error) {
      if (server.exitCode !== null) {
        if (serverOutput.includes("Operation not permitted")) {
          t.skip("sandbox does not permit a temporary Redis UNIX socket");
          return;
        }
        throw new Error(serverOutput);
      }
      if (attempt === 100) throw error;
      await delay(20);
    }
  }
  let failRedis = false;
  t.mock.method(console, "warn", () => {});
  t.mock.method(axios, "post", async (_url, args) => {
    if (failRedis) throw new Error("Redis unavailable");
    return { data: { result: await redis(...args) } };
  });
  const cache = new Cache("user");
  let row = { name: "Before", active: true };
  let reads = 0;
  const load = async () => {
    reads++;
    return structuredClone(row);
  };
  assert.deepEqual(await cache.rememberGuarded("one", load, 3600), row);
  assert.deepEqual(await cache.rememberGuarded("one", load, 3600), row);
  assert.equal(reads, 1);
  assert.deepEqual(await redis("KEYS", "*"), ["user:one"]);
  assert.ok((await redis("TTL", "user:one")) > 3590);
  await cache.rememberGuarded("array", async () => ({ roles: [] }), 3600);
  assert.deepEqual(await cache.rememberGuarded("array", () => assert.fail("array payload is cached"), 3600), {
    roles: [],
  });

  const first = await cache.beginInvalidation("one", 3600);
  const second = await cache.beginInvalidation("one", 3600);
  assert.equal(await redis("TTL", "user:one"), -1, "pending mutation must not expire and permit stale caching");
  row = { name: "Updated", active: false };
  await cache.endInvalidation("one", first, 3600);
  await cache.rememberGuarded("one", load, 3600);
  await cache.rememberGuarded("one", load, 3600);
  assert.equal(reads, 3, "another mutation still pending bypasses caching");
  await cache.endInvalidation("one", second, 3600);
  await cache.rememberGuarded("one", load, 3600);
  await cache.rememberGuarded("one", load, 3600);
  assert.equal(reads, 4, "cache resumes after all mutations finish");

  let releaseOld;
  let startedOld;
  const started = new Promise((resolve) => {
    startedOld = resolve;
  });
  const old = cache.rememberGuarded(
    "race",
    async () => {
      const oldRow = structuredClone(row);
      startedOld();
      await new Promise((resolve) => {
        releaseOld = resolve;
      });
      return oldRow;
    },
    3600,
  );
  await started;
  const token = await cache.beginInvalidation("race", 3600);
  row = { name: "After race", active: true };
  await cache.endInvalidation("race", token, 3600);
  releaseOld();
  await old;
  assert.deepEqual(await cache.rememberGuarded("race", load, 3600), row, "old read cannot refill after invalidation");

  const failedRelease = await cache.beginInvalidation("race", 3600);
  row.active = false;
  failRedis = true;
  await cache.endInvalidation("race", failedRelease, 3600);
  failRedis = false;
  const previousReads = reads;
  assert.deepEqual(await cache.rememberGuarded("race", load, 3600), row);
  assert.deepEqual(await cache.rememberGuarded("race", load, 3600), row);
  assert.equal(reads, previousReads + 2, "failed release remains a cache bypass");
  await cache.endInvalidation("race", failedRelease, 3600);

  const deletion = await cache.beginInvalidation("race", 3600);
  await cache.endInvalidation("race", deletion, 3600);
  assert.equal(await cache.rememberGuarded("race", async () => null, 3600), null);
  assert.equal(await cache.rememberGuarded("race", () => assert.fail("deleted result is cached"), 3600), null);

  await redis("SET", "user:broken", "{bad");
  assert.deepEqual(await cache.rememberGuarded("broken", load, 3600), row);
  await assert.rejects(cache.beginInvalidation("broken", 3600));
});
