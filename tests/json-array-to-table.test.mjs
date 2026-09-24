import { expect, test } from "vitest";

import { run } from "../tools/json-array-to-table/run.ts";

const buildTable = async (text, repairMode = "off") =>
  run({
    input: { text, files: [] },
    settings: { repairMode },
    signal: new AbortController().signal,
  });

test("JSON array table preserves its HTML artifact and provides a structured preview", async () => {
  const result = await buildTable('[{"name":"Ada","role":"Admin"},{"name":"Lin","role":"Editor"}]');

  expect(result.render).toBe("html");
  expect(result.downloadName).toBe("table.html");
  expect(result.html).toBe(
    "<table><thead><tr><th>name</th><th>role</th></tr></thead><tbody><tr><td>Ada</td><td>Admin</td></tr><tr><td>Lin</td><td>Editor</td></tr></tbody></table>",
  );
  expect(result.tablePreview).toEqual({
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

  expect(result.tablePreview.columns).toEqual(["profile.city", "active", "count", "note", "tags", "extra"]);
  expect(result.tablePreview.rows).toEqual([
    ["Pune", "false", "0", "", "a,b", ""],
    ["Lisbon", "", "", "", "", "new"],
  ]);
  expect(
    result.html.includes("<tr><td>Pune</td><td>false</td><td>0</td><td></td><td>a,b</td><td></td></tr>"),
  ).toBeTruthy();
});

test("JSON array table keeps markup literal in preview data and escapes the HTML artifact", async () => {
  const column = '<img src=x onerror="alert(1)">';
  const cell = '<script>alert("x")</script>&\'';
  const result = await buildTable(JSON.stringify([{ [column]: cell }]));

  expect(result.tablePreview.columns).toEqual([column]);
  expect(result.tablePreview.rows).toEqual([[cell]]);
  expect(result.html).toBe(
    "<table><thead><tr><th>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</th></tr></thead><tbody><tr><td>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;</td></tr></tbody></table>",
  );
});

test("JSON array table rejects invalid shapes and arrays without columns", async () => {
  for (const text of ['{"name":"Ada"}', '["Ada"]', "[null]", '[{"name":"Ada"},2]']) {
    await expect(buildTable(text)).rejects.toMatchObject({
      code: "shape",
      message: "JSON input must be an array of objects.",
    });
  }
  for (const text of ["[]", "[{}]"]) {
    await expect(buildTable(text)).rejects.toMatchObject({
      code: "empty-columns",
      message: "JSON array objects need at least one field.",
    });
  }
  await expect(buildTable("  ")).rejects.toMatchObject({ code: "input-required" });
  await expect(buildTable("[{")).rejects.toMatchObject({ code: "invalid-json" });
});

test("JSON array table applies the selected repair mode to artifact and preview", async () => {
  const source = '[{"name":"Ada","age":}]';
  const repaired = await buildTable(source, "null");

  expect(repaired.tablePreview.columns).toEqual(["name", "age"]);
  expect(repaired.tablePreview.rows).toEqual([["Ada", ""]]);
  expect(repaired.html.includes("<tr><td>Ada</td><td></td></tr>")).toBeTruthy();
  await expect(buildTable(source)).rejects.toMatchObject({ code: "invalid-json" });
});
