import assert from "node:assert/strict";
import { test } from "node:test";
import { errorMessage } from "../utils/errorMessage.ts";

test("response errors preserve original messages without stack traces", () => {
  for (const error of [
    new Error("Storage is unavailable"),
    { message: " Storage is unavailable " },
    "Storage is unavailable",
  ]) {
    assert.equal(errorMessage(error, "Try again"), "Storage is unavailable");
  }
  assert.equal(
    errorMessage(new Error("Connection refused\n    at upload (/private/app.ts:4:2)"), "Try again"),
    "Connection refused",
  );
});

test("missing messages use the supplied fallback", () => {
  for (const error of [undefined, null, 42, {}, { message: 42 }, new Error("  "), ""]) {
    assert.equal(errorMessage(error, "Try again"), "Try again");
  }
});

test("sensitive values are hidden while the rest of the message is preserved", () => {
  for (const [original, expected] of [
    [
      "Failed query: insert into customers values ($1)\nparams: private-data",
      "Failed query: [hidden]\nparams: [hidden]",
    ],
    ["Connection failed: postgres://user:password@database", "Connection failed: [hidden]"],
    ["Connection failed: postgres://private-password", "Connection failed: [hidden]"],
    ["Upload rejected https://user:password@example.test/path", "Upload rejected [hidden]"],
    ["Invalid password=private-value; retry", "Invalid password=[hidden]; retry"],
    ['Invalid "api_key": "private value"', 'Invalid "api_key": [hidden]'],
    ["Invalid Authorization: Bearer private-value", "Invalid Authorization: [hidden]"],
    ["Invalid Bearer private-value", "Invalid Bearer [hidden]"],
  ]) {
    assert.equal(errorMessage(new Error(original), "Try again"), expected);
  }
  for (const name of ["api_secret", "access_token", "refreshToken", "clientSecret"]) {
    assert.equal(
      errorMessage(new Error(`Rejected ${name}=private-value; retry`), "Try again"),
      `Rejected ${name}=[hidden]; retry`,
    );
  }
});
