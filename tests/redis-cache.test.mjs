import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import redis from "redis";

const spans = [];
let failTracing = false;
let failSpanEnd = false;
globalThis.__cacheTracingSentry = {
  startInactiveSpan(options) {
    if (failTracing) throw new Error("Tracing unavailable");
    const span = { options, ended: 0, started: performance.now() };
    spans.push(span);
    return {
      setStatus(status) {
        span.status = status;
      },
      end() {
        span.ended++;
        span.duration = performance.now() - span.started;
        if (failSpanEnd) throw new Error("Tracing unavailable");
      },
    };
  },
};
const cacheUrl = new URL("../lib/cache/index.ts", import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@sentry/core" && context.parentURL === cacheUrl) {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export const {startInactiveSpan} = globalThis.__cacheTracingSentry",
      };
    }
    return nextResolve(specifier, context);
  },
});
const { Cache, closeRedis } = await import("../lib/cache/index.ts");
hooks.deregister();
delete globalThis.__cacheTracingSentry;

test("caller-owned cache namespaces support get/set/delete, TTLs, fallback and validation", async (t) => {
  spans.length = 0;
  failTracing = false;
  failSpanEnd = false;
  const variables = ["REDIS_URL", "CACHE_ENABLED"];
  const previous = Object.fromEntries(variables.map((key) => [key, process.env[key]]));
  t.after(async () => {
    await closeRedis();
    for (const key of variables) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
  process.env.REDIS_URL = "rediss://default:private%2Dtoken@cache.example.test:6380/5";
  process.env.CACHE_ENABLED = "true";
  const stored = new Map();
  const calls = [];
  const warnings = [];
  let now = 0;
  let failure;
  t.mock.method(console, "warn", (...args) => warnings.push(args.join(" ")));
  let connections = 0;
  const client = {
    isOpen: false,
    isReady: false,
    on() {
      return this;
    },
    async connect() {
      this.isOpen = this.isReady = true;
      return this;
    },
    destroy() {
      this.isOpen = this.isReady = false;
    },
    async sendCommand(command) {
      calls.push(command);
      if (failure) return failure(command);
      const [operation, key, value, expiry, seconds] = command;
      let result;
      if (operation === "GET") {
        const entry = stored.get(key);
        result = entry && entry.expires > now ? entry.value : null;
      } else if (operation === "SET") {
        assert.equal(expiry, "EX");
        stored.set(key, { value, expires: now + Number(seconds) });
        result = "OK";
      } else {
        assert.equal(operation, "DEL");
        result = Number(stored.delete(key));
      }
      return result;
    },
  };
  const createClient = redis.createClient;
  t.mock.method(redis, "createClient", (options) => {
    const parsed = createClient(options).options;
    connections++;
    assert.equal(options.url, process.env.REDIS_URL);
    assert.equal(parsed.socket.host, "cache.example.test");
    assert.equal(parsed.socket.port, 6380);
    assert.equal(parsed.socket.tls, true);
    assert.equal(options.socket.connectTimeout, 1000);
    assert.equal(options.socket.reconnectStrategy, false);
    assert.equal(options.disableOfflineQueue, true);
    assert.equal(parsed.username, "default");
    assert.equal(parsed.password, "private-token");
    assert.equal(parsed.database, 5);
    return client;
  });

  const roles = new Cache("roles");
  const catalog = new Cache("catalog");
  assert.equal(await roles.get("all"), null);
  await roles.set("all", ["editor"], 10);
  assert.deepEqual(await roles.get("all"), ["editor"]);
  assert.equal(await catalog.get("all"), null);
  assert.equal(await roles.get("different"), null);
  assert.deepEqual(calls[1], ["SET", "roles:all", '["editor"]', "EX", "10"]);
  await new Cache("my:literal namespace").set("my:key", []);
  assert.equal(calls.at(-1)[1], "my:literal namespace:my:key");
  assert.equal(calls.at(-1).at(-1), "300");
  now = 11;
  assert.equal(await roles.get("all"), null);

  let loads = 0;
  const load = async () => [`value-${++loads}`];
  assert.deepEqual(await roles.remember("all", load), ["value-1"]);
  assert.deepEqual(await roles.remember("all", load), ["value-1"]);
  assert.equal(loads, 1);
  await roles.delete("all");
  assert.deepEqual(await roles.remember("all", load), ["value-2"]);

  stored.set("roles:all", { value: "{broken", expires: Infinity });
  assert.deepEqual(await roles.remember("all", load), ["value-3"]);
  for (const response of [
    () => {
      throw new Error("private-token postgres://private-database");
    },
    () => ({ unexpected: true }),
    () => {
      throw new Error("Redis connection lost");
    },
  ]) {
    failure = response;
    const previousLoads = loads;
    assert.equal(await roles.get("all"), null);
    assert.deepEqual(await roles.remember("all", load), [`value-${previousLoads + 1}`]);
    await roles.set("all", []);
    await roles.delete("all");
  }
  failure = (command) => (command[0] === "GET" ? null : Promise.reject(new Error("write failed private-token")));
  const previousLoads = loads;
  assert.deepEqual(await roles.remember("all", load), [`value-${previousLoads + 1}`]);
  await assert.rejects(
    () =>
      roles.remember("all", async () => {
        throw new Error("DB unavailable");
      }),
    /DB unavailable/,
  );
  failure = undefined;
  assert.ok(warnings.every((warning) => !warning.includes("private-token") && !warning.includes("postgres://")));

  for (const namespace of ["", " "]) assert.throws(() => new Cache(namespace), /namespace/);
  await assert.rejects(() => roles.get(""), /key/);
  await assert.rejects(() => roles.set("", []), /key/);
  await assert.rejects(() => roles.delete(""), /key/);
  for (const ttl of [0, -1, 1.5, Infinity, NaN]) {
    await assert.rejects(() => roles.set("all", [], ttl), /positive integer/);
  }

  assert.equal(connections, 1, "all cache namespaces reuse one connection");
  for (const variable of ["REDIS_URL"]) {
    const saved = process.env[variable];
    delete process.env[variable];
    const previousCalls = calls.length;
    const previousSpans = spans.length;
    const previousLoads = loads;
    assert.equal(await roles.get("all"), null);
    await roles.remember("all", load);
    await roles.set("all", []);
    await roles.delete("all");
    assert.equal(loads, previousLoads + 1);
    assert.equal(calls.length, previousCalls);
    assert.equal(spans.length, previousSpans, "disabled caching creates no spans");
    process.env[variable] = saved;
  }
  assert.equal(spans.length, calls.length, "each command creates exactly one span");
  assert.ok(spans.some((span) => span.status.code === 2));
  for (const [index, span] of spans.entries()) {
    assert.deepEqual(span.options, {
      name: `redis.${calls[index][0]}`,
      op: "db.redis",
      onlyIfParent: true,
      attributes: { "db.system": "redis" },
    });
    assert.equal(span.ended, 1);
    assert.ok([1, 2].includes(span.status.code));
  }
  assert.ok(!JSON.stringify(spans).includes("roles:all"), "cache keys are never recorded");
  assert.ok(!JSON.stringify(spans).includes("private-token"), "connection errors and credentials are never recorded");
  failSpanEnd = true;
  await roles.set("span-end-failure", ["still cached"]);
  assert.deepEqual(await roles.get("span-end-failure"), ["still cached"]);
  assert.ok(
    spans.every((span) => span.ended === 1),
    "span completion failures never alter cache results",
  );
  failTracing = true;
  await roles.set("tracing-failure", ["still cached"]);
  assert.deepEqual(await roles.get("tracing-failure"), ["still cached"]);
});

test("Redis connections are lazy, shared, recoverable, and bounded", async (t) => {
  spans.length = 0;
  failTracing = false;
  failSpanEnd = false;
  const variables = ["REDIS_URL", "CACHE_ENABLED"];
  const previous = variables.map((key) => process.env[key]);
  for (const key of variables) delete process.env[key];
  process.env.CACHE_ENABLED = "true";
  t.after(() => {
    closeRedis();
    variables.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  });
  t.mock.method(console, "warn", () => {});
  const clients = [];
  let failConnect = false;
  let stall = false;
  const createClient = redis.createClient;
  t.mock.method(redis, "createClient", (options) => {
    createClient(options); // Exercise the real URL validation without opening a socket.
    const client = {
      isOpen: false,
      on(event) {
        assert.equal(event, "error");
        return this;
      },
      async connect() {
        if (failConnect) throw new Error("secret password");
        this.isOpen = true;
        return this;
      },
      async sendCommand() {
        return stall ? new Promise(() => {}) : null;
      },
      destroy() {
        this.isOpen = false;
      },
    };
    clients.push(client);
    return client;
  });
  const cache = new Cache("roles");
  assert.equal(await cache.get("all"), null);
  assert.equal(clients.length, 0, "disabled caching never connects");
  process.env.REDIS_URL = "redis://cache.example.test:6379";
  await Promise.all([cache.get("all"), new Cache("catalog").get("all")]);
  assert.equal(clients.length, 1, "concurrent commands share the connection");
  clients[0].destroy();
  await cache.get("all");
  assert.equal(clients.length, 2, "next command reconnects after a closed socket");
  closeRedis();
  failConnect = true;
  await assert.rejects(cache.beginInvalidation("all"), /^Error: Redis cache unavailable$/);
  assert.equal(spans.at(-1).options.name, "redis.EVAL");
  assert.deepEqual(spans.at(-1).status, { code: 2 });
  assert.equal(spans.at(-1).ended, 1);
  failConnect = false;
  await cache.get("all");
  assert.equal(clients.length, 4, "a failed connection does not poison later calls");
  stall = true;
  assert.equal(await cache.get("all"), null, "a stalled server becomes a cache miss");
  assert.equal(spans.at(-1).options.name, "redis.GET");
  assert.deepEqual(spans.at(-1).status, { code: 2 });
  assert.equal(spans.at(-1).ended, 1);
  assert.ok(spans.at(-1).duration >= 900, "duration includes the Redis timeout wait");
  assert.equal(clients.at(-1).isOpen, false, "timeout destroys the stalled socket");
  stall = false;
  await cache.get("all");
  assert.equal(clients.length, 5);
  closeRedis();
  for (const url of ["https://default:secret@cache.example.test", "not-a-url", "redis://cache.example.test:99999"]) {
    process.env.REDIS_URL = url;
    await assert.rejects(cache.beginInvalidation("all"), /^Error: Redis cache unavailable$/);
  }
  process.env.REDIS_URL = "redis://cache.example.test:6379";
  assert.equal(clients.length, 5, "invalid connection settings never open a socket");

  const navigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "Cloudflare-Workers" } });
  t.after(() => {
    if (navigator) Object.defineProperty(globalThis, "navigator", navigator);
    else delete globalThis.navigator;
  });
  await Promise.all([cache.get("all"), cache.get("all")]);
  assert.equal(clients.length, 7, "Workers never share sockets across requests");
  assert.ok(
    clients.slice(-2).every((client) => !client.isOpen),
    "Worker sockets close after commands",
  );
});

