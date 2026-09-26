import { describe, expect, test } from "vitest";
import { run as diff } from "./run.ts";
import { context, execute, content } from "../../tests/helpers/json-tools.mjs";

test("reports a change after repairing both inputs with null", async () => {
  const result = await execute(diff, '{"value":}', { repairMode: "null" }, '{"value":false}');
  expect(result.lines.filter((line) => line.kind !== "context")).toEqual([
    { kind: "removed", text: '  "value": null' },
    { kind: "added", text: '  "value": false' },
  ]);
  expect(result.downloadName).toBe("json-diff.txt");
});
