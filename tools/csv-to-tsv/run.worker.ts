/**
 * Moved verbatim from the `csv-to-tsv` case in `lib/devtools/format-json.ts`.
 * Parsing and serialization are the shared table helpers, unchanged.
 */

import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { parseUtilityTable, serializeTable } from "../../lib/devtools/shared/table.ts";
import { isLargeCsvRun, streamCsvRows } from "../../lib/devtools/shared/streaming-csv-tool.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

export const run: ToolRun<Settings> = async (ctx): Promise<ToolResult> =>
  isLargeCsvRun(ctx)
    ? streamCsvRows(ctx, {
        inputDelimiter: ",",
        mime: "text/tab-separated-values",
        name: "table.tsv",
        outputDelimiter: "\t",
      })
    : {
        render: "text",
        text: serializeTable(parseUtilityTable(ctx.input.text, ","), "\t"),
        downloadName: "table.tsv",
      };

export default run;