test("disabled cache reads load fresh while writes and authorization invalidation remain active", async (t) => {
  closeRedis();
  spans.length = 0;
  failTracing = false;
  failSpanEnd = false;
  const variables = ["NODE_ENV", "CACHE_ENABLED", "REDIS_URL"];
  const previous = variables.map((key) => process.env[key]);
  t.after(() => {
    closeRedis();
    variables.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  });
  process.env.REDIS_URL = "redis://cache.example.test:6379";
  const stored = new Map([["users:alice", JSON.stringify({ role: "cached" })]]);
  const calls = [];
  let connections = 0;
  let evalResult = JSON.stringify({ generation: "existing", pending: {}, value: JSON.stringify({ role: "cached" }) });
  t.mock.method(redis, "createClient", () => {
    connections++;
    return {
      isOpen: false,
      on() {
        return this;
      },
      async connect() {
        this.isOpen = true;
        return this;
      },
      destroy() {
        this.isOpen = false;
      },
      async sendCommand(command) {
        calls.push(command);
        const [operation, key, value] = command;
        if (operation === "GET") return stored.get(key) ?? null;
        if (operation === "SET") {
          stored.set(key, value);
          return "OK";
        }
        if (operation === "DEL") return Number(stored.delete(key));
        assert.equal(operation, "EVAL");
        return evalResult;
      },
    };
  });
  const cache = new Cache("users");
  let guardedLoads = 0;
  const loadGuarded = async () => ({ role: `fresh-${++guardedLoads}` });
  for (const [environment, override] of [
    ["development", undefined],
    ["production", "false"],
  ]) {
    process.env.NODE_ENV = environment;
    if (override === undefined) delete process.env.CACHE_ENABLED;
    else process.env.CACHE_ENABLED = override;
    const previousLoads = guardedLoads;
    assert.equal(await cache.get("alice"), null, "stored values are ignored when cache reads are disabled");
    assert.deepEqual(await cache.rememberGuarded("alice", loadGuarded), { role: `fresh-${previousLoads + 1}` });
    assert.deepEqual(await cache.rememberGuarded("alice", loadGuarded), { role: `fresh-${previousLoads + 2}` });
  }
  assert.equal(connections, 0, "disabled reads do not open Redis connections");
  assert.equal(calls.length, 0);
  assert.equal(spans.length, 0, "disabled reads do not create Redis spans");
  await assert.rejects(cache.get(""), /key/);
  await assert.rejects(cache.rememberGuarded("alice", loadGuarded, 0), /positive integer/);
  await assert.rejects(
    cache.rememberGuarded("alice", async () => {
      throw new Error("Database unavailable");
    }),
    /Database unavailable/,
  );

  let loads = 0;
  const load = async () => ({ role: `updated-${++loads}` });
  assert.deepEqual(await cache.remember("alice", load), { role: "updated-1" });
  assert.deepEqual(await cache.remember("alice", load), { role: "updated-2" });
  assert.equal(loads, 2, "remember loads fresh on every disabled read");
  assert.deepEqual(JSON.parse(stored.get("users:alice")), { role: "updated-2" });
  assert.ok(
    calls.every(([operation]) => operation === "SET"),
    "remember still refreshes storage for enabled readers",
  );
  await cache.delete("alice");
  assert.equal(stored.has("users:alice"), false, "deletion remains active for other enabled readers");
  await cache.set("alice", { role: "restored" });
  evalResult = 1;
  const beforeInvalidation = calls.length;
  const token = await cache.beginInvalidation("alice");
  assert.equal(typeof token, "string", "disabled reads still acquire the authorization mutation fence");
  await cache.endInvalidation("alice", token);
  assert.equal(calls.length, beforeInvalidation + 2, "both mutation fence operations reach Redis");

  process.env.NODE_ENV = "development";
  process.env.CACHE_ENABLED = "true";
  assert.deepEqual(await cache.get("alice"), { role: "restored" });
  assert.deepEqual(await cache.remember("alice", load), { role: "restored" });
  assert.equal(loads, 2, "explicitly enabling reads restores cache hits in development");
  evalResult = JSON.stringify({ generation: "existing", pending: {}, value: JSON.stringify({ role: "guarded" }) });
  assert.deepEqual(await cache.rememberGuarded("alice", loadGuarded), { role: "guarded" });
  assert.equal(guardedLoads, 4, "explicitly enabling guarded reads restores cache hits");
});
