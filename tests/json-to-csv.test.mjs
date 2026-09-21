import assert from "node:assert/strict";
import test from "node:test";

import { convertJsonToCsv } from "../lib/devtools/shared/csv.ts";
import { run } from "../tools/json-to-csv/run.ts";

const convert = (text, settings = {}) =>
  run({
    input: { text, files: [] },
    settings: { delimiter: ",", repairMode: "off", ...settings },
    signal: new AbortController().signal,
  });

test("JSON to CSV preserves the CSV artifact and provides matching table cells", () => {
  const result = convert('[{"name":"Ada","active":false},{"name":"Lin","count":0}]');

  assert.equal(result.render, "text");
  assert.equal(result.downloadName, "data.csv");
  assert.equal(result.text, "name,active,count\nAda,false,\nLin,,0");
  assert.deepEqual(result.tablePreview, {
    render: "table",
    columns: ["name", "active", "count"],
    rows: [
      ["Ada", "false", ""],
      ["Lin", "", "0"],
    ],
    showColumnDividers: true,
    truncated: false,
  });
  assert.deepEqual(result.stats, [
    { label: "Rows", value: "2" },
    { label: "Columns", value: "3" },
  ]);
});

test("JSON to CSV previews quoted values and line breaks for every delimiter", () => {
  for (const delimiter of [",", ";", "\t", "|"]) {
    const column = `name${delimiter}label`;
    const value = `  Ada${delimiter}\"Lovelace\"\nnext\r\nline  `;
    const result = convert(JSON.stringify([{ [column]: value, plain: "end" }]), { delimiter });

    assert.equal(
      result.text,
      `"${column}"${delimiter}plain\n"  Ada${delimiter}\"\"Lovelace\"\"\nnext\r\nline  "${delimiter}end`,
    );
    assert.deepEqual(result.tablePreview.columns, [column, "plain"]);
    assert.deepEqual(result.tablePreview.rows, [[value, "end"]]);
  }
});

test("JSON to CSV retains all-empty rows in both artifact and preview", () => {
  const result = convert('[{"note":""},{"note":null},{}]');

  assert.equal(result.text, "note\n\n\n");
  assert.deepEqual(result.tablePreview.rows, [[""], [""], [""]]);
  assert.equal(result.stats[0].value, "3");
});

test("JSON to CSV shares flattened and JSON-encoded cell values with its preview", () => {
  const result = convertJsonToCsv(
    JSON.stringify([
      { profile: { city: "Pune" }, tags: ["a", { b: [2] }], empty: {} },
      { tags: [], active: false, count: 0 },
    ]),
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.columns, ["profile.city", "tags", "empty", "active", "count"]);
  assert.deepEqual(result.rows, [
    ["Pune", '["a",{"b":[2]}]', "{}", "", ""],
    ["", "[]", "", "false", "0"],
  ]);
  assert.equal(result.output, 'profile.city,tags,empty,active,count\nPune,"[""a"",{""b"":[2]}]",{},,\n,[],,false,0');
});

test("JSON to CSV applies repair mode to both representations", () => {
  const source = '[{"name":"Ada","age":}]';
  const removed = convert(source, { repairMode: "remove" });
  const nulled = convert(source, { repairMode: "null" });

  assert.equal(removed.text, "name\nAda");
  assert.deepEqual(removed.tablePreview.columns, ["name"]);
  assert.deepEqual(removed.tablePreview.rows, [["Ada"]]);
  assert.equal(nulled.text, "name,age\nAda,");
  assert.deepEqual(nulled.tablePreview.columns, ["name", "age"]);
  assert.deepEqual(nulled.tablePreview.rows, [["Ada", ""]]);
  assert.deepEqual(nulled.stats.at(-1), { label: "Repaired", value: "Yes" });
  assert.throws(() => convert(source), { code: "syntax" });
});

test("JSON to CSV keeps zero-column inputs successful", () => {
  for (const [source, rowCount] of [
    ["[]", 0],
    ["{}", 1],
    ["[{},{}]", 2],
  ]) {
    const result = convert(source);

    assert.equal(result.text, "");
    assert.deepEqual(result.tablePreview.columns, []);
    assert.equal(result.tablePreview.truncated, false);
    assert.equal(result.stats[0].value, String(rowCount));
    assert.equal(result.stats[1].value, "0");
  }
});

test("JSON to CSV bounds preview rows without shortening the CSV artifact or counts", () => {
  for (const count of [1000, 1001]) {
    const result = convert(JSON.stringify(Array.from({ length: count }, (_, id) => ({ id }))));

    assert.equal(result.tablePreview.rows.length, 1000);
    assert.equal(result.tablePreview.truncated, count > 1000);
    assert.equal(result.text.split("\n").length, count + 1);
    assert.equal(result.stats[0].value, String(count));
    assert.ok(result.text.endsWith(`\n${count - 1}`));
  }
});

test("JSON to CSV bounds wide previews by cell count while retaining at least one row", () => {
  for (const [columnCount, rowCount, previewRows] of [
    [25, 401, 400],
    [10001, 2, 1],
  ]) {
    const record = Object.fromEntries(Array.from({ length: columnCount }, (_, index) => [`c${index}`, index]));
    const result = convert(JSON.stringify(Array.from({ length: rowCount }, () => record)));

    assert.equal(result.tablePreview.columns.length, columnCount);
    assert.equal(result.tablePreview.rows.length, previewRows);
    assert.equal(result.tablePreview.truncated, true);
    assert.equal(result.text.split("\n").length, rowCount + 1);
    assert.equal(result.stats[0].value, String(rowCount));
    assert.equal(result.stats[1].value, String(columnCount));
  }
});
