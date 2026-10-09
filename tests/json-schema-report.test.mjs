import assert from "node:assert/strict";
const { test } = await import(process.env.VITEST ? "vitest" : "node:test");

import { run } from "../tools/json-schema-validator/run.ts";

const validate = (value, schema) =>
  run({
    input: { text: JSON.stringify(value), secondary: JSON.stringify(schema), files: [] },
    settings: {},
    signal: new AbortController().signal,
  });

const checksByKeyword = (report) =>
  Object.fromEntries(report.checks.map(({ keyword, ...counts }) => [keyword, counts]));

test("successful reports summarize only assertions actually evaluated and preserve the raw result", () => {
  const result = validate(
    { name: "Ada", roles: ["admin", "reader"], extra: { unseen: true } },
    {
      title: "Team member",
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      required: ["name", "roles"],
      properties: {
        name: { type: "string", minLength: 2, maxLength: 10, pattern: "^[A-Z]" },
        roles: { type: "array", items: { type: "string", enum: ["admin", "reader"] } },
        absent: { type: "boolean" },
      },
    },
  );

  assert.equal(result.render, "text");
  assert.equal(result.text, "Valid against schema.");
  assert.equal(result.issues, undefined);
  assert.equal(result.verdict.level, "ok");
  assert.equal(result.report.rootType, "object");
  assert.equal(result.report.schemaTitle, "Team member");
  assert.equal(result.report.schemaDialect, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(result.report.valuesChecked, 5);
  assert.deepEqual(checksByKeyword(result.report), {
    type: { passed: 5, failed: 0 },
    required: { passed: 2, failed: 0 },
    minLength: { passed: 1, failed: 0 },
    maxLength: { passed: 1, failed: 0 },
    pattern: { passed: 1, failed: 0 },
    enum: { passed: 2, failed: 0 },
  });
  assert.deepEqual(result.report.ignoredKeywords, []);
});

test("nested failures retain exact issue text and do not count assertions skipped after a type failure", () => {
  const result = validate(
    { ids: [1, 2.5], state: "unknown" },
    {
      type: "object",
      required: ["missing", "ids", 1],
      properties: {
        ids: { type: "array", items: { type: "integer", enum: [1] } },
        state: { enum: ["ready"] },
      },
    },
  );

  assert.equal(
    result.text,
    "Invalid\n- $.missing: is required\n- $.ids[1]: expected integer, received number\n- $.state: value is not in enum",
  );
  assert.equal(result.issues.length, 3);
  assert.equal(result.verdict.detail, "3 problems");
  assert.equal(result.report.valuesChecked, 5);
  assert.deepEqual(checksByKeyword(result.report), {
    type: { passed: 3, failed: 1 },
    required: { passed: 1, failed: 1 },
    enum: { passed: 1, failed: 1 },
  });
});

test("unsupported keywords are deduplicated in schema positions without inspecting example or enum data", () => {
  const result = validate(
    {},
    {
      $schema: "draft identifier",
      $id: "schema identifier",
      title: "Example",
      description: "Description",
      default: { defaultOnly: true },
      examples: [{ exampleOnly: true }],
      $comment: "Comment",
      readOnly: true,
      writeOnly: false,
      deprecated: false,
      enum: [{ enumOnly: true }, {}],
      additionalProperties: false,
      allOf: [{ compositionOnly: true }],
      properties: {
        missing: { format: "email", minimum: 0 },
        list: { items: { $ref: "#/$defs/item", minimum: 1 } },
      },
    },
  );

  assert.equal(result.verdict.level, "ok");
  assert.deepEqual(result.report.ignoredKeywords, ["$ref", "additionalProperties", "allOf", "format", "minimum"]);
});

test("empty or nonapplicable constraints produce no invented checks", () => {
  const empty = validate({ nested: [1, 2] }, {});
  assert.equal(empty.report.valuesChecked, 1);
  assert.deepEqual(empty.report.checks, []);

  const nonapplicable = validate(42, {
    title: 12,
    $schema: null,
    required: ["name"],
    minLength: 3,
    maxLength: 5,
    pattern: "[",
    properties: { name: { type: "string" } },
    items: { type: "string" },
  });
  assert.equal(nonapplicable.report.rootType, "number");
  assert.equal(nonapplicable.report.schemaTitle, undefined);
  assert.equal(nonapplicable.report.schemaDialect, undefined);
  assert.deepEqual(nonapplicable.report.checks, []);
});

test("malformed schemas and invalid patterns count as failures without changing validation semantics", () => {
  for (const schema of [null, true, false, [], "schema"]) {
    const result = validate({}, schema);
    assert.equal(result.text, "Invalid\n- $: schema must be an object");
    assert.equal(result.report.valuesChecked, 1);
    assert.deepEqual(checksByKeyword(result.report), { schema: { passed: 0, failed: 1 } });
  }

  const pattern = validate("x", { type: "string", pattern: "[" });
  assert.equal(pattern.text, "Invalid\n- $: schema pattern is invalid");
  assert.deepEqual(checksByKeyword(pattern.report), {
    type: { passed: 1, failed: 0 },
    pattern: { passed: 0, failed: 1 },
  });
});

test("report checks preserve deep enum equality and Unicode code point length semantics", () => {
  const equal = validate({ flags: [true, null], name: "Ada" }, { enum: [{ name: "Ada", flags: [true, null] }] });
  assert.deepEqual(checksByKeyword(equal.report), { enum: { passed: 1, failed: 0 } });

  const unequal = validate([1, 2], { enum: [[2, 1]] });
  assert.deepEqual(checksByKeyword(unequal.report), { enum: { passed: 0, failed: 1 } });

  const unicode = validate("😀", { minLength: 2, maxLength: 1, pattern: "😀" });
  assert.equal(unicode.text, "Invalid\n- $: must contain at least 2 characters");
  assert.deepEqual(checksByKeyword(unicode.report), {
    minLength: { passed: 0, failed: 1 },
    maxLength: { passed: 1, failed: 0 },
    pattern: { passed: 1, failed: 0 },
  });
});

test("invalid JSON remains a parse failure rather than a completed validation report", () => {
  for (const [text, secondary] of [
    ["{", "{}"],
    ["{}", "{"],
    ["", "{}"],
    ["{}", ""],
  ]) {
    assert.throws(() =>
      run({ input: { text, secondary, files: [] }, settings: {}, signal: new AbortController().signal }),
    );
  }
});
