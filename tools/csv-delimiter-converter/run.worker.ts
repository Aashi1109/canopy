/**
 * Moved verbatim from the `csv-delimiter-converter` case in
 * `lib/devtools/format-json.ts` (line 2269). Parse, validate, re-serialise —
 * all three are the shared `table.ts` helpers, and the legacy error message for
 * identical delimiters is preserved.
 */

import { ToolError, type ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { parseUtilityTable, serializeTable, utilityDelimiter } from "../../lib/devtools/shared/table.ts";
import { isLargeCsvRun, streamCsvRows } from "../../lib/devtools/shared/streaming-csv-tool.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

export const run: ToolRun<Settings> = async (ctx): Promise<ToolResult> => {
  const from = utilityDelimiter(ctx.settings.from);
  const to = utilityDelimiter(ctx.settings.to);
  if (from === to) {
    throw new ToolError(
      "same-delimiter",
      "Choose different source and target delimiters.",
      "Pick a target delimiter that differs from the source, or use the CSV Formatter to normalise quoting in place.",
    );
  }
  if (isLargeCsvRun(ctx)) {
    return streamCsvRows(ctx, {
      inputDelimiter: from,
      outputDelimiter: to,
      mime: "text/plain",
      name: "converted-data.txt",
    });
  }
  return {
    render: "text",
    text: serializeTable(parseUtilityTable(ctx.input.text, from), to),
    downloadName: "converted-data.txt",
  };
};

export default run;
