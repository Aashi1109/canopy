import { describe, expect, test } from "vitest";
import { run as keys } from "./run.ts";
import { context, execute, content } from "../../tests/helpers/json-tools.mjs";

test.each(["", " \n\t", "{", '{"a":1,}', '"unterminated', '{"a":undefined}'])(
  "rejects empty or malformed strict input %j",
  async (text) => {
    await expect(execute(keys, text, { path: "$" })).rejects.toMatchObject({ message: expect.any(String) });
  },
);

test("deduplicates array paths and traverses nested arrays", async () => {
  const result = await execute(
    keys,
    '{"users":[{"name":"Ada"},{"name":"Lin","active":false}],"matrix":[[{"id":0}]],"nil":null}',
  );
  expect(result.text).toBe("users\nusers[].name\nusers[].active\nmatrix\nmatrix[][].id\nnil");
  expect(result.downloadName).toBe("json-keys.txt");
});
test.each(["false", "null", "[]", "{}"])("%s has no keys", async (source) =>
  expect((await execute(keys, source)).text).toBe(""),
);
test.each([
  ["remove", "kept"],
  ["null", "broken\nkept"],
])("repairs %s before extracting", async (repairMode, expected) => {
  expect((await execute(keys, '{"broken":,"kept":false}', { repairMode })).text).toBe(expected);
});
