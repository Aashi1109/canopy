import { test, expect, vi, beforeEach, afterEach, onTestFinished } from "vitest";
import { InMemoryCache } from "../lib/cache/inMemoryCache.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach((t) => {
  const previous = { NODE_ENV: process.env.NODE_ENV, CACHE_ENABLED: process.env.CACHE_ENABLED };
  process.env.CACHE_ENABLED = "true";
  onTestFinished(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
});

test("stores values by key and isolates cache instances", () => {
  const cache = new InMemoryCache();
  const other = new InMemoryCache();
  const objectKey = {};
  const value = { name: "Canopy" };

  expect(cache.get("missing")).toBe(undefined);
  expect(cache.has("missing")).toBe(false);
  expect(cache.size).toBe(0);
  expect(cache.set("name", value)).toBe(cache);
  cache.set(objectKey, "object key");
  cache.set(undefined, "undefined key");

  expect(cache.get("name")).toBe(value);
  expect(cache.get(objectKey)).toBe("object key");
  expect(cache.has({})).toBe(false);
  expect(cache.get(undefined)).toBe("undefined key");
  expect(cache.size).toBe(3);
  expect(other.has("name")).toBe(false);
  expect(other.size).toBe(0);
});

test("distinguishes cached undefined and other falsy values from missing entries", () => {
  const cache = new InMemoryCache();
  const values = [undefined, null, false, 0, "", NaN];

  values.forEach((value, index) => cache.set(index, value));

  values.forEach((value, index) => {
    expect(cache.has(index)).toBe(true);
    expect(cache.get(index)).toBe(value);
  });
  expect(cache.size).toBe(values.length);
});

test("entries without a TTL persist until deleted or cleared", (t) => {
  let now = 1_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const cache = new InMemoryCache();
  cache.set("key", "value");

  now += 1_000_000_000;

  expect(cache.get("key")).toBe("value");
  expect(cache.has("key")).toBe(true);
  expect(cache.size).toBe(1);
});

test("get and has expire entries at the TTL boundary without extending it on reads", (t) => {
  let now = 1_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const cache = new InMemoryCache();
  cache.set("get", "value", 2);
  cache.set("has", undefined, 2);

  now = 2_999;
  expect(cache.get("get")).toBe("value");
  expect(cache.has("has")).toBe(true);

  now = 3_000;
  expect(cache.get("get")).toBe(undefined);
  expect(cache.has("has")).toBe(false);
  expect(cache.size).toBe(0);
});

test("overwriting resets TTL and omitting TTL removes the previous expiration", (t) => {
  let now = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const cache = new InMemoryCache();
  cache.set("reset", "old", 1);
  cache.set("persistent", "old", 1);

  now = 500;
  cache.set("reset", "new", 2);
  cache.set("persistent", "new");
  expect(cache.size).toBe(2);

  now = 1_000;
  expect(cache.get("reset")).toBe("new");
  expect(cache.get("persistent")).toBe("new");
  now = 2_500;
  expect(cache.has("reset")).toBe(false);
  expect(cache.get("persistent")).toBe("new");
  expect(cache.size).toBe(1);
});

test("size excludes expired entries and new writes retain live entries", (t) => {
  let now = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const cache = new InMemoryCache();
  cache.set("expired", "value", 1);
  cache.set("live", "value", 3);
  cache.set("persistent", "value");

  now = 1_000;
  expect(cache.size).toBe(2);
  now = 3_000;
  cache.set("new", "value", 1);
  expect(cache.size).toBe(2);
  expect(cache.get("persistent")).toBe("value");
  expect(cache.get("new")).toBe("value");
  expect(cache.has("live")).toBe(false);
});

