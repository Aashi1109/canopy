import { describe, expect, test } from "vitest";
import { run as minifier } from "./run.worker.ts";
import { context, execute, content } from "../../tests/helpers/json-tools.mjs";

test.each(["", " \n\t", "{", '{"a":1,}', '"unterminated', '{"a":undefined}'])(
  "rejects empty or malformed strict input %j",
  async (text) => {
    await expect(execute(minifier, text, { path: "$" })).rejects.toMatchObject({ message: expect.any(String) });
  },
);

test.each(["remove", "null"])("honors %s repair without losing valid falsy values", async (repairMode) => {
  const result = await execute(minifier, '{"broken":,"active":false,"count":0,"name":""}', { repairMode });
  expect(JSON.parse(content(result))).toEqual({
    ...(repairMode === "null" ? { broken: null } : {}),
    active: false,
    count: 0,
    name: "",
  });
});
test.each(["null", "false", "0", '"👋"', "[]", "{}"])("preserves root %s", async (text) => {
  expect(JSON.parse(content(await execute(minifier, text)))).toEqual(JSON.parse(text));
});
