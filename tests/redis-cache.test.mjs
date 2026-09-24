import { afterEach, expect, test, vi } from "vitest";
import redis from "redis";

// Hoisted so the vi.mock factory can reach the tracing harness; the harness is
// exposed on globalThis because the factory may only reference hoisted/global state.
const { spans, ctl } = vi.hoisted(() => {
  const spans = [];
  const ctl = { failTracing: false, failSpanEnd: false };
  globalThis.__cacheTracingSentry = {
    startInactiveSpan(options) {
      if (ctl.failTracing) throw new Error("Tracing unavailable");
      const span = { options, ended: 0, started: performance.now() };
      spans.push(span);
      return {
        setStatus(status) {
          span.status = status;
        },
        end() {
          span.ended++;
          span.duration = performance.now() - span.started;
          if (ctl.failSpanEnd) throw new Error("Tracing unavailable");
        },
      };
    },
  };
  return { spans, ctl };
});

vi.mock("@sentry/core", () => ({
  startInactiveSpan: (...args) => globalThis.__cacheTracingSentry.startInactiveSpan(...args),
}));

const { Cache, closeRedis } = await import("@/lib/cache/index.ts");

afterEach(() => vi.restoreAllMocks());

test("caller-owned cache namespaces support get/set/delete, TTLs, fallback and validation", async (t) => {
  spans.length = 0;
  ctl.failTracing = false;
  ctl.failSpanEnd = false;
  const variables = ["REDIS_URL", "CACHE_ENABLED"];
  const previous = Object.fromEntries(variables.map((key) => [key, process.env[key]]));
  t.onTestFinished(async () => {
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
  vi.spyOn(console, "warn").mockImplementation((...args) => warnings.push(args.join(" ")));
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
        expect(expiry).toBe("EX");
        stored.set(key, { value, expires: now + Number(seconds) });
        result = "OK";
      } else {
        expect(operation).toBe("DEL");
        result = Number(stored.delete(key));
      }
      return result;
    },
  };
  const createClient = redis.createClient;
  vi.spyOn(redis, "createClient").mockImplementation((options) => {
    const parsed = createClient(options).options;
    connections++;
    expect(options.url).toBe(process.env.REDIS_URL);
    expect(parsed.socket.host).toBe("cache.example.test");
    expect(parsed.socket.port).toBe(6380);
    expect(parsed.socket.tls).toBe(true);
    expect(options.socket.connectTimeout).toBe(1000);
    expect(options.socket.reconnectStrategy).toBe(false);
    expect(options.disableOfflineQueue).toBe(true);
    expect(parsed.username).toBe("default");
    expect(parsed.password).toBe("private-token");
    expect(parsed.database).toBe(5);
    return client;
  });

  const roles = new Cache("roles");
  const catalog = new Cache("catalog");
  expect(await roles.get("all")).toBe(null);
  await roles.set("all", ["editor"], 10);
  expect(await roles.get("all")).toEqual(["editor"]);
  expect(await catalog.get("all")).toBe(null);
  expect(await roles.get("different")).toBe(null);
  expect(calls[1]).toEqual(["SET", "roles:all", '["editor"]', "EX", "10"]);
  await new Cache("my:literal namespace").set("my:key", []);
  expect(calls.at(-1)[1]).toBe("my:literal namespace:my:key");
  expect(calls.at(-1).at(-1)).toBe("300");
  now = 11;
  expect(await roles.get("all")).toBe(null);

  let loads = 0;
  const load = async () => [`value-${++loads}`];
  expect(await roles.remember("all", load)).toEqual(["value-1"]);
  expect(await roles.remember("all", load)).toEqual(["value-1"]);
  expect(loads).toBe(1);
  await roles.delete("all");
  expect(await roles.remember("all", load)).toEqual(["value-2"]);

  stored.set("roles:all", { value: "{broken", expires: Infinity });
  expect(await roles.remember("all", load)).toEqual(["value-3"]);
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
    expect(await roles.get("all")).toBe(null);
    expect(await roles.remember("all", load)).toEqual([`value-${previousLoads + 1}`]);
    await roles.set("all", []);
    await roles.delete("all");
  }
  failure = (command) => (command[0] === "GET" ? null : Promise.reject(new Error("write failed private-token")));
  const previousLoads = loads;
  expect(await roles.remember("all", load)).toEqual([`value-${previousLoads + 1}`]);
  await expect(
    roles.remember("all", async () => {
      throw new Error("DB unavailable");
    }),
  ).rejects.toThrow(/DB unavailable/);
  failure = undefined;
  expect(
    warnings.every((warning) => !warning.includes("private-token") && !warning.includes("postgres://")),
  ).toBeTruthy();

  for (const namespace of ["", " "]) expect(() => new Cache(namespace)).toThrow(/namespace/);
  await expect(roles.get("")).rejects.toThrow(/key/);
  await expect(roles.set("", [])).rejects.toThrow(/key/);
  await expect(roles.delete("")).rejects.toThrow(/key/);
  for (const ttl of [0, -1, 1.5, Infinity, NaN]) {
    await expect(roles.set("all", [], ttl)).rejects.toThrow(/positive integer/);
  }

  expect(connections, "all cache namespaces reuse one connection").toBe(1);
  for (const variable of ["REDIS_URL"]) {
    const saved = process.env[variable];
    delete process.env[variable];
    const previousCalls = calls.length;
    const previousSpans = spans.length;
    const previousLoads = loads;
    expect(await roles.get("all")).toBe(null);
    await roles.remember("all", load);
    await roles.set("all", []);
    await roles.delete("all");
    expect(loads).toBe(previousLoads + 1);
    expect(calls.length).toBe(previousCalls);
    expect(spans.length, "disabled caching creates no spans").toBe(previousSpans);
    process.env[variable] = saved;
  }
  expect(spans.length, "each command creates exactly one span").toBe(calls.length);
  expect(spans.some((span) => span.status.code === 2)).toBeTruthy();
  for (const [index, span] of spans.entries()) {
    expect(span.options).toEqual({
      name: `redis.${calls[index][0]}`,
      op: "db.redis",
      onlyIfParent: true,
      attributes: { "db.system": "redis" },
    });
    expect(span.ended).toBe(1);
    expect([1, 2].includes(span.status.code)).toBeTruthy();
  }
  expect(!JSON.stringify(spans).includes("roles:all"), "cache keys are never recorded").toBeTruthy();
  expect(
    !JSON.stringify(spans).includes("private-token"),
    "connection errors and credentials are never recorded",
  ).toBeTruthy();
  ctl.failSpanEnd = true;
  await roles.set("span-end-failure", ["still cached"]);
  expect(await roles.get("span-end-failure")).toEqual(["still cached"]);
  expect(
    spans.every((span) => span.ended === 1),
    "span completion failures never alter cache results",
  ).toBeTruthy();
  ctl.failTracing = true;
  await roles.set("tracing-failure", ["still cached"]);
  expect(await roles.get("tracing-failure")).toEqual(["still cached"]);
});