test("delete reports whether a live entry was removed and clear empties the cache", (t) => {
  let now = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const cache = new InMemoryCache();
  cache.set("live", undefined);
  cache.set("expired", "value", 1);

  now = 1_000;
  expect(cache.delete("missing")).toBe(false);
  expect(cache.delete("expired")).toBe(false);
  expect(cache.delete("live")).toBe(true);
  expect(cache.delete("live")).toBe(false);
  expect(cache.size).toBe(0);

  cache.set("one", 1).set("two", 2);
  cache.clear();
  cache.clear();
  expect(cache.size).toBe(0);
  expect(cache.has("one")).toBe(false);
  expect(cache.has("two")).toBe(false);
  cache.set("reused", 3);
  expect(cache.get("reused")).toBe(3);
});

test("rejects invalid TTLs without overwriting a previously cached value", () => {
  const cache = new InMemoryCache();
  cache.set("key", "original");

  for (const ttl of [0, -1, 0.5, Infinity, -Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, null, "1"]) {
    expect(() => cache.set("key", "replacement", ttl)).toThrow(/TTL must be a positive integer/);
    expect(cache.get("key")).toBe("original");
    expect(cache.size).toBe(1);
  }
});

test("remember shares loads, caches undefined, and starts TTL after a successful load", async (t) => {
  let now = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const cache = new InMemoryCache();
  const result = Promise.withResolvers();
  let calls = 0;
  const load = () => {
    calls += 1;
    return result.promise;
  };
  const first = cache.remember("key", load, 2);
  const second = cache.remember("key", load, 2);
  expect(first).toBe(second);
  await Promise.resolve();
  expect(calls).toBe(1);

  now = 5_000;
  result.resolve(undefined);
  expect(await first).toBe(undefined);
  expect(cache.has("key")).toBe(true);
  now = 6_999;
  expect(await cache.remember("key", load, 2)).toBe(undefined);
  expect(calls).toBe(1);
  now = 7_000;
  expect(await cache.remember("key", async () => "fresh")).toBe("fresh");
  expect(cache.get("key")).toBe("fresh");
});

test("remember retries rejected and synchronously throwing loaders", async () => {
  const cache = new InMemoryCache();
  const failure = new Error("unavailable");
  for (const load of [
    () => Promise.reject(failure),
    () => {
      throw failure;
    },
  ]) {
    await expect(cache.remember("key", load)).rejects.toThrow(failure);
    expect(cache.has("key")).toBe(false);
  }
  expect(await cache.remember("key", async () => "recovered")).toBe("recovered");
});

test("delete, clear, and set prevent old loads from overwriting newer values", async () => {
  for (const action of ["delete", "clear", "set"]) {
    const cache = new InMemoryCache();
    const result = Promise.withResolvers();
    const old = cache.remember("key", () => result.promise);
    if (action === "set") {
      cache.set("key", "fresh");
    } else {
      if (action === "delete") expect(cache.delete("key")).toBe(false);
      else cache.clear();
      expect(await cache.remember("key", async () => "fresh")).toBe("fresh");
    }
    result.resolve("stale");
    expect(await old).toBe("stale");
    expect(cache.get("key")).toBe("fresh");
  }
});

test("an invalidated load cannot remove a newer pending load when it settles", async () => {
  for (const rejectOld of [false, true]) {
    const cache = new InMemoryCache();
    const previous = Promise.withResolvers();
    const next = Promise.withResolvers();
    const old = cache.remember("key", () => previous.promise);
    cache.clear();
    const current = cache.remember("key", () => next.promise);
    if (rejectOld) {
      previous.reject(new Error("old failure"));
      await expect(old).rejects.toThrow(/old failure/);
    } else {
      previous.resolve("stale");
      await old;
    }
    expect(cache.has("key")).toBe(false);
    expect(cache.remember("key", async () => "duplicate")).toBe(current);
    next.resolve("fresh");
    expect(await current).toBe("fresh");
    expect(cache.get("key")).toBe("fresh");
  }
});

