import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, onTestFinished, test } from "vitest";

const run = promisify(execFile);
const source = new URL("../db/scripts/promote-admin.mjs", import.meta.url);

test("admin promotion loads root env files from either cwd and preserves environment precedence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "promote-admin-env-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const databaseDir = path.join(root, "db");
  const script = path.join(databaseDir, "scripts/promote-admin.mjs");
  await mkdir(path.dirname(script), { recursive: true });
  await copyFile(source, script);
  await mkdir(path.join(root, "node_modules/pg"), { recursive: true });
  await mkdir(path.join(root, "lib"), { recursive: true });
  for (const name of ["cache", "config"]) {
    await symlink(new URL(`../lib/${name}/`, import.meta.url), path.join(root, "lib", name), "dir");
  }
  await symlink(
    path.dirname(createRequire(source).resolve("dotenv/package.json")),
    path.join(root, "node_modules/dotenv"),
    "dir",
  );
  await writeFile(
    path.join(root, "node_modules/pg/package.json"),
    JSON.stringify({ type: "module", exports: "./index.js" }),
  );
  await writeFile(
    path.join(root, "node_modules/pg/index.js"),
    `
    import assert from "node:assert/strict";
    export default { Client: class {
      constructor({ connectionString }) {
        assert.equal(connectionString, process.env.EXPECTED_DATABASE_URL);
        console.log("Database URL verified; stopped before database access");
        process.exit(0);
      }
    } };
  `,
  );
  await writeFile(path.join(root, ".env"), "DATABASE_URL=postgres://base-fixture\n");
  await writeFile(path.join(root, ".env.local"), "DATABASE_URL=postgres://local-fixture\n");

  for (const cwd of [root, databaseDir]) {
    for (const exported of [false, true]) {
      const { stdout } = await run(process.execPath, [script, "fixture@example.com"], {
        cwd,
        env: {
          EXPECTED_DATABASE_URL: exported ? "postgres://exported-fixture" : "postgres://local-fixture",
          ...(exported ? { DATABASE_URL: "postgres://exported-fixture" } : {}),
        },
      });
      expect(stdout).toMatch(/Database URL verified/);
    }
  }
  await rm(path.join(root, ".env.local"));
  const { stdout } = await run(process.execPath, [script, "fixture@example.com"], {
    cwd: databaseDir,
    env: { EXPECTED_DATABASE_URL: "postgres://base-fixture" },
  });
  expect(stdout).toMatch(/Database URL verified/);
  await rm(path.join(root, ".env"));
  await expect(run(process.execPath, [script, "fixture@example.com"], { cwd: databaseDir, env: {} })).rejects.toThrow(
    /DATABASE_URL is required/,
  );
}, 60000);
