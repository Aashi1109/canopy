import { createRequire } from "node:module";
import { expect, test } from "vitest";
import { run as runFormatter } from "../tools/json-formatter/run.worker.ts";

// Behaviour lock for the shared JSON/CSV helpers themselves. Per-tool execution
// is covered by tests/tool-execution.test.mjs against captured fixtures; these
// helpers are consumed directly by the JSON viewer workspace and by several
// run files, so they are asserted here at their own boundary.
import { convertCsvToJson, convertJsonToCsv } from "../lib/devtools/shared/csv.ts";
import {
  MAX_JSON_INPUT_CHARS,
  getJsonNodeMetadata,
  repairJson,
  summarizeJson,
  transformJson,
} from "../lib/devtools/shared/json.ts";

const requireFromDevtools = createRequire(new URL("../package.json", import.meta.url));

test("formats valid JSON with the selected indentation", () => {
  expect(
    transformJson('{"name":"Ada","active":true}', {
      mode: "format",
      indentation: 2,
    }),
  ).toEqual({
    ok: true,
    output: '{\n  "name": "Ada",\n  "active": true\n}',
    value: { name: "Ada", active: true },
  });
});

test("formatter keeps exact numeric tokens when a parsed tree would change them", async () => {
  const run = (text, operation = "format") =>
    runFormatter({
      input: { text },
      settings: { operation, indentation: "2" },
      signal: new AbortController().signal,
    });
  for (const number of ["9007199254740993", "1.234567890123456789", "-0", "1e400", "1e3", "1.00"]) {
    const result = await run(`{"nested":[${number}]}`);
    expect(result.render, number).toBe("code");
    expect(result.code).toBe(`{\n  "nested": [\n    ${number}\n  ]\n}`);
    expect(result.downloadName).toBe("smarttools-formatted.json");
    expect(result.language).toBe("json");
    expect(result.verdict?.detail).toBeTruthy();
  }
  expect((await run("9007199254740993")).code).toBe("9007199254740993");
  const ordinary = JSON.stringify({
    number: -12.5,
    escaped: '\\"9007199254740993"',
    "1e400": "-0",
  });
  expect((await run(ordinary)).render).toBe("json-tree");
  const minified = await run('{"number": 9007199254740993}', "minify");
  expect(minified.render).toBe("json-tree");
  expect(minified.text).toBe('{"number":9007199254740993}');
  expect((await run("9007199254740993", "validate")).text).toBe("Valid JSON\nRoot type: number");
});

test("supports tab indentation and Unicode values", () => {
  expect(
    transformJson('{"message":"Hello 👋"}', {
      mode: "format",
      indentation: "tab",
    }),
  ).toEqual({
    ok: true,
    output: '{\n\t"message": "Hello 👋"\n}',
    value: { message: "Hello 👋" },
  });
});

test("minifies valid JSON without changing its value", () => {
  expect(
    transformJson('[1, { "ready": true }]', {
      mode: "minify",
      indentation: 4,
    }),
  ).toEqual({
    ok: true,
    output: '[1,{"ready":true}]',
    value: [1, { ready: true }],
  });
});

test("returns a useful location for malformed JSON", () => {
  expect(
    transformJson('{\n  "name": "Ada",\n}', {
      mode: "format",
      indentation: 2,
    }),
  ).toEqual({
    ok: false,
    error: {
      kind: "syntax",
      message: "JSON isn't valid near line 3, column 1. Check commas, quotes, and brackets.",
      line: 3,
      column: 1,
    },
  });
});

test("handles empty and oversized input before parsing", () => {
  expect([
    transformJson("  \n", { mode: "format", indentation: 2 }),
    transformJson("x".repeat(MAX_JSON_INPUT_CHARS + 1), {
      mode: "format",
      indentation: 2,
    }),
  ]).toEqual([
    {
      ok: false,
      error: {
        kind: "empty",
        message: "Paste JSON or open a .json file to get started.",
      },
    },
    {
      ok: false,
      error: {
        kind: "too-large",
        message: "JSON must be 2,000,000 characters or fewer.",
      },
    },
  ]);
});

test("the editor stack understands JSON and its automatic closing pairs", () => {
  const { EditorState, basicSetup } = requireFromDevtools("@uiw/react-codemirror");
  const { json, jsonLanguage } = requireFromDevtools("@codemirror/lang-json");
  const state = EditorState.create({
    doc: '{"ready":true}',
    extensions: [basicSetup({ closeBrackets: true }), json()],
  });

  expect(jsonLanguage.parser.parse(state.doc.toString()).toString()).toMatch(/PropertyName.*True/);
  expect(state.languageDataAt("closeBrackets", 1)).toEqual([{ brackets: ["[", "{", '"'] }]);
});

test("summarizes document-level JSON facts without selected node state", () => {
  const value = {
    id: "12345",
    name: "Project Apollo",
    status: "active",
    details: {
      tasks: [
        { id: 1, title: "Design System", completed: true },
        { id: 2, title: "API Integration", completed: false },
      ],
      metadata: '{"created":"2024-01-01"}',
    },
  };
  const output = JSON.stringify(value, null, 2);

  expect(summarizeJson(value, output)).toEqual({
    arrayCount: 1,
    byteSize: 348,
    depth: 3,
    keyCount: 12,
    lineCount: 20,
  });
});

