import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("list results are part of the closed tool render contract", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "smarttools-result-contract-"));
  const fixture = path.join(directory, "fixture.ts");
  const config = path.join(directory, "tsconfig.json");

  try {
    await writeFile(
      fixture,
      `import type {
  ToolListRender,
  ToolRender,
  ToolRenderKind,
  ToolResult,
} from ${JSON.stringify(path.join(ROOT, "lib/tool-framework/result.ts"))};

const minimal = { render: "list", items: [] } satisfies ToolListRender;
const complete = {
  render: "list",
  items: ["first", "second"],
  labels: ["Primary", "Secondary"],
  downloadName: "values.txt",
} satisfies ToolListRender;
const render: ToolRender = complete;
const result: ToolResult = { ...minimal, stats: [{ label: "Count", value: "0" }] };
const kind: ToolRenderKind = "list";
void [render, result, kind];
`,
    );
    await writeFile(
      config,
      JSON.stringify({
        compilerOptions: {
          allowImportingTsExtensions: true,
          lib: ["ES2022", "DOM"],
          module: "ESNext",
          moduleResolution: "Bundler",
          noEmit: true,
          paths: { "@/*": [path.join(ROOT, "*")] },
          skipLibCheck: true,
          strict: true,
          target: "ES2022",
          types: [],
        },
        files: [fixture],
      }),
    );

    const compiled = spawnSync(process.execPath, [path.join(ROOT, "node_modules/typescript/bin/tsc"), "-p", config], {
      cwd: ROOT,
      encoding: "utf8",
    });

    assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
