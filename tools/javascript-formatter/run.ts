/**
 * Moved verbatim from the `javascript-formatter` case in
 * `lib/devtools/format-json.ts` (arm at line 2696). The formatter itself is
 * shared with `css-formatter` and lives in `lib/devtools/shared/code.ts`.
 */

import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { formatDelimitedCode } from "../../lib/devtools/shared/code.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

function reindent(formatted: string, indent: string): string {
  let quote = "";
  let escaped = false;
  return formatted
    .split("\n")
    .map((line) => {
      const reindented = quote ? line : line.replace(/^(?: {2})+/, (spaces) => indent.repeat(spaces.length / 2));
      for (const character of line) {
        if (quote) {
          if (escaped) escaped = false;
          else if (character === "\\") escaped = true;
          else if (character === quote) quote = "";
        } else if (character === '"' || character === "'" || character === "`") {
          quote = character;
        }
      }
      return reindented;
    })
    .join("\n");
}

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const formatted = formatDelimitedCode(ctx.input.text, "javascript");
  const indent = ctx.settings.indentWidth === "4" ? "    " : "\t";
  const text =
    ctx.settings.indentWidth === "4" || ctx.settings.indentWidth === "tab" ? reindent(formatted, indent) : formatted;
  return { render: "text", text, downloadName: "formatted.js" };
};

export default run;
