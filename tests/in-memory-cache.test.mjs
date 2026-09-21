import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryCache } from "../lib/cache/inMemoryCache.ts";

test.beforeEach((t) => {
  const previous = { NODE_ENV: process.env.NODE_ENV, CACHE_ENABLED: process.env.CACHE_ENABLED };
  process.env.CACHE_ENABLED = "true";
  t.after(() => {
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

  assert.equal(cache.get("missing"), undefined);
  assert.equal(cache.has("missing"), false);
  assert.equal(cache.size, 0);
  assert.equal(cache.set("name", value), cache);
  cache.set(objectKey, "object key");
  cache.set(undefined, "undefined key");

  assert.equal(cache.get("name"), value);
  assert.equal(cache.get(objectKey), "object key");
  assert.equal(cache.has({}), false);
  assert.equal(cache.get(undefined), "undefined key");
  assert.equal(cache.size, 3);
  assert.equal(other.has("name"), false);
  assert.equal(other.size, 0);
});

test("distinguishes cached undefined and other falsy values from missing entries", () => {
  const cache = new InMemoryCache();
  const values = [undefined, null, false, 0, "", NaN];

  values.forEach((value, index) => cache.set(index, value));

  values.forEach((value, index) => {
    assert.equal(cache.has(index), true);
    assert.equal(cache.get(index), value);
  });
  assert.equal(cache.size, values.length);
});

test("entries without a TTL persist until deleted or cleared", (t) => {
  let now = 1_000;
  t.mock.method(Date, "now", () => now);
  const cache = new InMemoryCache();
  cache.set("key", "value");

  now += 1_000_000_000;

  assert.equal(cache.get("key"), "value");
  assert.equal(cache.has("key"), true);
  assert.equal(cache.size, 1);
});

test("get and has expire entries at the TTL boundary without extending it on reads", (t) => {
  let now = 1_000;
  t.mock.method(Date, "now", () => now);
  const cache = new InMemoryCache();
  cache.set("get", "value", 2);
  cache.set("has", undefined, 2);

  now = 2_999;
  assert.equal(cache.get("get"), "value");
  assert.equal(cache.has("has"), true);

  now = 3_000;
  assert.equal(cache.get("get"), undefined);
  assert.equal(cache.has("has"), false);
  assert.equal(cache.size, 0);
});

test("overwriting resets TTL and omitting TTL removes the previous expiration", (t) => {
  let now = 0;
  t.mock.method(Date, "now", () => now);
  const cache = new InMemoryCache();
  cache.set("reset", "old", 1);
  cache.set("persistent", "old", 1);

  now = 500;
  cache.set("reset", "new", 2);
  cache.set("persistent", "new");
  assert.equal(cache.size, 2);

  now = 1_000;
  assert.equal(cache.get("reset"), "new");
  assert.equal(cache.get("persistent"), "new");
  now = 2_500;
  assert.equal(cache.has("reset"), false);
  assert.equal(cache.get("persistent"), "new");
  assert.equal(cache.size, 1);
});

test("size excludes expired entries and new writes retain live entries", (t) => {
  let now = 0;
  t.mock.method(Date, "now", () => now);
  const cache = new InMemoryCache();
  cache.set("expired", "value", 1);
  cache.set("live", "value", 3);
  cache.set("persistent", "value");

  now = 1_000;
  assert.equal(cache.size, 2);
  now = 3_000;
  cache.set("new", "value", 1);
  assert.equal(cache.size, 2);
  assert.equal(cache.get("persistent"), "value");
  assert.equal(cache.get("new"), "value");
  assert.equal(cache.has("live"), false);
});

test("delete reports whether a live entry was removed and clear empties the cache", (t) => {
  let now = 0;
  t.mock.method(Date, "now", () => now);
  const cache = new InMemoryCache();
  cache.set("live", undefined);
  cache.set("expired", "value", 1);

  now = 1_000;
  assert.equal(cache.delete("missing"), false);
  assert.equal(cache.delete("expired"), false);
  assert.equal(cache.delete("live"), true);
  assert.equal(cache.delete("live"), false);
  assert.equal(cache.size, 0);

  cache.set("one", 1).set("two", 2);
  cache.clear();
  cache.clear();
  assert.equal(cache.size, 0);
  assert.equal(cache.has("one"), false);
  assert.equal(cache.has("two"), false);
  cache.set("reused", 3);
  assert.equal(cache.get("reused"), 3);
});

test("rejects invalid TTLs without overwriting a previously cached value", () => {
  const cache = new InMemoryCache();
  cache.set("key", "original");

  for (const ttl of [0, -1, 0.5, Infinity, -Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, null, "1"]) {
    assert.throws(() => cache.set("key", "replacement", ttl), /TTL must be a positive integer/);
    assert.equal(cache.get("key"), "original");
    assert.equal(cache.size, 1);
  }
});

test("remember shares loads, caches undefined, and starts TTL after a successful load", async (t) => {
  let now = 0;
  t.mock.method(Date, "now", () => now);
  const cache = new InMemoryCache();
  const result = Promise.withResolvers();
  let calls = 0;
  const load = () => {
    calls += 1;
    return result.promise;
  };
  const first = cache.remember("key", load, 2);
  const second = cache.remember("key", load, 2);
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);

  now = 5_000;
  result.resolve(undefined);
  assert.equal(await first, undefined);
  assert.equal(cache.has("key"), true);
  now = 6_999;
  assert.equal(await cache.remember("key", load, 2), undefined);
  assert.equal(calls, 1);
  now = 7_000;
  assert.equal(await cache.remember("key", async () => "fresh"), "fresh");
  assert.equal(cache.get("key"), "fresh");
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
    await assert.rejects(cache.remember("key", load), failure);
    assert.equal(cache.has("key"), false);
  }
  assert.equal(await cache.remember("key", async () => "recovered"), "recovered");
});

