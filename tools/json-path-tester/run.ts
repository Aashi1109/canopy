/**
 * Moved verbatim from the `json-path-tester` case in
 * `lib/devtools/format-json.ts` (arm at line 2152) together with its
 * single-consumer helper `resolveJsonPath` (format-json.ts:3289-3313). The
 * legacy error strings are preserved exactly, including the trailing period
 * placement in "JSONPath must start with $.".
 */

import { ToolError, type ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { parseUtilityJson } from "../../lib/devtools/shared/json-input.ts";
import { isRecord } from "../../lib/devtools/shared/json.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

function resolveJsonPath(value: unknown, path: string): unknown {
  if (!path.startsWith("$")) {
    throw new ToolError(
      "path-root-required",
      "JSONPath must start with $.",
      "Begin the expression with $ — the document root.",
    );
  }
  const tokens =
    path
      .slice(1)
      .replace(/\[['"]([^'"]+)['"]\]/g, ".$1")
      .match(/(?:\.([\w$-]+)|\[(\d+|\*)\])/g) ?? [];
  if (
    `$${tokens.join("")}`.replace(/\[['"]([^'"]+)['"]\]/g, ".$1") !==
    path.replace(/\[['"]([^'"]+)['"]\]/g, ".$1")
  ) {
    throw new ToolError(
      "path-unsupported",
      "JSONPath contains unsupported syntax.",
      "Use .key, [0], ['key'], and * only — filters and recursive descent are not supported.",
    );
  }

  let current: unknown[] = [value];
  for (const token of tokens) {
    const property = token.startsWith(".") ? token.slice(1) : token.slice(1, -1);
    current = current.flatMap((item) => {
      if (property === "*") {
        return Array.isArray(item) ? item : isRecord(item) ? Object.values(item) : [];
      }
      if (Array.isArray(item) && /^\d+$/.test(property)) return [item[Number(property)]];
      if (isRecord(item) && property in item) return [item[property]];
      return [];
    });
  }
  if (!current.length) {
    throw new ToolError(
      "path-no-match",
      "JSONPath did not match any value.",
      "Check each segment against the document — one of them selects nothing.",
    );
  }
  return current.length === 1 ? current[0] : current;
}

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const value = parseUtilityJson(ctx.input.text, {
    repairMode: ctx.settings.repairMode,
  });
  return {
    render: "text",
    text: JSON.stringify(resolveJsonPath(value, ctx.settings.path), null, 2),
  };
};

export default run;
