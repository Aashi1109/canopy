import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { rm } from "node:fs/promises";
import { dirname } from "node:path";
import test from "node:test";

const seedUrl = new URL("../scripts/seed.mjs", import.meta.url).href;

test("db seed uploads and assigns icons after catalog seeding, stopping on failures", async () => {
  const argv = process.argv;
  const calls = [];
  const manifests = new Set();
  let failingStep;
  globalThis.__seedIconProcess = (executable, args, options) => {
    assert.equal(executable, process.execPath);
    assert.equal(options.stdio, "inherit");
    calls.push(args);
    const outputIndex = args.indexOf("--output");
    if (outputIndex !== -1) manifests.add(args[outputIndex + 1]);
    return { status: calls.length === failingStep ? 1 : 0 };
  };
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (context.parentURL?.startsWith(seedUrl) && specifier === "node:child_process") {
        return {
          shortCircuit: true,
          url: `data:text/javascript,${encodeURIComponent("export const spawnSync = (...args) => globalThis.__seedIconProcess(...args);")}`,
        };
      }
      return next(specifier, context);
    },
  });
  try {
    process.argv = [argv[0], "seed.mjs", "--icons-dir", "/tmp/custom icons"];
    await import(`${seedUrl}?success`);
    assert.equal(calls.length, 3);
    assert.ok(calls[0][0].endsWith("/packages/database/scripts/seed.mjs"));
    assert.ok(calls[1][0].endsWith("/scripts/upload-tool-icons.mjs"));
    assert.ok(calls[2][0].endsWith("/scripts/update-tool-icons.mjs"));
    assert.equal(calls[1][calls[1].indexOf("--dir") + 1], "/tmp/custom icons");
    assert.equal(calls[2][calls[2].indexOf("--manifest") + 1], [...manifests][0]);
    assert.ok(calls[2].includes("--missing-only"));
    for (failingStep of [1, 2, 3]) {
      calls.length = 0;
      await assert.rejects(import(`${seedUrl}?failure-${failingStep}`), /failed/);
      assert.equal(calls.length, failingStep);
    }
  } finally {
    hooks.deregister();
    process.argv = argv;
    delete globalThis.__seedIconProcess;
    for (const manifest of manifests) await rm(dirname(manifest), { recursive: true, force: true });
  }
});
