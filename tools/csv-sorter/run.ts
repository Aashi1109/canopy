/**
 * Moved verbatim from the `csv-sorter` case in `lib/devtools/format-json.ts`,
 * including the `localeCompare` options that give the natural, case- and
 * accent-insensitive ordering.
 *
 * `parseUtilityTable` returns a fresh array, so the in-place `sort` never
 * touches the caller's input.
 */

import { ToolError, type ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { parseUtilityTable, serializeTable, utilityDelimiter } from "../../lib/devtools/shared/table.ts";
import { createTablePreview } from "../../lib/devtools/shared/table-preview.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const delimiter = utilityDelimiter(ctx.settings.delimiter);
  const [header, ...rows] = parseUtilityTable(ctx.input.text, delimiter);
  const requested = ctx.settings.column.trim();
  const column = /^\d+$/.test(requested) ? Number(requested) - 1 : header.indexOf(requested);
  if (column < 0 || column >= header.length) {
    throw new ToolError(
      "column-not-found",
      "Sort column was not found.",
      "Use the exact header text, or the one-based column number.",
    );
  }
  const direction = ctx.settings.order === "desc" ? -1 : 1;
  rows.sort(
    (left, right) =>
      left[column].localeCompare(right[column], undefined, {
        numeric: true,
        sensitivity: "base",
      }) * direction,
  );
  return {
    render: "text",
    text: serializeTable([header, ...rows], delimiter),
    tablePreview: createTablePreview(header, rows).result,
    downloadName: "sorted-data.txt",
  };
};

export default run;
