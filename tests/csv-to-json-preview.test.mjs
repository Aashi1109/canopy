import assert from "node:assert/strict";
import test from "node:test";

import { LARGE_TEXT_PREVIEW_BYTES } from "../lib/tool-framework/limits.ts";
import { run } from "../tools/csv-to-json/run.worker.ts";

function context(text, settings = {}, streaming = false) {
  const file = new File([text], "input.csv", { type: "text/csv" });
  return {
    input: {
      text: streaming ? "" : text,
      files: streaming ? [{ id: "input", name: file.name, mime: file.type, size: 2_000_001, source: file }] : [],
    },
    settings: { delimiter: ",", ...settings },
    signal: new AbortController().signal,
    progress() {},
    async writeArtifact({ mime, name, source }) {
      const blob = await new Response(source).blob();
      return { id: "output", jobId: "json-preview", name, mime, size: blob.size, createdAt: 0, storage: "blob", blob };
    },
  };
}

function assertPreview(result, expected) {
  assert.equal(result.jsonPreview?.render, "json-tree");
  assert.deepEqual(result.jsonPreview.value, expected);
  assert.deepEqual(JSON.parse(result.jsonPreview.text), expected);
}

async function completeOutput(result) {
  return result.render === "text" ? result.text : result.sections[0].body.files[0].blob.text();
}

for (const streaming of [false, true]) {
  const mode = streaming ? "streaming" : "inline";

  test(`${mode}: CSV conversion previews normalized rows without changing exports`, async () => {
    const result = await run(
      context(
        'name,count\n" Ada ",0\nLin,2',
        {
          trimWhitespace: true,
          parseNumbers: true,
          firstRowAsHeaders: true,
        },
        streaming,
      ),
    );
    const value = [
      { name: "Ada", count: 0 },
      { name: "Lin", count: 2 },
    ];
    assertPreview(result, value);
    assert.equal(
      await completeOutput(result),
      streaming ? '[\n  {"name":"Ada","count":0},\n  {"name":"Lin","count":2}\n]' : JSON.stringify(value, null, 2),
    );
    assert.equal(streaming ? result.sections[0].body.files[0].name : result.downloadName, "data.json");
    assert.deepEqual(result.stats, [
      { label: "Rows", value: "2" },
      { label: "Columns", value: "2" },
    ]);
  });

  test(`${mode}: headerless values and each delimiter remain literal`, async () => {
    for (const delimiter of [",", ";", "\t", "|"]) {
      const result = await run(
        context(
          `Ada${delimiter}"quoted${delimiter}value"\nLin${delimiter}0`,
          {
            delimiter,
            firstRowAsHeaders: false,
          },
          streaming,
        ),
      );
      assertPreview(result, [
        ["Ada", `quoted${delimiter}value`],
        ["Lin", "0"],
      ]);
      assert.deepEqual(JSON.parse(await completeOutput(result)), result.jsonPreview.value);
    }
  });

  test(`${mode}: escaped headers, multiline text, empty cells and numeric spelling match JSON output`, async () => {
    const result = await run(
      context('"__proto__",note\nfalse,"line one\nline two"\n0,"say ""hello"""\nlast,', {}, streaming),
    );
    const expected = [
      { ["__proto__"]: "false", note: "line one\nline two" },
      { ["__proto__"]: "0", note: 'say "hello"' },
      { ["__proto__"]: "last", note: "" },
    ];
    assertPreview(result, expected);
    assert.deepEqual(JSON.parse(await completeOutput(result)), expected);
    const numbers = await run(context("value\n-0\n1.00\n9007199254740993", { parseNumbers: true }, streaming));
    assertPreview(numbers, [{ value: 0 }, { value: 1 }, { value: 9007199254740992 }]);
    assert.deepEqual(JSON.parse(await completeOutput(numbers)), numbers.jsonPreview.value);
  });

  test(`${mode}: header-only input previews an empty array and malformed rows still fail`, async () => {
    const result = await run(context("name,role", {}, streaming));
    assertPreview(result, []);
    assert.equal(await completeOutput(result), "[]");
    await assert.rejects(run(context("name,name\nAda,Admin", {}, streaming)), /CSV headers must be unique/);
    await assert.rejects(run(context("name,role\nAda", {}, streaming)), /same number of fields|expected 2 columns/);
  });
}

for (const streaming of [false, true])
  test(`${streaming ? "streaming" : "inline"} CSV retains an ordered, node-bounded prefix and the complete JSON artifact`, async () => {
    const rows = Array.from({ length: 1500 }, (_, index) => `row_${index},${index}`);
    const result = await run(context(`name,id\n${rows.join("\n")}`, { parseNumbers: true }, streaming));
    const expected = rows.map((_, index) => ({ name: `row_${index}`, id: index }));
    const limit = 333;
    assertPreview(result, expected.slice(0, limit));
    assert.equal(result.jsonPreview.truncated, true);
    assert.deepEqual(JSON.parse(await completeOutput(result)), expected);
    assert.equal(result.stats[0].value, "1500");
  });

test("streaming CSV bounds retained UTF-8 bytes independently of its raw prefix", async () => {
  const value = "😀".repeat(20_000);
  const result = await run(context(`value\n${Array(5).fill(value).join("\n")}`, {}, true));
  assert.equal(result.truncated, true);
  assert.equal(result.jsonPreview.truncated, true);
  assertPreview(
    result,
    Array.from({ length: 3 }, () => ({ value })),
  );
  assert.ok(Buffer.byteLength(result.jsonPreview.text) <= LARGE_TEXT_PREVIEW_BYTES);
  assert.deepEqual(
    JSON.parse(await completeOutput(result)),
    Array.from({ length: 5 }, () => ({ value })),
  );
});

test("a single oversized streamed row retains its artifact without an empty misleading tree", async () => {
  const value = "x".repeat(300_000);
  const result = await run(context(`value\n${value}`, {}, true));
  assert.equal(result.truncated, true);
  assert.equal(result.jsonPreview, undefined);
  assert.equal(await completeOutput(result), `[\n  {"value":"${value}"}\n]`);
});

test("CSV previews preserve exact numeric strings when number conversion is disabled", async () => {
  const values = ["9007199254740993", "1.234567890123456789", "-0", "1e400", "1e3", "1.00"];
  for (const streaming of [false, true]) {
    const result = await run(context(`value\n${values.join("\n")}`, { parseNumbers: false }, streaming));
    assertPreview(
      result,
      values.map((value) => ({ value })),
    );
    assert.deepEqual(JSON.parse(await completeOutput(result)), result.jsonPreview.value);
  }
});
