import { expect, test } from "vitest";
import { checkRateLimit, getRateLimitStoreSize, RATE_LIMIT_MAX_ENTRIES } from "../lib/rateLimit.ts";

test("allows requests under the limit and decrements remaining", () => {
  const first = checkRateLimit("under-limit", { limit: 3, now: 1_000 });
  const second = checkRateLimit("under-limit", { limit: 3, now: 1_000 });

  expect(first).toEqual({ allowed: true, remaining: 2, resetAt: 61_000 });
  expect(second).toEqual({ allowed: true, remaining: 1, resetAt: 61_000 });
});

test("denies the request after the limit with a sane retry delay", () => {
  const options = { limit: 2, now: 100_000, windowMs: 10_000 };
  checkRateLimit("at-limit", options);
  checkRateLimit("at-limit", options);

  expect(checkRateLimit("at-limit", options)).toEqual({
    allowed: false,
    retryAfterSeconds: 10,
    resetAt: 110_000,
  });
});

test("allows requests again after the injected clock crosses the window", () => {
  const key = "window-rollover";
  expect(checkRateLimit(key, { limit: 1, now: 200_000, windowMs: 1_000 }).allowed).toBe(true);
  expect(checkRateLimit(key, { limit: 1, now: 200_999, windowMs: 1_000 }).allowed).toBe(false);
  expect(checkRateLimit(key, { limit: 1, now: 201_000, windowMs: 1_000 })).toEqual({
    allowed: true,
    remaining: 0,
    resetAt: 202_000,
  });
});

test("keeps separate keys on independent budgets", () => {
  const options = { limit: 1, now: 300_000 };

  expect(checkRateLimit("tool-a:client", options).allowed).toBe(true);
  expect(checkRateLimit("tool-b:client", options).allowed).toBe(true);
  expect(checkRateLimit("tool-a:client", options).allowed).toBe(false);
});

test("bounds the store when many distinct keys are inserted", () => {
  const now = 400_000;
  for (let index = 0; index < RATE_LIMIT_MAX_ENTRIES * 5; index += 1) {
    checkRateLimit(`rotating-client-${index}`, { now });
  }

  expect(getRateLimitStoreSize()).toBe(RATE_LIMIT_MAX_ENTRIES);
});

test("evicts expired entries on a later write", () => {
  const now = 500_000;
  for (let index = 0; index < 25; index += 1) {
    checkRateLimit(`expiring-${index}`, { now, windowMs: 1_000 });
  }
  expect(getRateLimitStoreSize() > 1).toBeTruthy();

  checkRateLimit("after-expiry", { now: now + 1_000, windowMs: 1_000 });

  expect(getRateLimitStoreSize()).toBe(1);
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

  expect(() => checkRateLimit("hostile-options", hostileOptions)).not.toThrow();
  expect(checkRateLimit("hostile-options", hostileOptions).allowed).toBe(false);
});
