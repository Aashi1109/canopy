import { describe, expect, test } from "vitest";
import { run as formatter } from "./run.worker.ts";
import { context, execute, content } from "../../tests/helpers/json-tools.mjs";

test.each(["", " \n\t", "{", '{"a":1,}', '"unterminated', '{"a":undefined}'])(
  "rejects empty or malformed strict input %j",
  async (text) => {
    await expect(execute(formatter, text, { path: "$" })).rejects.toMatchObject({ message: expect.any(String) });
  },
);

test.each([
  ["2", "  "],
  ["4", "    "],
  ["tab", "\t"],
])("formats using %s indentation", async (indentation, indent) => {
  const result = await execute(formatter, '{"b":false,"a":[0,null]}', { indentation });
  expect(result.text).toBe(
    `{\n${indent}"b": false,\n${indent}"a": [\n${indent}${indent}0,\n${indent}${indent}null\n${indent}]\n}`,
  );
  expect(result.downloadName).toBe("smarttools-formatted.json");
  expect(result.value).toEqual({ b: false, a: [0, null] });
});
test("minifying preserves exact unsafe number tokens and escaped text", async () => {
  const result = await execute(formatter, '{ "id": 9007199254740993, "text": "a  b\\n" }', { operation: "minify" });
  expect(result.text).toBe('{"id":9007199254740993,"text":"a  b\\n"}');
  expect(result.downloadName).toBe("smarttools-minified.json");
});
test.each([
  ["{}", "object"],
  ["[]", "array"],
  ["null", "null"],
  ["false", "boolean"],
  ['"a"', "string"],
  ["1.5", "number"],
])("validation identifies %s as %s", async (text, type) => {
  expect((await execute(formatter, text, { operation: "validate" })).text).toBe(`Valid JSON\nRoot type: ${type}`);
});
