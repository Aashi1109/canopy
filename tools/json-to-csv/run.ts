import { convertJsonToCsv } from "../../lib/devtools/shared/csv.ts";
import { utilityDelimiter } from "../../lib/devtools/shared/table.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import { ToolError, type ToolRun } from "../../lib/tool-framework/run.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const repairMode = ctx.settings.repairMode === "null" ? "null" : ctx.settings.repairMode === "off" ? "off" : "remove";
  const result = convertJsonToCsv(ctx.input.text, {
    delimiter: utilityDelimiter(ctx.settings.delimiter),
    repairMode,
  });
  if (!result.ok) {
    throw new ToolError(
      result.error.kind,
      result.error.message,
      "Check the JSON shape, syntax, and selected options, then try again.",
    );
  }

  return {
    render: "text",
    text: result.output,
    downloadName: "data.csv",
    stats: [
      { label: "Rows", value: String(result.rowCount) },
      { label: "Columns", value: String(result.columns.length) },
      ...(result.repaired ? [{ label: "Repaired", value: "Yes" }] : []),
    ],
  };
};

export default run;
