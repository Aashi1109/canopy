import { describe, expect, test } from "vitest";
import { run as fromYaml } from "./run.ts";
import { context, execute, content } from "../../tests/helpers/json-tools.mjs";

test("resolves YAML anchors without losing their values", async () => {
  expect(JSON.parse((await execute(fromYaml, "base: &base\n  ready: true\ncopy: *base\n")).text)).toEqual({
    base: { ready: true },
    copy: { ready: true },
  });
});
test.each(["", " \n", "a: [unterminated", "a: 1\na: 2", "---\na: 1\n---\nb: 2"])(
  "rejects invalid or unsupported YAML %j",
  async (source) => {
    await expect(execute(fromYaml, source)).rejects.toMatchObject({ message: expect.any(String) });
  },
);

test("converts nested scalar values into downloadable JSON", async () => {
  const result = await execute(
    fromYaml,
    "name: 'yes'\nnumber: '0123'\nactive: false\nempty: null\nusers:\n  - name: 👋\n",
  );
  expect(JSON.parse(result.text)).toEqual({
    name: "yes",
    number: "0123",
    active: false,
    empty: null,
    users: [{ name: "👋" }],
  });
  expect(result.downloadName).toBe("converted-yaml.json");
});

test("respects cancellation", async () => {
  const ctx = context("a: 1");
  ctx.signal = AbortSignal.abort();
  await expect(fromYaml(ctx)).rejects.toMatchObject({ name: "AbortError" });
});
