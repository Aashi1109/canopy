import { describe, expect, test } from "vitest";
import { run as toCsv } from "./run.ts";
import { context, execute, content } from "../../tests/helpers/json-tools.mjs";

test.each(["", " \n\t", "{", '{"a":1,}', '"unterminated', '{"a":undefined}'])(
  "rejects empty or malformed strict input %j",
  async (text) => {
    await expect(execute(toCsv, text, { delimiter: "," })).rejects.toMatchObject({ message: expect.any(String) });
  },
);

test.each([",", ";", "\t", "|"])("%j delimiter produces matching full CSV and preview cells", async (delimiter) => {
  const result = await execute(toCsv, '[{"name":"Ada","active":false},{"name":"Lin","count":0}]', { delimiter });
  expect(result.text).toBe(
    [
      ["name", "active", "count"],
      ["Ada", "false", ""],
      ["Lin", "", "0"],
    ]
      .map((row) => row.join(delimiter))
      .join("\n"),
  );
  expect(result.tablePreview.columns).toEqual(["name", "active", "count"]);
  expect(result.tablePreview.rows).toEqual([
    ["Ada", "false", ""],
    ["Lin", "", "0"],
  ]);
  expect(result.downloadName).toBe("data.csv");
});

test.each(["remove", "null"])("%s repair changes both artifact and preview consistently", async (repairMode) => {
  const result = await execute(toCsv, '[{"name":"Ada","broken":}]', { repairMode, delimiter: "," });
  expect(result.tablePreview.columns).toEqual(repairMode === "null" ? ["name", "broken"] : ["name"]);
  expect(result.text).toBe(repairMode === "null" ? "name,broken\nAda," : "name\nAda");
  expect(result.stats).toContainEqual({ label: "Repaired", value: "Yes" });
});
