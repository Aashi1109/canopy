import { expect, test } from "vitest";
import { validateDownloadPolicyInput } from "../lib/downloaders/policy.ts";

const valid = {
  expectedVersion: 1,
  guest: { daily: 10, active: 1, queued: 2 },
  account: { daily: 20, active: 2, queued: 4 },
};
test("policy accepts a complete bounded update without modifying the input", () => {
  expect(validateDownloadPolicyInput(valid)).toEqual(valid);
});
for (const value of [0, -1, 1.2, "10", NaN, Infinity, 1_000_001, null]) {
  test(`daily allowance rejects ${String(value)} rather than granting unlimited usage`, () => {
    expect(() => validateDownloadPolicyInput({ ...valid, guest: { ...valid.guest, daily: value } })).toThrow();
  });
}
test("policy requires both owner groups and an optimistic version", () => {
  for (const value of [
    { guest: valid.guest },
    { ...valid, expectedVersion: 0 },
    { ...valid, account: {} },
    { ...valid, guest: { ...valid.guest, active: 251 } },
  ]) {
    expect(() => validateDownloadPolicyInput(value)).toThrow();
  }
});
