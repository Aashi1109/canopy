import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vitest";

const require = createRequire(import.meta.url);
const adapterPath = resolve(
  dirname(require.resolve("@opennextjs/cloudflare")),
  "../cli/build/open-next/bundle-node-middleware.js",
);
const { bundleNodeMiddleware } = await import(pathToFileURL(adapterPath).href);

test("the OpenNext middleware bundle supplies pg's Cloudflare socket transport", async () => {
  const directory = mkdtempSync(join(tmpdir(), "canopy-middleware-postgres-"));
  const outputDir = join(directory, ".open-next");
  const writeFixture = (path, contents) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  };
  try {
    writeFixture(join(directory, ".next/server/webpack-runtime.js"), "");
    writeFixture(join(outputDir, "middleware/.next/server/middleware.js"), "");
    writeFixture(
      join(directory, "adapters/middleware.js"),
      `const pg = require(${JSON.stringify(require.resolve("pg"))});
       export const createClient = () => new pg.Client({
         host: "invalid.example", user: "fixture", password: "fixture",
         database: "fixture", port: 5432, ssl: true,
       });`,
    );
    await bundleNodeMiddleware({
      config: {},
      outputDir,
      monorepoRoot: directory,
      appPath: directory,
      appBuildOutputPath: directory,
      openNextDistDir: directory,
      nextVersion: "16.3.3",
      openNextVersion: "4.1.4",
      minify: false,
      debug: false,
    });
    // Construct the client only: no socket is opened and no credentials are read.
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import assert from "node:assert/strict";
         Object.defineProperty(globalThis, "navigator", { value: { userAgent: "Cloudflare-Workers" } });
         const { createClient } = await import(${JSON.stringify(pathToFileURL(join(outputDir, "middleware/handler.mjs")).href)});
         const client = createClient();
         assert.equal(typeof client.connection.stream.startTls, "function");
         assert.equal(client.connection.stream.writable, false);
         console.log("Cloudflare socket ready");`,
      ],
      { encoding: "utf8", env: {} },
    );
    expect(output.trim()).toBe("Cloudflare socket ready");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
