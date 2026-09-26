import { describe, expect, test } from "vitest";
import { run as path } from "./run.ts";
import { context, execute, content } from "../../tests/helpers/json-tools.mjs";

test.each(["", " \n\t", "{", '{"a":1,}', '"unterminated', '{"a":undefined}'])(
  "rejects empty or malformed strict input %j",
  async (text) => {
    await expect(execute(path, text, { path: "$" })).rejects.toMatchObject({ message: expect.any(String) });
  },
);

test.each(["remove", "null"])("queries repaired %s data and preserves false", async (repairMode) => {
  expect(
    (await execute(path, '{"broken":,"users":[{"active":false}]}', { repairMode, path: "users[0].active" })).text,
  ).toBe("false");
});
