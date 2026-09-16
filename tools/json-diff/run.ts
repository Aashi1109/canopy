/**
 * Moved verbatim from the `json-diff` case in `lib/devtools/format-json.ts`
 * (arm at line 2137) together with its single-consumer helper `diffJson`
 * (format-json.ts:3244-3268).
 */

import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { parseUtilityJson } from "../../lib/devtools/shared/json-input.ts";
import { isRecord } from "../../lib/devtools/shared/json.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

function diffJson(left: unknown, right: unknown, path = "$"): string[] {
  if (Object.is(left, right)) return [];
  if (Array.isArray(left) && Array.isArray(right)) {
    return Array.from({ length: Math.max(left.length, right.length) }, (_, index) => index).flatMap((index) =>
      index >= left.length
        ? [`+ ${path}[${index}]: ${JSON.stringify(right[index])}`]
        : index >= right.length
          ? [`- ${path}[${index}]: ${JSON.stringify(left[index])}`]
          : diffJson(left[index], right[index], `${path}[${index}]`),
    );
  }
  if (isRecord(left) && isRecord(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].flatMap((key) =>
      !(key in left)
        ? [`+ ${path}.${key}: ${JSON.stringify(right[key])}`]
        : !(key in right)
          ? [`- ${path}.${key}: ${JSON.stringify(left[key])}`]
          : diffJson(left[key], right[key], `${path}.${key}`),
    );
  }
  return [`~ ${path}: ${JSON.stringify(left)} → ${JSON.stringify(right)}`];
}

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const options = { repairMode: ctx.settings.repairMode };
  const differences = diffJson(
    parseUtilityJson(ctx.input.text, options, "JSON A"),
    parseUtilityJson(ctx.input.secondary ?? "", options, "JSON B"),
  );
  return {
    render: "text",
    text: differences.length ? differences.join("\n") : "No differences.",
    downloadName: "json-diff.txt",
  };
};

export default run;