test("Redis connections are lazy, shared, recoverable, and bounded", async (t) => {
  spans.length = 0;
  ctl.failTracing = false;
  ctl.failSpanEnd = false;
  const variables = ["REDIS_URL", "CACHE_ENABLED"];
  const previous = variables.map((key) => process.env[key]);
  for (const key of variables) delete process.env[key];
  process.env.CACHE_ENABLED = "true";
  t.onTestFinished(() => {
    closeRedis();
    variables.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const clients = [];
  let failConnect = false;
  let stall = false;
  const createClient = redis.createClient;
  vi.spyOn(redis, "createClient").mockImplementation((options) => {
    createClient(options); // Exercise the real URL validation without opening a socket.
    const client = {
      isOpen: false,
      on(event) {
        expect(event).toBe("error");
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
  expect(await cache.get("all")).toBe(null);
  expect(clients.length, "disabled caching never connects").toBe(0);
  process.env.REDIS_URL = "redis://cache.example.test:6379";
  await Promise.all([cache.get("all"), new Cache("catalog").get("all")]);
  expect(clients.length, "concurrent commands share the connection").toBe(1);
  clients[0].destroy();
  await cache.get("all");
  expect(clients.length, "next command reconnects after a closed socket").toBe(2);
  closeRedis();
  failConnect = true;
  await expect(cache.beginInvalidation("all")).rejects.toThrow(/^Redis cache unavailable$/);
  expect(spans.at(-1).options.name).toBe("redis.EVAL");
  expect(spans.at(-1).status).toEqual({ code: 2 });
  expect(spans.at(-1).ended).toBe(1);
  failConnect = false;
  await cache.get("all");
  expect(clients.length, "a failed connection does not poison later calls").toBe(4);
  stall = true;
  expect(await cache.get("all"), "a stalled server becomes a cache miss").toBe(null);
  expect(spans.at(-1).options.name).toBe("redis.GET");
  expect(spans.at(-1).status).toEqual({ code: 2 });
  expect(spans.at(-1).ended).toBe(1);
  expect(spans.at(-1).duration >= 900, "duration includes the Redis timeout wait").toBeTruthy();
  expect(clients.at(-1).isOpen, "timeout destroys the stalled socket").toBe(false);
  stall = false;
  await cache.get("all");
  expect(clients.length).toBe(5);
  closeRedis();
  for (const url of ["https://default:secret@cache.example.test", "not-a-url", "redis://cache.example.test:99999"]) {
    process.env.REDIS_URL = url;
    await expect(cache.beginInvalidation("all")).rejects.toThrow(/^Redis cache unavailable$/);
  }
  process.env.REDIS_URL = "redis://cache.example.test:6379";
  expect(clients.length, "invalid connection settings never open a socket").toBe(5);

  const navigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "Cloudflare-Workers" } });
  t.onTestFinished(() => {
    if (navigator) Object.defineProperty(globalThis, "navigator", navigator);
    else delete globalThis.navigator;
  });
  await Promise.all([cache.get("all"), cache.get("all")]);
  expect(clients.length, "Workers never share sockets across requests").toBe(7);
  expect(
    clients.slice(-2).every((client) => !client.isOpen),
    "Worker sockets close after commands",
  ).toBeTruthy();
});

test("disabled cache reads load fresh while writes and authorization invalidation remain active", async (t) => {
  closeRedis();
  spans.length = 0;
  ctl.failTracing = false;
  ctl.failSpanEnd = false;
  const variables = ["NODE_ENV", "CACHE_ENABLED", "REDIS_URL"];
  const previous = variables.map((key) => process.env[key]);
  t.onTestFinished(() => {
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
  vi.spyOn(redis, "createClient").mockImplementation(() => {
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
        expect(operation).toBe("EVAL");
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
    expect(await cache.get("alice"), "stored values are ignored when cache reads are disabled").toBe(null);
    expect(await cache.rememberGuarded("alice", loadGuarded)).toEqual({ role: `fresh-${previousLoads + 1}` });
    expect(await cache.rememberGuarded("alice", loadGuarded)).toEqual({ role: `fresh-${previousLoads + 2}` });
  }
  expect(connections, "disabled reads do not open Redis connections").toBe(0);
  expect(calls.length).toBe(0);
  expect(spans.length, "disabled reads do not create Redis spans").toBe(0);
  await expect(cache.get("")).rejects.toThrow(/key/);
  await expect(cache.rememberGuarded("alice", loadGuarded, 0)).rejects.toThrow(/positive integer/);
  await expect(
    cache.rememberGuarded("alice", async () => {
      throw new Error("Database unavailable");
    }),
  ).rejects.toThrow(/Database unavailable/);

  let loads = 0;
  const load = async () => ({ role: `updated-${++loads}` });
  expect(await cache.remember("alice", load)).toEqual({ role: "updated-1" });
  expect(await cache.remember("alice", load)).toEqual({ role: "updated-2" });
  expect(loads, "remember loads fresh on every disabled read").toBe(2);
  expect(JSON.parse(stored.get("users:alice"))).toEqual({ role: "updated-2" });
  expect(
    calls.every(([operation]) => operation === "SET"),
    "remember still refreshes storage for enabled readers",
  ).toBeTruthy();
  await cache.delete("alice");
  expect(stored.has("users:alice"), "deletion remains active for other enabled readers").toBe(false);
  await cache.set("alice", { role: "restored" });
  evalResult = 1;
  const beforeInvalidation = calls.length;
  const token = await cache.beginInvalidation("alice");
  expect(typeof token, "disabled reads still acquire the authorization mutation fence").toBe("string");
  await cache.endInvalidation("alice", token);
  expect(calls.length, "both mutation fence operations reach Redis").toBe(beforeInvalidation + 2);

  process.env.NODE_ENV = "development";
  process.env.CACHE_ENABLED = "true";
  expect(await cache.get("alice")).toEqual({ role: "restored" });
  expect(await cache.remember("alice", load)).toEqual({ role: "restored" });
  expect(loads, "explicitly enabling reads restores cache hits in development").toBe(2);
  evalResult = JSON.stringify({ generation: "existing", pending: {}, value: JSON.stringify({ role: "guarded" }) });
  expect(await cache.rememberGuarded("alice", loadGuarded)).toEqual({ role: "guarded" });
  expect(guardedLoads, "explicitly enabling guarded reads restores cache hits").toBe(4);
});
