import { jsonType, parseStrictJson } from "../../lib/devtools/shared/json-input.ts";
import { isLargeJsonRun, validateStreamingJsonRun } from "../../lib/devtools/shared/streaming-json-tool.ts";
import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

export const run: ToolRun<Settings> = async (ctx): Promise<ToolResult> => {
  if (isLargeJsonRun(ctx)) return validateStreamingJsonRun(ctx);
  await validateStreamingJsonRun(ctx);
  const value = parseStrictJson(ctx.input.text, "JSON input");
  return { render: "text", text: `Valid JSON\nRoot type: ${jsonType(value)}` };
};

export default run;
