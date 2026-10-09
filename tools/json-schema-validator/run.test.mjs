import { describe, expect, test } from "vitest";
import { run as schemaValidator } from "./run.ts";
import { context, execute, content } from "../../tests/helpers/json-tools.mjs";

const validate = (value, schema) => execute(schemaValidator, JSON.stringify(value), {}, JSON.stringify(schema));
test("validates nested object/array properties, integers and enum", async () => {
  const result = await validate(
    { ids: [1, 2], state: "ready" },
    {
      type: "object",
      required: ["ids"],
      properties: { ids: { type: "array", items: { type: "integer" } }, state: { enum: ["ready", "done"] } },
    },
  );
  expect(result.text).toBe("Valid against schema.");
  expect(result.verdict.level).toBe("ok");
});
test("reports each nested failure with its data path", async () => {
  const result = await validate(
    { ids: [1, 2.5], state: "unknown" },
    {
      type: "object",
      required: ["missing"],
      properties: { ids: { type: "array", items: { type: "integer" } }, state: { enum: ["ready"] } },
    },
  );
  expect(result.text).toBe(
    "Invalid\n- $.missing: is required\n- $.ids[1]: expected integer, received number\n- $.state: value is not in enum",
  );
  expect(result.verdict).toMatchObject({ level: "error", label: "Invalid", detail: "3 problems" });
});
test.each([
  ["ab", { minLength: 3 }, "at least 3"],
  ["abcd", { maxLength: 3 }, "at most 3"],
  ["ABC", { pattern: "^[a-z]+$" }, "does not match pattern"],
  ["x", { pattern: "[" }, "schema pattern is invalid"],
])("checks string boundary %j against %j", async (value, schema, message) =>
  expect((await validate(value, schema)).text).toContain(message),
);
test.each([
  ["", "{}"],
  ["{}", ""],
  ["{", "{}"],
  ["{}", "{"],
])("rejects malformed or missing data/schema", async (source, schema) => {
  await expect(execute(schemaValidator, source, {}, schema)).rejects.toMatchObject({ message: expect.any(String) });
});
test("reports non-object schema", async () =>
  expect((await validate({}, null)).text).toBe("Invalid\n- $: schema must be an object"));

test.each([
  [
    { name: "Ada", flags: [true, null] },
    { flags: [true, null], name: "Ada" },
  ],
  [
    [1, { active: false }],
    [1, { active: false }],
  ],
])("enum compares structured JSON values by value, not object identity: %j", async (value, allowed) => {
  expect((await validate(value, { enum: [allowed] })).verdict.level).toBe("ok");
});

test.each([
  [{ id: 1 }, { id: "1" }],
  [
    [1, 2],
    [2, 1],
  ],
])("enum rejects a structurally different value: %j", async (value, allowed) => {
  expect((await validate(value, { enum: [allowed] })).text).toContain("value is not in enum");
});

test.each([
  ["😀", { maxLength: 1 }, "ok"],
  ["😀", { minLength: 2 }, "error"],
  ["e\u0301", { maxLength: 1 }, "error"],
  ["e\u0301", { minLength: 2 }, "ok"],
])("string length counts Unicode code points for %j against %j", async (value, schema, level) => {
  expect((await validate(value, schema)).verdict.level).toBe(level);
});

test("required fields must be present in JSON rather than inherited from Object.prototype", async () => {
  expect((await validate({}, { type: "object", required: ["constructor"] })).text).toBe(
    "Invalid\n- $.constructor: is required",
  );
});

test("optional properties are only validated when they are present in the JSON document", async () => {
  const schema = { properties: { constructor: { type: "string" } } };
  expect((await validate({}, schema)).verdict.level).toBe("ok");
  expect((await validate({ constructor: "literal data" }, schema)).verdict.level).toBe("ok");
});

test.each([
  [null, "ok"],
  ["Ada", "ok"],
  [42, "error"],
])("type alternatives validate nullable fields: %j", async (value, level) => {
  expect((await validate(value, { type: ["string", "null"] })).verdict.level).toBe(level);
});
