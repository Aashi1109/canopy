import { describe, expect, test } from "vitest";
import { run as typescript } from "./run.ts";
import { context, execute, content } from "../../tests/helpers/json-tools.mjs";

test.each(["", " \n\t", "{", '{"a":1,}', '"unterminated', '{"a":undefined}'])(
  "rejects empty or malformed strict input %j",
  async (text) => {
    await expect(execute(typescript, text, { path: "$" })).rejects.toMatchObject({ message: expect.any(String) });
  },
);

test("produces reusable nested interfaces and quotes unsafe property names", async () => {
  const result = await execute(typescript, '{"user":{"id":1},"full name":"Ada","flags":[true,false],"empty":null}');
  expect(result.text).toBe(
    'export interface Root {\n  user: User;\n  "full name": string;\n  flags: boolean[];\n  empty: null;\n}\n\nexport interface User {\n  id: number;\n}',
  );
  expect(result.downloadName).toBe("types.ts");
});
test.each([
  ["[]", "unknown[]"],
  ["null", "null"],
  ["false", "boolean"],
  ["[1,2]", "number[]"],
])("supports root %s", async (source, type) =>
  expect((await execute(typescript, source)).text).toBe(`export type Root = ${type};`),
);
test.each(["remove", "null"])("respects %s repair", async (repairMode) => {
  expect((await execute(typescript, '{"broken":,"ok":true}', { repairMode })).text).toBe(
    `export interface Root {\n${repairMode === "null" ? "  broken: null;\n" : ""}  ok: boolean;\n}`,
  );
});

test("heterogeneous arrays generate a TypeScript type that accepts the original JSON value", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const { spawnSync } = await import("node:child_process");
  const directory = await mkdtemp(join(tmpdir(), "canopy-json-types-"));
  try {
    const result = await execute(typescript, '[1,"two"]');
    await writeFile(join(directory, "sample.ts"), `${result.text}\nconst original: Root = [1, "two"];\n`);
    await writeFile(
      join(directory, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { noEmit: true, strict: true, skipLibCheck: true, types: [] },
        files: ["sample.ts"],
      }),
    );
    const compiler = fileURLToPath(new URL("../bin/tsc", import.meta.resolve("typescript")));
    const checked = spawnSync(process.execPath, ["--max-old-space-size=128", compiler, "--project", directory], {
      encoding: "utf8",
      timeout: 10_000,
    });
    expect(checked.error).toBeUndefined();
    expect(checked.status, checked.stdout + checked.stderr).toBe(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
