import { describe, expect, test } from "vitest";
import { run as schemaGenerator } from "./run.ts";
import { context, execute, content } from "../../tests/helpers/json-tools.mjs";

test.each(["", " \n\t", "{", '{"a":1,}', '"unterminated', '{"a":undefined}'])(
  "rejects empty or malformed strict input %j",
  async (text) => {
    await expect(execute(schemaGenerator, text, { path: "$" })).rejects.toMatchObject({ message: expect.any(String) });
  },
);

test("infers nested required objects and homogeneous arrays", async () => {
  const result = await execute(schemaGenerator, '{"users":[{"id":1,"active":false}],"ratio":1.5,"nothing":null}');
  expect(JSON.parse(result.code)).toEqual({
    type: "object",
    properties: {
      users: {
        type: "array",
        items: {
          type: "object",
          properties: { id: { type: "integer" }, active: { type: "boolean" } },
          required: ["id", "active"],
          additionalProperties: false,
        },
      },
      ratio: { type: "number" },
      nothing: { type: "null" },
    },
    required: ["users", "ratio", "nothing"],
    additionalProperties: false,
  });
  expect(result.downloadName).toBe("schema.json");
});
test("deduplicates union alternatives", async () => {
  expect(JSON.parse((await execute(schemaGenerator, '[1,2,"a",null]')).code)).toEqual({
    type: "array",
    items: { anyOf: [{ type: "integer" }, { type: "string" }, { type: "null" }] },
  });
});
test.each(["remove", "null"])("infers the %s repaired value", async (repairMode) => {
  const schema = JSON.parse((await execute(schemaGenerator, '{"broken":,"kept":true}', { repairMode })).code);
  expect(schema.properties).toEqual({
    ...(repairMode === "null" ? { broken: { type: "null" } } : {}),
    kept: { type: "boolean" },
  });
});

test("an empty input array does not generate an invalid empty anyOf schema", async () => {
  const schema = JSON.parse((await execute(schemaGenerator, "[]")).code);
  expect(schema.type).toBe("array");
  // JSON Schema requires anyOf to have at least one alternative. Valid fixes
  // may omit items or use a boolean or object schema; no exact spelling is required.
  expect(schema.items?.anyOf).not.toEqual([]);
});
