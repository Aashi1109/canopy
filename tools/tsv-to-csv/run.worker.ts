import { parseUtilityTable, serializeTable } from "../../lib/devtools/shared/table.ts";
import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { isLargeCsvRun, streamCsvRows } from "../../lib/devtools/shared/streaming-csv-tool.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

export const run: ToolRun<Settings> = async (ctx): Promise<ToolResult> =>
  isLargeCsvRun(ctx)
    ? streamCsvRows(ctx, {
        inputDelimiter: "\t",
        mime: "text/csv",
        name: "table.csv",
        outputDelimiter: ",",
      })
    : {
        render: "text",
        text: serializeTable(parseUtilityTable(ctx.input.text, "\t"), ","),
        downloadName: "table.csv",
      };

export default run;
