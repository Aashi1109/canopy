import { describe, expect, test } from "vitest";
import { run as toYaml } from "./run.ts";
import { context, execute, content } from "../../tests/helpers/json-tools.mjs";

test.each(["", " \n\t", "{", '{"a":1,}', '"unterminated', '{"a":undefined}'])(
  "rejects empty or malformed strict input %j",
  async (text) => {
    await expect(execute(toYaml, text, { path: "$" })).rejects.toMatchObject({ message: expect.any(String) });
  },
);

test("preserves YAML-looking strings, Unicode and nested data", async () => {
  const value = {
    name: "yes",
    number: "0123",
    active: false,
    empty: null,
    users: [{ name: "👋" }],
    text: "line one\nline two\n",
  };
  const result = await execute(toYaml, JSON.stringify(value));
  const { load } = await import("js-yaml");
  expect(load(result.text)).toEqual(value);
  expect(result.downloadName).toBe("converted.yaml");
});
test.each(["remove", "null"])("converts %s repaired JSON", async (repairMode) => {
  const { load } = await import("js-yaml");
  const result = await execute(toYaml, '{"broken":,"ok":false}', { repairMode });
  expect(load(result.text)).toEqual({ ...(repairMode === "null" ? { broken: null } : {}), ok: false });
});

test("respects cancellation", async () => {
  const ctx = context("{}");
  ctx.signal = AbortSignal.abort();
  await expect(toYaml(ctx)).rejects.toMatchObject({ name: "AbortError" });
});
