import { describe, expect, test } from "vitest";
import { run as table } from "./run.ts";
import { context, execute, content } from "../../tests/helpers/json-tools.mjs";

test.each(["", " \n\t", "{", '{"a":1,}', '"unterminated', '{"a":undefined}'])(
  "rejects empty or malformed strict input %j",
  async (text) => {
    await expect(execute(table, text, { path: "$" })).rejects.toMatchObject({ message: expect.any(String) });
  },
);

test("HTML output escapes markup while preview cells preserve the source values", async () => {
  const result = await execute(table, '[{"name":"<script>alert(1)</script>","active":false,"count":0}]');
  expect(result.html).toBe(
    "<table><thead><tr><th>name</th><th>active</th><th>count</th></tr></thead><tbody><tr><td>&lt;script&gt;alert(1)&lt;/script&gt;</td><td>false</td><td>0</td></tr></tbody></table>",
  );
  expect(result.tablePreview.rows).toEqual([["<script>alert(1)</script>", "false", "0"]]);
  expect(result.downloadName).toBe("table.html");
});

test.each(["remove", "null"])("%s repair changes the available columns", async (repairMode) => {
  const result = await execute(table, '[{"name":"Ada","broken":}]', { repairMode });
  expect(result.tablePreview.columns).toEqual(repairMode === "null" ? ["name", "broken"] : ["name"]);
  expect(result.tablePreview.rows).toEqual(repairMode === "null" ? [["Ada", ""]] : [["Ada"]]);
});

test.each(["[]", "[{}]", "[1,2]", "null", "{}"])(
  "rejects a value without object rows and columns: %s",
  async (source) => {
    await expect(execute(table, source)).rejects.toMatchObject({ code: expect.stringMatching(/shape|empty-columns/) });
  },
);