test("describes object and array nodes with key/value preview rows", () => {
  expect(getJsonNodeMetadata("details", { tasks: [{ id: 1 }], active: true }, 2)).toEqual({
    selectedKey: "details",
    selectedType: "Object {2}",
    preview: [
      { key: "tasks", value: "[…]" },
      { key: "active", value: "true" },
    ],
  });
  expect(getJsonNodeMetadata("tasks", [{ id: 1 }, "done", null], 2)).toEqual({
    selectedKey: "tasks",
    selectedType: "Array [3]",
    preview: [
      { key: "0", value: "{…}" },
      { key: "1", value: '"done"' },
    ],
  });
});

test("describes primitive and null nodes with their exact value", () => {
  expect(getJsonNodeMetadata("title", "Design System")).toEqual({
    selectedKey: "title",
    selectedType: "string",
    preview: [{ key: "value", value: '"Design System"' }],
  });
  expect(getJsonNodeMetadata("completed", true)).toEqual({
    selectedKey: "completed",
    selectedType: "boolean",
    preview: [{ key: "value", value: "true" }],
  });
  expect(getJsonNodeMetadata("missing", null)).toEqual({
    selectedKey: "missing",
    selectedType: "Null",
    preview: [{ key: "value", value: "null" }],
  });
});

test("limits node metadata previews without changing the selected node", () => {
  expect(getJsonNodeMetadata("root", { a: 1, b: 2, c: 3 }, 2)).toEqual({
    selectedKey: "root",
    selectedType: "Object {3}",
    preview: [
      { key: "a", value: "1" },
      { key: "b", value: "2" },
    ],
  });
});

test("converts JSON objects to CSV with a stable union of columns", () => {
  expect(convertJsonToCsv('[{"id":1,"name":"Alice"},{"id":2,"active":true}]')).toEqual({
    ok: true,
    columns: ["id", "name", "active"],
    rows: [
      ["1", "Alice", ""],
      ["2", "", "true"],
    ],
    output: "id,name,active\n1,Alice,\n2,,true",
    repaired: false,
    rowCount: 2,
  });
});

test("flattens nested objects and safely quotes arrays, delimiters, and quotes", () => {
  const result = convertJsonToCsv(
    JSON.stringify([
      {
        id: 1,
        profile: { city: "Pune" },
        tags: ["a", "b"],
        note: 'A, "quoted" value',
      },
    ]),
  );

  expect(result.ok).toBe(true);
  expect(result.output).toBe('id,profile.city,tags,note\n1,Pune,"[""a"",""b""]","A, ""quoted"" value"');
});

test("repairs missing property values by removing them or setting them to null", () => {
  const broken = '[{"id":1,"age":}]';

  expect(convertJsonToCsv(broken, { repairMode: "remove" })).toEqual({
    ok: true,
    columns: ["id"],
    rows: [["1"]],
    output: "id\n1",
    repaired: true,
    rowCount: 1,
  });
  expect(convertJsonToCsv(broken, { repairMode: "null" })).toEqual({
    ok: true,
    columns: ["id", "age"],
    rows: [["1", ""]],
    output: "id,age\n1,",
    repaired: true,
    rowCount: 1,
  });
  expect(convertJsonToCsv(broken, { repairMode: "off" }).ok).toBe(false);
});

test("rejects empty, oversized, and non-object JSON inputs", () => {
  for (const input of [" ", "x".repeat(MAX_JSON_INPUT_CHARS + 1), "[1,2]", '"value"']) {
    expect(convertJsonToCsv(input).ok).toBe(false);
  }
});

test("converts CSV headers and rows to a formatted JSON array", () => {
  expect(convertCsvToJson("id,name\n1,Alice\n2,Bob")).toEqual({
    ok: true,
    columns: ["id", "name"],
    output: '[\n  {\n    "id": "1",\n    "name": "Alice"\n  },\n  {\n    "id": "2",\n    "name": "Bob"\n  }\n]',
    rowCount: 2,
  });
});

test("CSV parsing handles quoted delimiters, escaped quotes, and line breaks", () => {
  const result = convertCsvToJson('id,note\n1,"A, ""quoted"" value"\n2,"line one\nline two"');

  expect(result.ok).toBe(true);
  expect(JSON.parse(result.output)).toEqual([
    { id: "1", note: 'A, "quoted" value' },
    { id: "2", note: "line one\nline two" },
  ]);
  expect(convertCsvToJson('id,name\n1,"Alice').ok).toBe(false);
  expect(convertCsvToJson("id,id\n1,2").ok).toBe(false);
  expect(convertCsvToJson("id,name\n1").ok).toBe(false);
});

test("small CSV parsing applies the same strict closing-quote rule as streaming input", () => {
  expect(convertCsvToJson('id,name\n1,"Alice"x').ok).toBe(false);
});

test("repairs common broken JSON without evaluating input", () => {
  expect(repairJson("{/* note */ name: 'Ada', active: true, age:,}", "remove")).toEqual({
    ok: true,
    output: '{\n  "name": "Ada",\n  "active": true\n}',
    value: { name: "Ada", active: true },
    repaired: true,
  });
  expect(repairJson('{"name":"Ada","age":}', "null")).toEqual({
    ok: true,
    output: '{\n  "name": "Ada",\n  "age": null\n}',
    value: { name: "Ada", age: null },
    repaired: true,
  });
});

test("JSON repair rejects empty, oversized, and unrecoverable input", () => {
  expect(repairJson("", "remove").ok).toBe(false);
  expect(repairJson("x".repeat(MAX_JSON_INPUT_CHARS + 1), "remove").ok).toBe(false);
  expect(repairJson("{still broken", "remove").ok).toBe(false);
});
