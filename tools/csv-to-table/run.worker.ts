/**
 * Moved verbatim from the shared `csv-viewer` / `csv-to-table` case body in
 * `lib/devtools/format-json.ts` (arm at lines 2198-2202).
 *
 * See the note in `tools/csv-viewer/run.ts`: the two tools shared one
 * fall-through `case`, and each folder now owns its own copy of the two-line
 * body rather than importing across tool folders. The implementation itself
 * lives in `lib/devtools/shared/table.ts` and is imported, not copied.
 */

import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { parseUtilityTable, tableToHtml, utilityDelimiter } from "../../lib/devtools/shared/table.ts";
import { escapeHtml } from "../../lib/devtools/shared/text.ts";
import { createTextArtifactSink, isLargeCsvRun, parseCsvRun } from "../../lib/devtools/shared/streaming-csv-tool.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

export const run: ToolRun<Settings> = async (ctx): Promise<ToolResult> => {
  const delimiter = utilityDelimiter(ctx.settings.delimiter);
  if (isLargeCsvRun(ctx)) {
    const sink = createTextArtifactSink(ctx, {
      mime: "text/html",
      name: "table.html",
    });
    try {
      await sink.write("<table><thead>");
      const parsed = await parseCsvRun(ctx, {
        delimiter,
        onRow: async (row, rowNumber) => {
          const tag = rowNumber === 1 ? "th" : "td";
          const cells = row.map((cell) => `<${tag}>${escapeHtml(cell)}</${tag}>`).join("");
          if (rowNumber === 1) {
            await sink.write(`<tr>${cells}</tr></thead><tbody>`);
          } else {
            await sink.write(`<tr>${cells}</tr>`);
          }
        },
        previewRows: 0,
      });
      if (parsed.rowCount === 0) throw new Error("Delimited input has no rows.");
      await sink.write("</tbody></table>");
      const artifact = await sink.finish();
      return {
        render: "code",
        code: sink.preview,
        language: "html",
        truncated: sink.previewTruncated,
        stats: [
          { label: "Rows", value: String(Math.max(0, parsed.rowCount - 1)) },
          { label: "Columns", value: String(parsed.columnCount) },
        ],
        sections: [
          {
            title: sink.previewTruncated ? "Complete HTML table" : "Download",
            body: { render: "files", files: [artifact], outputBytes: artifact.size },
          },
        ],
      };
    } catch (error) {
      await sink.abort(error);
      throw error;
    }
  }
  return {
    render: "html",
    html: tableToHtml(parseUtilityTable(ctx.input.text, delimiter)),
    downloadName: "table.html",
  };
};

export default run;
