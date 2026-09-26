import { describe, expect, test } from "vitest";
import { run as sorter } from "./run.ts";
import { context, execute, content } from "../../tests/helpers/json-tools.mjs";

test.each(["", " \n\t", "{", '{"a":1,}', '"unterminated', '{"a":undefined}'])(
  "rejects empty or malformed strict input %j",
  async (text) => {
    await expect(execute(sorter, text, { path: "$" })).rejects.toMatchObject({ message: expect.any(String) });
  },
);

test.each(["remove", "null"])("honors %s repair without losing valid falsy values", async (repairMode) => {
  const result = await execute(sorter, '{"broken":,"active":false,"count":0,"name":""}', { repairMode });
  expect(JSON.parse(content(result))).toEqual({
    ...(repairMode === "null" ? { broken: null } : {}),
    active: false,
    count: 0,
    name: "",
  });
});
test.each(["null", "false", "0", '"👋"', "[]", "{}"])("preserves root %s", async (text) => {
  expect(JSON.parse(content(await execute(sorter, text)))).toEqual(JSON.parse(text));
});

test.each(["2", "4"])("%s-space indentation preserves nested values", async (indent) => {
  const result = await execute(sorter, '{"z":[{"z":false,"a":0}],"a":null}', { indent });
  expect(result.code).toBe(JSON.stringify({ a: null, z: [{ a: 0, z: false }] }, null, Number(indent)));
  expect(result.downloadName).toBe("sorted.json");
  expect(result.language).toBe("json");
});