test("remember validates TTL before returning hits or sharing pending loads", async () => {
  const cache = new InMemoryCache();
  cache.set("hit", "cached");
  const pending = cache.remember("pending", async () => "loaded");
  let calls = 0;
  for (const key of ["miss", "hit", "pending"]) {
    for (const ttl of [0, -1, 0.5, Infinity, -Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, null, "1"]) {
      expect(() => cache.remember(key, async () => ++calls, ttl)).toThrow(/TTL must be a positive integer/);
    }
  }
  expect(calls).toBe(0);
  expect(cache.get("hit")).toBe("cached");
  expect(await pending).toBe("loaded");
});

test("development bypasses stored values and duplicate loads when caching is not explicitly enabled", async () => {
  process.env.NODE_ENV = "development";
  for (const configured of [undefined, "", "   "]) {
    if (configured === undefined) delete process.env.CACHE_ENABLED;
    else process.env.CACHE_ENABLED = configured;
    const cache = new InMemoryCache();
    expect(cache.set("key", "stored")).toBe(cache);
    expect(cache.get("key")).toBe(undefined);
    expect(cache.has("key")).toBe(false);
    expect(cache.size).toBe(0);
    let calls = 0;
    const load = async () => ++calls;
    const first = cache.remember("key", load);
    const second = cache.remember("key", load);
    expect(first).not.toBe(second);
    expect(await Promise.all([first, second])).toEqual([1, 2]);
    expect(await cache.remember("key", load)).toBe(3);
    expect(cache.size).toBe(0);
    expect(cache.delete("key")).toBe(false);
  }
});

test("an explicit override enables caching during development", async () => {
  process.env.NODE_ENV = "development";
  process.env.CACHE_ENABLED = "true";
  const cache = new InMemoryCache();
  let calls = 0;
  const first = cache.remember("key", async () => ++calls);
  const second = cache.remember("key", async () => ++calls);
  expect(first).toBe(second);
  expect(await first).toBe(1);
  expect(cache.get("key")).toBe(1);
  expect(await cache.remember("key", async () => ++calls)).toBe(1);
  expect(calls).toBe(1);
});

test("an explicit override disables caching in production", async () => {
  process.env.NODE_ENV = "production";
  process.env.CACHE_ENABLED = "false";
  const cache = new InMemoryCache();
  cache.set("key", "stored");
  expect(cache.get("key")).toBe(undefined);
  expect(await cache.remember("key", async () => "fresh")).toBe("fresh");
  expect(cache.get("key")).toBe(undefined);
  expect(cache.has("key")).toBe(false);
  expect(cache.size).toBe(0);
});

test("disabling the cache removes old entries and detaches pending loads before re-enabling", async () => {
  const cache = new InMemoryCache();
  const result = Promise.withResolvers();
  cache.set("stored", "old value");
  const oldLoad = cache.remember("pending", () => result.promise);
  await Promise.resolve();

  process.env.CACHE_ENABLED = "false";
  expect(cache.get("stored")).toBe(undefined);
  expect(await cache.remember("pending", async () => "uncached value")).toBe("uncached value");
  expect(cache.size).toBe(0);

  process.env.CACHE_ENABLED = "true";
  result.resolve("old pending value");
  expect(await oldLoad).toBe("old pending value");
  expect(cache.has("stored")).toBe(false);
  expect(cache.has("pending")).toBe(false);
  expect(await cache.remember("pending", async () => "new value")).toBe("new value");
  expect(cache.get("pending")).toBe("new value");
});

test("disabled caching preserves TTL validation and loader errors", async () => {
  process.env.CACHE_ENABLED = "false";
  const cache = new InMemoryCache();
  let calls = 0;
  for (const ttl of [0, -1, 0.5, Infinity, NaN, null, "1"]) {
    expect(() => cache.set("key", "value", ttl)).toThrow(/TTL must be a positive integer/);
    expect(() => cache.remember("key", async () => ++calls, ttl)).toThrow(/TTL must be a positive integer/);
  }
  expect(calls).toBe(0);
  await expect(
    cache.remember("key", () => {
      throw new Error("fresh load failed");
    }),
  ).rejects.toThrow(/fresh load failed/);
  expect(cache.size).toBe(0);
});
