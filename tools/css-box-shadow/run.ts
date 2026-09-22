import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { shadowValue } from "./model.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const declaration = `box-shadow: ${shadowValue(ctx.input.text, ctx.settings)};`;
  return {
    render: "text",
    text: ctx.settings.showBrowserPrefixes ? `-webkit-${declaration}\n${declaration}` : declaration,
    downloadName: "box-shadow.css",
  };
};
export default run;
