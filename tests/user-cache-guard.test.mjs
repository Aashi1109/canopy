import { expect, test, vi, afterEach, onTestFinished } from "vitest";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import redisClient from "redis";
import { createServer } from "node:net";
import { Cache, closeRedis } from "../lib/cache/index.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

const run = promisify(execFile);

function configure(t, enabled = true) {
  for (const name of ["REDIS_URL"]) {
    const previous = process.env[name];
    onTestFinished(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
    if (enabled) process.env[name] = "redis://127.0.0.1:6379";
    else delete process.env[name];
  }
  onTestFinished(() => closeRedis());
}

test("guarded user cache bypasses unconfigured Redis and fails closed before writes", async (t) => {
  const cache = new Cache("user");
  await (async (t) => {
    configure(t, false);
    vi.spyOn(redisClient, "createClient").mockImplementation(() => expect.fail("Redis must not be called"));
    expect(await cache.rememberGuarded("one", async () => ({ active: true }), 3600)).toEqual({ active: true });
    expect(await cache.beginInvalidation("one", 3600)).toBe(null);
    await cache.endInvalidation("one", null, 3600);
  })();
  await (async (t) => {
    configure(t);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(redisClient, "createClient").mockImplementation(() => ({
      isOpen: false,
      on() {
        return this;
      },
      async connect() {
        throw new Error("Redis unavailable");
      },
    }));
    expect(await cache.rememberGuarded("one", async () => "database", 3600)).toBe("database");
    await expect(cache.beginInvalidation("one", 3600)).rejects.toThrow(/Redis cache unavailable/);
    await cache.endInvalidation("one", "already-committed", 3600);
  })();
  await (async (t) => {
    configure(t);
    vi.spyOn(redisClient, "createClient").mockImplementation(() => ({
      isOpen: false,
      on() {
        return this;
      },
      async connect() {
        this.isOpen = true;
        return this;
      },
      async sendCommand() {
        return null;
      },
      destroy() {
        this.isOpen = false;
      },
    }));
    await expect(cache.beginInvalidation("one", 3600)).rejects.toThrow(/Cache invalidation failed/);
  })();
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
  const reservation = createServer();
  await new Promise((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  process.env.REDIS_URL = `redis://default:test-cache-password@127.0.0.1:${port}/5`;
  const directory = await mkdtemp(join(tmpdir(), "user-cache-guard-"));
  const socket = join(directory, "redis.sock");
  const server = spawn(
    "redis-server",
    [
      "--bind",
      "127.0.0.1",
      "--port",
      String(port),
      "--requirepass",
      "test-cache-password",
      "--unixsocket",
      socket,
      "--save",
      "",
      "--appendonly",
      "no",
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let serverOutput = "";
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk;
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk;
  });
  onTestFinished(async () => {
    closeRedis();
    server.kill();
    await new Promise((resolve) =>
      server.exitCode !== null || server.signalCode !== null ? resolve() : server.once("exit", resolve),
    );
    await rm(directory, { recursive: true, force: true });
  });
  const redis = async (...args) => {
    const { stdout } = await run("redis-cli", [
      "-s",
      socket,
      "-a",
      "test-cache-password",
      "-n",
      "5",
      "--json",
      ...args,
    ]);
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
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const createClient = redisClient.createClient;
  vi.spyOn(redisClient, "createClient").mockImplementation((...options) => {
    const client = createClient(...options);
    const send = client.sendCommand.bind(client);
    client.sendCommand = async (args) => {
      if (failRedis) throw new Error("Redis unavailable");
      return send(args);
    };
    return client;
  });
  const cache = new Cache("user");
  let row = { name: "Before", active: true };
  let reads = 0;
  const load = async () => {
    reads++;
    return structuredClone(row);
  };
  expect(await cache.rememberGuarded("one", load, 3600)).toEqual(row);
  expect(await cache.rememberGuarded("one", load, 3600)).toEqual(row);
  expect(reads).toBe(1);
  expect(await redis("KEYS", "*")).toEqual(["user:one"]);
  expect((await redis("TTL", "user:one")) > 3590).toBeTruthy();
  await cache.rememberGuarded("array", async () => ({ roles: [] }), 3600);
  expect(await cache.rememberGuarded("array", () => expect.fail("array payload is cached"), 3600)).toEqual({
    roles: [],
  });

  const first = await cache.beginInvalidation("one", 3600);
  const second = await cache.beginInvalidation("one", 3600);
  expect(await redis("TTL", "user:one"), "pending mutation must not expire and permit stale caching").toBe(-1);
  row = { name: "Updated", active: false };
  await cache.endInvalidation("one", first, 3600);
  await cache.rememberGuarded("one", load, 3600);
  await cache.rememberGuarded("one", load, 3600);
  expect(reads, "another mutation still pending bypasses caching").toBe(3);
  await cache.endInvalidation("one", second, 3600);
  await cache.rememberGuarded("one", load, 3600);
  await cache.rememberGuarded("one", load, 3600);
  expect(reads, "cache resumes after all mutations finish").toBe(4);

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
  expect(await cache.rememberGuarded("race", load, 3600), "old read cannot refill after invalidation").toEqual(row);

  const failedRelease = await cache.beginInvalidation("race", 3600);
  row.active = false;
  failRedis = true;
  await cache.endInvalidation("race", failedRelease, 3600);
  failRedis = false;
  const previousReads = reads;
  expect(await cache.rememberGuarded("race", load, 3600)).toEqual(row);
  expect(await cache.rememberGuarded("race", load, 3600)).toEqual(row);
  expect(reads, "failed release remains a cache bypass").toBe(previousReads + 2);
  await cache.endInvalidation("race", failedRelease, 3600);

  const deletion = await cache.beginInvalidation("race", 3600);
  await cache.endInvalidation("race", deletion, 3600);
  expect(await cache.rememberGuarded("race", async () => null, 3600)).toBe(null);
  expect(await cache.rememberGuarded("race", () => expect.fail("deleted result is cached"), 3600)).toBe(null);

  await redis("SET", "user:broken", "{bad");
  expect(await cache.rememberGuarded("broken", load, 3600)).toEqual(row);
  await expect(cache.beginInvalidation("broken", 3600)).rejects.toThrow();
});
