/**
 * Moved verbatim from the `html-encoder` case in
 * `lib/devtools/format-json.ts`. The escape set is the shared `escapeHtml` and
 * is deliberately not widened or narrowed here — it is the same function the
 * rest of the devtools escape with.
 */

import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { escapeHtml } from "../../lib/devtools/shared/text.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

export const run: ToolRun<Settings> = (ctx): ToolResult => ({
  render: "text",
  text: escapeHtml(ctx.input.text),
  language: "html",
  downloadName: "encoded-html.txt",
});

export default run;
