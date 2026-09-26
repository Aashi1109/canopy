import { describe, expect, test } from "vitest";
import { run as toXml } from "./run.ts";
import { context, execute, content } from "../../tests/helpers/json-tools.mjs";

test.each(["", " \n\t", "{", '{"a":1,}', '"unterminated', '{"a":undefined}'])(
  "rejects empty or malformed strict input %j",
  async (text) => {
    await expect(execute(toXml, text, { path: "$" })).rejects.toMatchObject({ message: expect.any(String) });
  },
);

test.each(["remove", "null"])("repairs %s before XML conversion", async (repairMode) => {
  expect((await execute(toXml, '{"broken":,"ok":false}', { repairMode })).text).toBe(
    `<?xml version="1.0" encoding="UTF-8"?>\n<root>\n${repairMode === "null" ? "  <broken/>\n" : ""}  <ok>false</ok>\n</root>`,
  );
});
