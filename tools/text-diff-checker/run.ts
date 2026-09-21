import { diffLines } from "../../lib/devtools/shared/line-diff.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

const LINE_MARKERS = { context: "  ", removed: "- ", added: "+ " } as const;

export const run: ToolRun<Settings> = (ctx): ToolResult => ({
  render: "text",
  text: diffLines(ctx.input.text, ctx.input.secondary ?? "")
    .map(({ kind, text }) => `${LINE_MARKERS[kind]}${text}`)
    .join("\n"),
  downloadName: "text-diff.txt",
});

export default run;
