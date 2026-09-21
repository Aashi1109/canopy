import assert from "node:assert/strict";
import test from "node:test";

import { run } from "../tools/json-array-to-table/run.ts";

const buildTable = async (text, repairMode = "off") =>
  run({
    input: { text, files: [] },
    settings: { repairMode },
    signal: new AbortController().signal,
  });

test("JSON array table preserves its HTML artifact and provides a structured preview", async () => {
  const result = await buildTable('[{"name":"Ada","role":"Admin"},{"name":"Lin","role":"Editor"}]');

  assert.equal(result.render, "html");
  assert.equal(result.downloadName, "table.html");
  assert.equal(
    result.html,
    "<table><thead><tr><th>name</th><th>role</th></tr></thead><tbody><tr><td>Ada</td><td>Admin</td></tr><tr><td>Lin</td><td>Editor</td></tr></tbody></table>",
  );
  assert.deepEqual(result.tablePreview, {
    render: "table",
    columns: ["name", "role"],
    rows: [
      ["Ada", "Admin"],
      ["Lin", "Editor"],
    ],
    showColumnDividers: true,
  });
});

test("JSON array table aligns nested and missing fields without losing falsy values", async () => {
  const result = await buildTable(
    JSON.stringify([
      { profile: { city: "Pune" }, active: false, count: 0, note: null, tags: ["a", "b"] },
      { profile: { city: "Lisbon" }, extra: "new" },
    ]),
  );

  assert.deepEqual(result.tablePreview.columns, ["profile.city", "active", "count", "note", "tags", "extra"]);
  assert.deepEqual(result.tablePreview.rows, [
    ["Pune", "false", "0", "", "a,b", ""],
    ["Lisbon", "", "", "", "", "new"],
  ]);
  assert.ok(result.html.includes("<tr><td>Pune</td><td>false</td><td>0</td><td></td><td>a,b</td><td></td></tr>"));
});

test("JSON array table keeps markup literal in preview data and escapes the HTML artifact", async () => {
  const column = '<img src=x onerror="alert(1)">';
  const cell = '<script>alert("x")</script>&\'';
  const result = await buildTable(JSON.stringify([{ [column]: cell }]));

  assert.deepEqual(result.tablePreview.columns, [column]);
  assert.deepEqual(result.tablePreview.rows, [[cell]]);
  assert.equal(
    result.html,
    "<table><thead><tr><th>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</th></tr></thead><tbody><tr><td>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;</td></tr></tbody></table>",
  );
});

test("JSON array table rejects invalid shapes and arrays without columns", async () => {
  for (const text of ['{"name":"Ada"}', '["Ada"]', "[null]", '[{"name":"Ada"},2]']) {
    await assert.rejects(buildTable(text), { code: "shape", message: "JSON input must be an array of objects." });
  }
  for (const text of ["[]", "[{}]"]) {
    await assert.rejects(buildTable(text), {
      code: "empty-columns",
      message: "JSON array objects need at least one field.",
    });
  }
  await assert.rejects(buildTable("  "), { code: "input-required" });
  await assert.rejects(buildTable("[{"), { code: "invalid-json" });
});

test("JSON array table applies the selected repair mode to artifact and preview", async () => {
  const source = '[{"name":"Ada","age":}]';
  const repaired = await buildTable(source, "null");

  assert.deepEqual(repaired.tablePreview.columns, ["name", "age"]);
  assert.deepEqual(repaired.tablePreview.rows, [["Ada", ""]]);
  assert.ok(repaired.html.includes("<tr><td>Ada</td><td></td></tr>"));
  await assert.rejects(buildTable(source), { code: "invalid-json" });
});
