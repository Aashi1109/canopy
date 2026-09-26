import { describe, expect, test } from "vitest";
import { run as editor } from "./run.ts";
import { context, execute, content } from "../../tests/helpers/json-tools.mjs";

test.each(["", " \n\t", "{", '{"a":1,}', '"unterminated', '{"a":undefined}'])(
  "rejects empty or malformed strict input %j",
  async (text) => {
    await expect(execute(editor, text, { path: "$" })).rejects.toMatchObject({ message: expect.any(String) });
  },
);

test.each(["remove", "null"])("honors %s repair without losing valid falsy values", async (repairMode) => {
  const result = await execute(editor, '{"broken":,"active":false,"count":0,"name":""}', { repairMode });
  expect(JSON.parse(content(result))).toEqual({
    ...(repairMode === "null" ? { broken: null } : {}),
    active: false,
    count: 0,
    name: "",
  });
});
test.each(["null", "false", "0", '"👋"', "[]", "{}"])("preserves root %s", async (text) => {
  expect(JSON.parse(content(await execute(editor, text)))).toEqual(JSON.parse(text));
});

test.each(["2", "4"])("%s-space indentation preserves nested values", async (indent) => {
  const result = await execute(editor, '{"z":[{"z":false,"a":0}],"a":null}', { indent });
  expect(result.code).toBe(JSON.stringify({ z: [{ z: false, a: 0 }], a: null }, null, Number(indent)));
  expect(result.downloadName).toBe("edited.json");
  expect(result.language).toBe("json");
});
