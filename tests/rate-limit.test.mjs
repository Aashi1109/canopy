import assert from "node:assert/strict";
import test from "node:test";

import { checkRateLimit, getRateLimitStoreSize, RATE_LIMIT_MAX_ENTRIES } from "../lib/rateLimit.ts";

test("allows requests under the limit and decrements remaining", () => {
  const first = checkRateLimit("under-limit", { limit: 3, now: 1_000 });
  const second = checkRateLimit("under-limit", { limit: 3, now: 1_000 });

  assert.deepEqual(first, { allowed: true, remaining: 2, resetAt: 61_000 });
  assert.deepEqual(second, { allowed: true, remaining: 1, resetAt: 61_000 });
});

test("denies the request after the limit with a sane retry delay", () => {
  const options = { limit: 2, now: 100_000, windowMs: 10_000 };
  checkRateLimit("at-limit", options);
  checkRateLimit("at-limit", options);

  assert.deepEqual(checkRateLimit("at-limit", options), {
    allowed: false,
    retryAfterSeconds: 10,
    resetAt: 110_000,
  });
});

test("allows requests again after the injected clock crosses the window", () => {
  const key = "window-rollover";
  assert.equal(checkRateLimit(key, { limit: 1, now: 200_000, windowMs: 1_000 }).allowed, true);
  assert.equal(checkRateLimit(key, { limit: 1, now: 200_999, windowMs: 1_000 }).allowed, false);
  assert.deepEqual(checkRateLimit(key, { limit: 1, now: 201_000, windowMs: 1_000 }), {
    allowed: true,
    remaining: 0,
    resetAt: 202_000,
  });
});

test("keeps separate keys on independent budgets", () => {
  const options = { limit: 1, now: 300_000 };

  assert.equal(checkRateLimit("tool-a:client", options).allowed, true);
  assert.equal(checkRateLimit("tool-b:client", options).allowed, true);
  assert.equal(checkRateLimit("tool-a:client", options).allowed, false);
});

test("bounds the store when many distinct keys are inserted", () => {
  const now = 400_000;
  for (let index = 0; index < RATE_LIMIT_MAX_ENTRIES * 5; index += 1) {
    checkRateLimit(`rotating-client-${index}`, { now });
  }

  assert.equal(getRateLimitStoreSize(), RATE_LIMIT_MAX_ENTRIES);
});

test("evicts expired entries on a later write", () => {
  const now = 500_000;
  for (let index = 0; index < 25; index += 1) {
    checkRateLimit(`expiring-${index}`, { now, windowMs: 1_000 });
  }
  assert.ok(getRateLimitStoreSize() > 1);

  checkRateLimit("after-expiry", { now: now + 1_000, windowMs: 1_000 });

  assert.equal(getRateLimitStoreSize(), 1);
});

test("never throws when limiter options cannot be read", () => {
  const hostileOptions = new Proxy(
    {},
    {
      get() {
        throw new Error("unreadable options");
      },
    },
  );

  assert.doesNotThrow(() => checkRateLimit("hostile-options", hostileOptions));
  assert.equal(checkRateLimit("hostile-options", hostileOptions).allowed, false);
});
