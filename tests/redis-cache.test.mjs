import assert from "node:assert/strict";
import test from "node:test";
import redis from "redis";
import { Cache, closeRedis } from "@canopy/cache";

const metricKey = Symbol.for("@vercel/rusty-runtime-ipc");
function captureMetrics(t) {
  const previous = globalThis[metricKey];
  const metrics = [];
  globalThis[metricKey] = { sendMetric: (...args) => metrics.push(args) };
  t.after(() => {
    if (previous === undefined) delete globalThis[metricKey];
    else globalThis[metricKey] = previous;
  });
  return metrics;
}

test("caller-owned cache namespaces support get/set/delete, TTLs, fallback and validation", async (t) => {
  const metrics = captureMetrics(t);
  const variables = ["REDIS_URL"];
  const previous = Object.fromEntries(variables.map((key) => [key, process.env[key]]));
  t.after(async () => {
    await closeRedis();
    for (const key of variables) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
  process.env.REDIS_URL = "rediss://default:private%2Dtoken@cache.example.test:6380/5";
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
    const previousMetrics = metrics.length;
    const previousLoads = loads;
    assert.equal(await roles.get("all"), null);
    await roles.remember("all", load);
    await roles.set("all", []);
    await roles.delete("all");
    assert.equal(loads, previousLoads + 1);
    assert.equal(calls.length, previousCalls);
    assert.equal(metrics.length, previousMetrics, "disabled caching emits no command metrics");
    process.env[variable] = saved;
  }
  assert.equal(metrics.length, calls.length, "each Redis command emits exactly one duration");
  for (const [index, [name, duration, attributes]] of metrics.entries()) {
    assert.equal(name, "redis.command.duration_ms");
    assert.ok(Number.isFinite(duration) && duration >= 0);
    assert.deepEqual(Object.keys(attributes).sort(), ["command", "status"]);
    assert.equal(attributes.command, calls[index][0]);
    assert.ok(["success", "error"].includes(attributes.status));
  }
  assert.ok(metrics.some(([, , attributes]) => attributes.status === "error"));
  assert.ok(!JSON.stringify(metrics).includes("private-token"));
  t.mock.method(globalThis[metricKey], "sendMetric", () => {
    throw new Error("Metric sink unavailable");
  });
  await roles.set("metrics-failure", ["still cached"]);
  assert.deepEqual(await roles.get("metrics-failure"), ["still cached"]);
});

test("Redis connections are lazy, shared, recoverable, and bounded", async (t) => {
  const metrics = captureMetrics(t);
  const variables = ["REDIS_URL"];
  const previous = variables.map((key) => process.env[key]);
  for (const key of variables) delete process.env[key];
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
  assert.deepEqual(metrics.at(-1)[2], { command: "EVAL", status: "error" });
  failConnect = false;
  await cache.get("all");
  assert.equal(clients.length, 4, "a failed connection does not poison later calls");
  stall = true;
  assert.equal(await cache.get("all"), null, "a stalled server becomes a cache miss");
  assert.deepEqual(metrics.at(-1)[2], { command: "GET", status: "error" });
  assert.ok(metrics.at(-1)[1] >= 900, "duration includes the Redis timeout wait");
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
