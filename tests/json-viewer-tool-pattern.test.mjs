import { expect, test } from "vitest";
import { access } from "node:fs/promises";

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
  expect(
    await exists("tools/json-viewer/execution.ts"),
    "JSON Viewer execution must exist before its pure contract can be loaded",
  ).toBe(true);

  const {
    describeJsonViewerRepair,
    executeJsonViewer,
    formatJsonViewerInput,
    minifyJsonViewerInput,
    repairJsonViewerInput,
  } = await import("../tools/json-viewer/execution.ts");

  const parsed = executeJsonViewer('{"name":"SmartTools","nested":{"enabled":true}}');
  expect(parsed).toEqual({
    ok: true,
    formattedValue: '{\n  "name": "SmartTools",\n  "nested": {\n    "enabled": true\n  }\n}',
    value: { name: "SmartTools", nested: { enabled: true } },
  });

  const invalid = executeJsonViewer('{"name":}');
  expect(invalid.ok).toBe(false);
  expect(invalid.error.kind).toBe("syntax");
  expect(invalid.error.message).toMatch(/isn't valid/i);

  expect(formatJsonViewerInput('{"ready":true}').output).toBe('{\n  "ready": true\n}');
  expect(minifyJsonViewerInput('{\n  "ready": true\n}').output).toBe('{"ready":true}');
  expect(repairJsonViewerInput('{"ready":,"kept":true}', "remove")).toEqual({
    ok: true,
    output: '{\n  "kept": true\n}',
    repaired: true,
    value: { kept: true },
  });
  expect(repairJsonViewerInput('{"ready":,"kept":true}', "null")).toEqual({
    ok: true,
    output: '{\n  "ready": null,\n  "kept": true\n}',
    repaired: true,
    value: { ready: null, kept: true },
  });
  expect(describeJsonViewerRepair('[{"id":1,"name":"Alice","age":},{"id":2,"name":"Bob","age":30}]', "remove")).toEqual(
    {
      changedPaths: ["$[0].age"],
      kind: "remove",
      ok: true,
      output:
        '[\n  {\n    "id": 1,\n    "name": "Alice"\n  },\n  {\n    "id": 2,\n    "name": "Bob",\n    "age": 30\n  }\n]',
    },
  );
  expect(describeJsonViewerRepair('{"ready":,"kept":true}', "null")).toEqual({
    changedPaths: ["$.ready"],
    kind: "null",
    ok: true,
    output: '{\n  "ready": null,\n  "kept": true\n}',
  });
});
