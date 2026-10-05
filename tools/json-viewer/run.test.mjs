import { describe, expect, test } from "vitest";
import { run as viewer } from "./run.worker.ts";
import { context, execute, content } from "../../tests/helpers/json-tools.mjs";

test.each(["", " \n\t", "{", '{"a":1,}', '"unterminated', '{"a":undefined}'])(
  "rejects empty or malformed strict input %j",
  async (text) => {
    await expect(execute(viewer, text, { path: "$" })).rejects.toMatchObject({ message: expect.any(String) });
  },
);

test("retains nested data and formatted artifact text", async () => {
  const result = await execute(viewer, '{"users":[{"name":"Ada","active":false}],"empty":null}');
  expect(result.value).toEqual({ users: [{ name: "Ada", active: false }], empty: null });
  expect(JSON.parse(result.text)).toEqual(result.value);
  expect(result.text).toContain('\n  "users": [\n');
});
test("does not apply a repair strategy implicitly", async () => {
  await expect(execute(viewer, '{"broken":}', { repairMode: "null" })).rejects.toMatchObject({ code: "json-syntax" });
});

test("syntax errors expose coordinates for translated recovery controls", async () => {
  await expect(execute(viewer, '{\n  "missing":\n}')).rejects.toMatchObject({
    code: "json-syntax",
    details: {
      line: expect.any(Number),
      column: expect.any(Number),
      values: { line: expect.any(Number), column: expect.any(Number) },
    },
  });
});