test("delete, clear, and set prevent old loads from overwriting newer values", async () => {
  for (const action of ["delete", "clear", "set"]) {
    const cache = new InMemoryCache();
    const result = Promise.withResolvers();
    const old = cache.remember("key", () => result.promise);
    if (action === "set") {
      cache.set("key", "fresh");
    } else {
      if (action === "delete") assert.equal(cache.delete("key"), false);
      else cache.clear();
      assert.equal(await cache.remember("key", async () => "fresh"), "fresh");
    }
    result.resolve("stale");
    assert.equal(await old, "stale");
    assert.equal(cache.get("key"), "fresh");
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
      await assert.rejects(old, /old failure/);
    } else {
      previous.resolve("stale");
      await old;
    }
    assert.equal(cache.has("key"), false);
    assert.equal(
      cache.remember("key", async () => "duplicate"),
      current,
    );
    next.resolve("fresh");
    assert.equal(await current, "fresh");
    assert.equal(cache.get("key"), "fresh");
  }
});

test("remember validates TTL before returning hits or sharing pending loads", async () => {
  const cache = new InMemoryCache();
  cache.set("hit", "cached");
  const pending = cache.remember("pending", async () => "loaded");
  let calls = 0;
  for (const key of ["miss", "hit", "pending"]) {
    for (const ttl of [0, -1, 0.5, Infinity, -Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, null, "1"]) {
      assert.throws(() => cache.remember(key, async () => ++calls, ttl), /TTL must be a positive integer/);
    }
  }
  assert.equal(calls, 0);
  assert.equal(cache.get("hit"), "cached");
  assert.equal(await pending, "loaded");
});

test("development bypasses stored values and duplicate loads when caching is not explicitly enabled", async () => {
  process.env.NODE_ENV = "development";
  for (const configured of [undefined, "", "   "]) {
    if (configured === undefined) delete process.env.CACHE_ENABLED;
    else process.env.CACHE_ENABLED = configured;
    const cache = new InMemoryCache();
    assert.equal(cache.set("key", "stored"), cache);
    assert.equal(cache.get("key"), undefined);
    assert.equal(cache.has("key"), false);
    assert.equal(cache.size, 0);
    let calls = 0;
    const load = async () => ++calls;
    const first = cache.remember("key", load);
    const second = cache.remember("key", load);
    assert.notEqual(first, second);
    assert.deepEqual(await Promise.all([first, second]), [1, 2]);
    assert.equal(await cache.remember("key", load), 3);
    assert.equal(cache.size, 0);
    assert.equal(cache.delete("key"), false);
  }
});

test("an explicit override enables caching during development", async () => {
  process.env.NODE_ENV = "development";
  process.env.CACHE_ENABLED = "true";
  const cache = new InMemoryCache();
  let calls = 0;
  const first = cache.remember("key", async () => ++calls);
  const second = cache.remember("key", async () => ++calls);
  assert.equal(first, second);
  assert.equal(await first, 1);
  assert.equal(cache.get("key"), 1);
  assert.equal(await cache.remember("key", async () => ++calls), 1);
  assert.equal(calls, 1);
});

test("an explicit override disables caching in production", async () => {
  process.env.NODE_ENV = "production";
  process.env.CACHE_ENABLED = "false";
  const cache = new InMemoryCache();
  cache.set("key", "stored");
  assert.equal(cache.get("key"), undefined);
  assert.equal(await cache.remember("key", async () => "fresh"), "fresh");
  assert.equal(cache.get("key"), undefined);
  assert.equal(cache.has("key"), false);
  assert.equal(cache.size, 0);
});

test("disabling the cache removes old entries and detaches pending loads before re-enabling", async () => {
  const cache = new InMemoryCache();
  const result = Promise.withResolvers();
  cache.set("stored", "old value");
  const oldLoad = cache.remember("pending", () => result.promise);
  await Promise.resolve();

  process.env.CACHE_ENABLED = "false";
  assert.equal(cache.get("stored"), undefined);
  assert.equal(await cache.remember("pending", async () => "uncached value"), "uncached value");
  assert.equal(cache.size, 0);

  process.env.CACHE_ENABLED = "true";
  result.resolve("old pending value");
  assert.equal(await oldLoad, "old pending value");
  assert.equal(cache.has("stored"), false);
  assert.equal(cache.has("pending"), false);
  assert.equal(await cache.remember("pending", async () => "new value"), "new value");
  assert.equal(cache.get("pending"), "new value");
});

test("disabled caching preserves TTL validation and loader errors", async () => {
  process.env.CACHE_ENABLED = "false";
  const cache = new InMemoryCache();
  let calls = 0;
  for (const ttl of [0, -1, 0.5, Infinity, NaN, null, "1"]) {
    assert.throws(() => cache.set("key", "value", ttl), /TTL must be a positive integer/);
    assert.throws(() => cache.remember("key", async () => ++calls, ttl), /TTL must be a positive integer/);
  }
  assert.equal(calls, 0);
  await assert.rejects(
    cache.remember("key", () => {
      throw new Error("fresh load failed");
    }),
    /fresh load failed/,
  );
  assert.equal(cache.size, 0);
});
