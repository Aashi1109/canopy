import { diffLines } from "../../lib/devtools/shared/line-diff.ts";
import { parseUtilityJson } from "../../lib/devtools/shared/json-input.ts";
import { isRecord } from "../../lib/devtools/shared/json.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import { ToolError, type ToolRun } from "../../lib/tool-framework/run.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

function formatJson(value: unknown, indent = ""): string {
  // Bound recursion and indentation before the quadratic line-alignment check.
  if (indent.length > 256) {
    throw new ToolError(
      "comparison-too-deep",
      "This JSON is nested too deeply to compare safely.",
      "Compare smaller nested sections.",
    );
  }
  const nextIndent = `${indent}  `;
  if (Array.isArray(value)) {
    return value.length
      ? `[\n${value.map((item) => `${nextIndent}${formatJson(item, nextIndent)}`).join(",\n")}\n${indent}]`
      : "[]";
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    return keys.length
      ? `{\n${keys.map((key) => `${nextIndent}${JSON.stringify(key)}: ${formatJson(value[key], nextIndent)}`).join(",\n")}\n${indent}}`
      : "{}";
  }
  // JSON.parse preserves negative zero and can overflow a valid exponent.
  if (Object.is(value, -0)) return "-0";
  if (value === Infinity) return "1e400";
  if (value === -Infinity) return "-1e400";
  return JSON.stringify(value) ?? "null";
}

function parseSide(input: string, settings: Settings, label: string): string {
  try {
    return formatJson(parseUtilityJson(input, { repairMode: settings.repairMode }, label));
  } catch (error) {
    if (error instanceof ToolError && !error.message.startsWith(label)) {
      throw new ToolError(error.code, `${label}: ${error.message}`, error.recovery);
    }
    throw error;
  }
}

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const lines = diffLines(
    parseSide(ctx.input.text, ctx.settings, "JSON A"),
    parseSide(ctx.input.secondary ?? "", ctx.settings, "JSON B"),
  );
  const added = lines.filter(({ kind }) => kind === "added").length;
  const removed = lines.filter(({ kind }) => kind === "removed").length;
  return {
    render: "diff",
    lines,
    leftLabel: "JSON A · Original",
    rightLabel: "JSON B · Changed",
    downloadName: "json-diff.txt",
    verdict: {
      level: "ok",
      label:
        added || removed
          ? `${added} ${added === 1 ? "line" : "lines"} added · ${removed} ${removed === 1 ? "line" : "lines"} removed`
          : "No differences",
      detail: "Comparing JSON B against JSON A. Formatting and object key order are ignored.",
    },
  };
};

export default run;
