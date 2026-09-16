/**
 * Moved verbatim from the `csv-column-extractor` case in
 * `lib/devtools/format-json.ts`. Cell re-quoting is the shared `csvCell`, so
 * a value containing the delimiter stays unambiguous.
 */

import { ToolError, type ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { csvCell } from "../../lib/devtools/shared/csv.ts";
import { parseUtilityTable, utilityDelimiter } from "../../lib/devtools/shared/table.ts";
import {
  createTextArtifactSink,
  isLargeCsvRun,
  parseCsvRun,
} from "../../lib/devtools/shared/streaming-csv-tool.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

export const run: ToolRun<Settings> = async (ctx): Promise<ToolResult> => {
  const delimiter = utilityDelimiter(ctx.settings.delimiter);
  if (isLargeCsvRun(ctx)) {
    const requested = ctx.settings.column.trim();
    const sink = createTextArtifactSink(ctx, {
      mime: "text/plain",
      name: "extracted-column.txt",
    });
    const preview: string[] = [];
    let column = -1;
    try {
      const parsed = await parseCsvRun(ctx, {
        delimiter,
        onRow: async (row, rowNumber) => {
          if (rowNumber === 1) {
            column = /^\d+$/.test(requested) ? Number(requested) - 1 : row.indexOf(requested);
            if (column < 0 || column >= row.length) {
              throw new ToolError(
                "column-not-found",
                "Column was not found.",
                "Use the exact header text, or the one-based column number.",
              );
            }
          }
          const value = csvCell(row[column] ?? "", delimiter);
          if (preview.length < 1_000) preview.push(value);
          await sink.write(`${rowNumber === 1 ? "" : "\n"}${value}`);
        },
        previewRows: 0,
      });
      const artifact = await sink.finish();
      return {
        render: "list",
        items: preview,
        truncated: parsed.rowCount > preview.length,
        stats: [{ label: "Rows", value: String(parsed.rowCount) }],
        sections: [
          {
            title: parsed.rowCount > preview.length ? "Complete extracted column" : "Download",
            body: { render: "files", files: [artifact], outputBytes: artifact.size },
          },
        ],
      };
    } catch (error) {
      await sink.abort(error);
      throw error;
    }
  }
  const rows = parseUtilityTable(ctx.input.text, delimiter);
  const requested = ctx.settings.column.trim();
  const column = /^\d+$/.test(requested) ? Number(requested) - 1 : rows[0].indexOf(requested);
  if (column < 0 || column >= rows[0].length) {
    throw new ToolError(
      "column-not-found",
      "Column was not found.",
      "Use the exact header text, or the one-based column number.",
    );
  }
  return {
    render: "list",
    items: rows.map((row) => csvCell(row[column], delimiter)),
  };
};

export default run;
