import { describe, expect, test } from "vitest";
import { run as validator } from "./run.worker.ts";
import { context, execute, content } from "../../tests/helpers/json-tools.mjs";

test.each(["", " \n\t", "{", '{"a":1,}', '"unterminated', '{"a":undefined}'])(
  "rejects empty or malformed strict input %j",
  async (text) => {
    await expect(execute(validator, text, { path: "$" })).rejects.toMatchObject({ message: expect.any(String) });
  },
);

test.each([
  ["{}", "object"],
  ["[]", "array"],
  ["null", "null"],
  ["false", "boolean"],
  ['"a"', "string"],
  ["1.5", "number"],
])("validation identifies %s as %s", async (text, type) => {
  expect((await execute(validator, text)).text).toBe(`Valid JSON\nRoot type: ${type}`);
});
