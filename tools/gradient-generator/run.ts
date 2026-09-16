/**
 * Moved verbatim from the `gradient-generator` case in
 * `lib/devtools/format-json.ts`. Both colours are still parsed purely to
 * validate them, and the raw trimmed input — not the reformatted colour — is
 * what lands in the declaration, exactly as before.
 */

import { parseHexColor } from "../../lib/devtools/shared/color.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const start = ctx.input.text;
  const end = ctx.input.secondary ?? "";
  parseHexColor(start);
  parseHexColor(end);
  const gradient =
    ctx.settings.type === "radial"
      ? `background: radial-gradient(circle, ${start.trim()}, ${end.trim()});`
      : `background: linear-gradient(${ctx.settings.angle}deg, ${start.trim()}, ${end.trim()});`;

  return {
    render: "text",
    text: ctx.settings.includeFallback ? `background: ${start.trim()};\n${gradient}` : gradient,
    downloadName: "gradient.css",
  };
};

export default run;
