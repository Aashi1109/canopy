/**
 * Moved verbatim from the `url-query-parser` case in
 * `lib/devtools/format-json.ts` (arm at line 2655). `requireUtilityInput` is
 * shared (`lib/devtools/shared/options.ts`); the legacy error message
 * "URL or query string is invalid." is preserved exactly.
 */

import { ToolError, type ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { requireUtilityInput } from "../../lib/devtools/shared/options.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const input = requireUtilityInput(ctx.input.text, "URL or query string").trim();
  let entries: [string, string][];
  try {
    if (ctx.settings.decodeValues !== false) {
      const parameters =
        input.includes("?") || /^[a-z][a-z\d+.-]*:/i.test(input)
          ? new URL(input).searchParams
          : new URLSearchParams(input.replace(/^\?/, ""));
      entries = [...parameters];
    } else {
      const query =
        input.includes("?") || /^[a-z][a-z\d+.-]*:/i.test(input)
          ? new URL(input).search.slice(1)
          : input.replace(/^\?/, "");
      entries = query
        ? query.split("&").map((part) => {
            const separator = part.indexOf("=");
            const rawKey = separator < 0 ? part : part.slice(0, separator);
            const key = new URLSearchParams(`${rawKey}=`).keys().next().value ?? "";
            return [key, separator < 0 ? "" : part.slice(separator + 1)];
          })
        : [];
    }
  } catch {
    throw new ToolError(
      "query-invalid",
      "URL or query string is invalid.",
      "Paste a complete URL, or just the part after the ? on its own.",
    );
  }
  type ParsedValue = string | number;
  const value: Record<string, ParsedValue | ParsedValue[]> = {};
  for (const [key, rawItem] of entries) {
    if (!ctx.settings.keepEmptyValues && rawItem === "") continue;
    const numericItem = Number(rawItem);
    const item =
      ctx.settings.coerceNumbers &&
      /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(rawItem) &&
      Number.isFinite(numericItem)
        ? numericItem
        : rawItem;
    const current = value[key];
    value[key] =
      current === undefined ? item : Array.isArray(current) ? [...current, item] : [current, item];
  }
  return { render: "text", text: JSON.stringify(value, null, 2) };
};

export default run;
