import { afterAll, beforeAll, expect, test, vi } from "vitest";
// Behaviour lock for migrated tools. Discovery is filesystem-driven: drop a
// `fixtures.json` next to a tool's run file and it gains coverage here with no
// edit to this file. Fixtures were captured from the pre-migration devtools
// runtime (lib/devtools/format-json.ts), which has since been deleted — they
// are now the record of that behaviour, not a regeneratable artefact.
process.env.TZ = "UTC";

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TOOLS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "tools");

// domain-age-checker performs a live RDAP lookup. Stub only rdap.org so the
// fixture runs deterministically offline; every other request passes through.
const realFetch = globalThis.fetch;
beforeAll(() => {
  vi.stubGlobal("fetch", async (url, init) => {
    const href = typeof url === "string" ? url : (url?.url ?? String(url));
    if (href.includes("rdap.org/domain/")) {
      return new Response(JSON.stringify({ ldhName: "example.com", events: [], status: [], nameservers: [] }), {
        status: 200,
        headers: { "content-type": "application/rdap+json" },
      });
    }
    return realFetch(url, init);
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

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
  const output = result.text ?? result.code ?? result.src ?? result.html ?? result.output;
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
    expect(actual.render, "render kind").toBe(expected.render);
    expect(Array.isArray(actual.items), "items").toBeTruthy();
    if (expected.itemCount !== undefined) {
      expect(actual.items.length, "item count").toBe(expected.itemCount);
    }
    if (expected.itemPattern) {
      const pattern = new RegExp(expected.itemPattern);
      for (const [index, item] of actual.items.entries()) {
        expect(item, `item ${index + 1} pattern`).toMatch(pattern);
      }
    }
    if ("labels" in expected) expect(actual.labels, "labels").toEqual(expected.labels);
    if ("downloadName" in expected) {
      expect(actual.downloadName, "download name").toBe(expected.downloadName);
    }
    return;
  }
  if (!expected.pattern) return expect(actual).toEqual(expected);
  expect(actual.render, "render kind").toBe(expected.render);
  expect(actual.output, "output charset").toMatch(new RegExp(expected.pattern));
  expect(
    actual.output.length >= expected.length.min && actual.output.length <= expected.length.max,
    `length ${actual.output.length} outside ${expected.length.min}..${expected.length.max}`,
  ).toBeTruthy();
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
      t.skip(`tools/${entry.name}/ has fixtures but no run file yet (expected one of: ${RUN_FILES.join(", ")})`);
      return;
    }
    let module;
    try {
      module = await import(pathToFileURL(runFile).href);
    } catch (error) {
      // A half-migrated tool whose shared framework module does not exist yet
      // is "not migrated", not "broken". Every other import failure is real.
      if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
      t.skip(`${path.basename(runFile)} imports a module that does not exist yet: ${error.url ?? error.message}`);
      return;
    }
    expect(typeof module.run, `tools/${entry.name} must export run()`).toBe("function");

    for (const testCase of cases) {
      await (async () => {
        const context = {
          input: { secondary: testCase.input.secondary, text: testCase.input.primary },
          settings: testCase.settings,
          signal: new AbortController().signal,
        };
        if (testCase.expected.error) {
          await (async () => {
            let __err;
            try {
              await (async () => module.run(context))();
            } catch (__e) {
              __err = __e;
            }
            expect(__err).toBeDefined();
            expect(((error) => error.message === testCase.expected.error)(__err)).toBe(true);
          })();
          return;
        }
        assertCase(testCase.expected, normalize(await module.run(context)));
      })();
    }
  });
}
