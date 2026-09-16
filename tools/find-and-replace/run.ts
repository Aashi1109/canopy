/**
 * Moved verbatim from the `find-and-replace` case in
 * `lib/devtools/format-json.ts`: the same three branches (regex, literal
 * case-insensitive via an escaped pattern, and literal `replaceAll`), the same
 * `giu`/`gu` flags, and the same escape set.
 */

import { ToolError, type ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const find = ctx.settings.find;
  if (!find) {
    throw new ToolError("find-required", "Find text is required.", "Enter the text or pattern you want to replace.");
  }
  const replacement = ctx.settings.replace;
  const text = ctx.input.text;

  if (ctx.settings.regex) {
    try {
      return {
        render: "text",
        text: text.replace(new RegExp(find, ctx.settings.ci ? "giu" : "gu"), replacement),
        downloadName: "replaced-text.txt",
      };
    } catch {
      throw new ToolError(
        "pattern-invalid",
        "Find pattern is not a valid regular expression.",
        "Patterns compile in Unicode mode; remove any redundant backslash escapes.",
      );
    }
  }

  return {
    render: "text",
    text: ctx.settings.ci
      ? text.replace(new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu"), replacement)
      : text.replaceAll(find, replacement),
    downloadName: "replaced-text.txt",
  };
};

export default run;
