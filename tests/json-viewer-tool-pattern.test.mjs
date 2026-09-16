import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";

// The four source-text tests that used to live here were deleted, not moved:
// they read `tools/json-viewer/*` and asserted component names, Tailwind
// classes, import statements, and a `definitionKey:` literal. Root AGENTS.md
// forbids that style, and the `definitionKey` assertion directly contradicted
// `tests/tool-registry.test.mjs`, which requires that a definition never
// declares it — the folder name is the key. Those boundaries are now enforced
// by `tests/tool-registry.test.mjs` and `tsc --noEmit`.
//
// What remains is the one genuine behavioural test: it imports and executes
// the pure JSON Viewer contract.

const root = new URL("../", import.meta.url);

async function exists(path) {
  try {
    await access(new URL(path, root));
    return true;
  } catch {
    return false;
  }
}

test("JSON Viewer execution parses, formats, minifies, and repairs without UI state", async () => {
  assert.equal(
    await exists("tools/json-viewer/execution.ts"),
    true,
    "JSON Viewer execution must exist before its pure contract can be loaded",
  );

  const {
    describeJsonViewerRepair,
    executeJsonViewer,
    formatJsonViewerInput,
    minifyJsonViewerInput,
    repairJsonViewerInput,
  } = await import("../tools/json-viewer/execution.ts");

  const parsed = executeJsonViewer('{"name":"SmartTools","nested":{"enabled":true}}');
  assert.deepEqual(parsed, {
    ok: true,
    formattedValue: '{\n  "name": "SmartTools",\n  "nested": {\n    "enabled": true\n  }\n}',
    value: { name: "SmartTools", nested: { enabled: true } },
  });

  const invalid = executeJsonViewer('{"name":}');
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.kind, "syntax");
  assert.match(invalid.error.message, /isn't valid/i);

  assert.equal(formatJsonViewerInput('{"ready":true}').output, '{\n  "ready": true\n}');
  assert.equal(minifyJsonViewerInput('{\n  "ready": true\n}').output, '{"ready":true}');
  assert.deepEqual(repairJsonViewerInput('{"ready":,"kept":true}', "remove"), {
    ok: true,
    output: '{\n  "kept": true\n}',
    repaired: true,
    value: { kept: true },
  });
  assert.deepEqual(repairJsonViewerInput('{"ready":,"kept":true}', "null"), {
    ok: true,
    output: '{\n  "ready": null,\n  "kept": true\n}',
    repaired: true,
    value: { ready: null, kept: true },
  });
  assert.deepEqual(
    describeJsonViewerRepair('[{"id":1,"name":"Alice","age":},{"id":2,"name":"Bob","age":30}]', "remove"),
    {
      changedPaths: ["$[0].age"],
      kind: "remove",
      ok: true,
      output:
        '[\n  {\n    "id": 1,\n    "name": "Alice"\n  },\n  {\n    "id": 2,\n    "name": "Bob",\n    "age": 30\n  }\n]',
    },
  );
  assert.deepEqual(describeJsonViewerRepair('{"ready":,"kept":true}', "null"), {
    changedPaths: ["$.ready"],
    kind: "null",
    ok: true,
    output: '{\n  "ready": null,\n  "kept": true\n}',
  });
});
