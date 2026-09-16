// Behaviour lock for migrated tools. Discovery is filesystem-driven: drop a
// `fixtures.json` next to a tool's run file and it gains coverage here with no
// edit to this file. Fixtures were captured from the pre-migration devtools
// runtime (lib/devtools/format-json.ts), which has since been deleted — they
// are now the record of that behaviour, not a regeneratable artefact.
process.env.TZ = "UTC";

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const TOOLS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "tools");

/** Run-file names, in resolution order. */
// All three execution hosts. `run.server.ts` belongs here even though it is a
// separate bundler context: its `run` has the same pure signature, so a fixture
// exercises it identically. Omitting it left the only server-runtime tool with
// no execution coverage at all.
const RUN_FILES = ["run.ts", "run.worker.ts", "run.server.ts", "execution.ts"];

/** Flattens a ToolResult to the {render, output, ...} shape fixtures capture. */
function normalize(result) {
  const normalized = {
    render: result.render ?? result.outputKind,
  };
  const output = result.text ?? result.src ?? result.html ?? result.output;
  if (output !== undefined) normalized.output = output;
  if (result.items) normalized.items = result.items;
  if (result.entries) {
    normalized.entries = result.entries.map(({ label, value }) => ({ label, value }));
  }
  if (result.labels) normalized.labels = result.labels;
  if (result.downloadName) normalized.downloadName = result.downloadName;
  const artifacts = result.artifacts ?? result.alternateArtifacts;
  if (artifacts?.length) {
    normalized.artifacts = artifacts.map(({ mimeType, name }) => ({ mimeType, name }));
  }
  return normalized;
}

function assertCase(expected, actual) {
  if (expected.itemCount !== undefined || expected.itemPattern) {
    assert.equal(actual.render, expected.render, "render kind");
    assert.ok(Array.isArray(actual.items), "items");
    if (expected.itemCount !== undefined) {
      assert.equal(actual.items.length, expected.itemCount, "item count");
    }
    if (expected.itemPattern) {
      const pattern = new RegExp(expected.itemPattern);
      for (const [index, item] of actual.items.entries()) {
        assert.match(item, pattern, `item ${index + 1} pattern`);
      }
    }
    if ("labels" in expected) assert.deepEqual(actual.labels, expected.labels, "labels");
    if ("downloadName" in expected) {
      assert.equal(actual.downloadName, expected.downloadName, "download name");
    }
    return;
  }
  if (!expected.pattern) return assert.deepEqual(actual, expected);
  assert.equal(actual.render, expected.render, "render kind");
  assert.match(actual.output, new RegExp(expected.pattern), "output charset");
  assert.ok(
    actual.output.length >= expected.length.min && actual.output.length <= expected.length.max,
    `length ${actual.output.length} outside ${expected.length.min}..${expected.length.max}`,
  );
}

for (const entry of readdirSync(TOOLS_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const folder = path.join(TOOLS_DIR, entry.name);
  const fixtureFile = path.join(folder, "fixtures.json");
  if (!existsSync(fixtureFile)) continue;
  const { cases } = JSON.parse(readFileSync(fixtureFile, "utf8"));
  const runFile = RUN_FILES.map((name) => path.join(folder, name)).find(existsSync);

  test(`${entry.name} matches captured fixtures`, async (t) => {
    if (!runFile) {
      t.skip(
        `tools/${entry.name}/ has fixtures but no run file yet (expected one of: ${RUN_FILES.join(", ")})`,
      );
      return;
    }
    let module;
    try {
      module = await import(pathToFileURL(runFile).href);
    } catch (error) {
      // A half-migrated tool whose shared framework module does not exist yet
      // is "not migrated", not "broken". Every other import failure is real.
      if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
      t.skip(
        `${path.basename(runFile)} imports a module that does not exist yet: ${error.url ?? error.message}`,
      );
      return;
    }
    assert.equal(typeof module.run, "function", `tools/${entry.name} must export run()`);

    for (const testCase of cases) {
      await t.test(testCase.name, async () => {
        const context = {
          input: { secondary: testCase.input.secondary, text: testCase.input.primary },
          settings: testCase.settings,
          signal: new AbortController().signal,
        };
        if (testCase.expected.error) {
          await assert.rejects(
            async () => module.run(context),
            (error) => error.message === testCase.expected.error,
          );
          return;
        }
        assertCase(testCase.expected, normalize(await module.run(context)));
      });
    }
  });
}
