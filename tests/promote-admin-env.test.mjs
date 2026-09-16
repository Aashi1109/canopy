import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);
const source = new URL("../packages/database/scripts/promote-admin.mjs", import.meta.url);

test("admin promotion loads root env files from either cwd and preserves environment precedence", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "promote-admin-env-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packageDir = path.join(root, "packages/database");
  const script = path.join(packageDir, "scripts/promote-admin.mjs");
  await mkdir(path.dirname(script), { recursive: true });
  await copyFile(source, script);
  await mkdir(path.join(root, "node_modules/postgres"), { recursive: true });
  await symlink(
    path.dirname(createRequire(source).resolve("dotenv/package.json")),
    path.join(root, "node_modules/dotenv"),
    "dir",
  );
  await writeFile(
    path.join(root, "node_modules/postgres/package.json"),
    JSON.stringify({ type: "module", exports: "./index.js" }),
  );
  await writeFile(
    path.join(root, "node_modules/postgres/index.js"),
    `
    import assert from "node:assert/strict";
    export default function postgres(url) {
      assert.equal(url, process.env.EXPECTED_DATABASE_URL);
      console.log("Database URL verified; stopped before database access");
      process.exit(0);
    }
  `,
  );
  await writeFile(path.join(root, ".env"), "DATABASE_URL=postgres://base-fixture\n");
  await writeFile(path.join(root, ".env.local"), "DATABASE_URL=postgres://local-fixture\n");

  for (const cwd of [root, packageDir]) {
    for (const exported of [false, true]) {
      const { stdout } = await run(process.execPath, [script, "fixture@example.com"], {
        cwd,
        env: {
          EXPECTED_DATABASE_URL: exported
            ? "postgres://exported-fixture"
            : "postgres://local-fixture",
          ...(exported ? { DATABASE_URL: "postgres://exported-fixture" } : {}),
        },
      });
      assert.match(stdout, /Database URL verified/);
    }
  }
  await rm(path.join(root, ".env.local"));
  const { stdout } = await run(process.execPath, [script, "fixture@example.com"], {
    cwd: packageDir,
    env: { EXPECTED_DATABASE_URL: "postgres://base-fixture" },
  });
  assert.match(stdout, /Database URL verified/);
  await rm(path.join(root, ".env"));
  await assert.rejects(
    run(process.execPath, [script, "fixture@example.com"], { cwd: packageDir, env: {} }),
    /DATABASE_URL is required/,
  );
});
