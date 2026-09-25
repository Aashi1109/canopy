/**
 * Adapted from the `url-query-parser` case in
 * `lib/devtools/format-json.ts` (arm at line 2655). `requireUtilityInput` is
 * shared (`lib/devtools/shared/options.ts`); the legacy error message
 * "URL or query string is invalid." is preserved exactly.
 */

import { ToolError, type ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { requireUtilityInput } from "../../lib/devtools/shared/options.ts";
import { createTablePreview } from "../../lib/devtools/shared/table-preview.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const input = requireUtilityInput(ctx.input.text, "URL or query string").trim();
  const isUrl = !input.startsWith("?") && (input.includes("?") || /^[a-z][a-z\d+.-]*:/i.test(input));
  let entries: [string, string][];
  try {
    const query = isUrl ? new URL(input).search.slice(1) : input.replace(/^\?/, "").split("#", 1)[0];
    if (ctx.settings.decodeValues !== false) {
      entries = [...new URLSearchParams(query)];
    } else {
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
  const value: Record<string, ParsedValue | ParsedValue[]> = Object.create(null);
  const preview = createTablePreview(["Parameter", "Value"]);
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
    value[key] = current === undefined ? item : Array.isArray(current) ? [...current, item] : [current, item];
    preview.append([key, String(item)]);
  }
  return {
    render: "text",
    text: JSON.stringify(value, null, 2),
    tablePreview: preview.result,
    verdict:
      Object.keys(value).length === 0
        ? {
            level: "ok",
            label: "No query parameters to display",
            detail: entries.length
              ? "All parameter values are blank. Turn on Keep empty values to include them."
              : "This input has no query parameters. Raw contains an empty JSON object.",
          }
        : undefined,
  };
};

export default run;
