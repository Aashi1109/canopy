/**
 * Moved verbatim from the `color-picker` case in
 * `lib/devtools/format-json.ts` (arm at line 2725). `parseHexColor`,
 * `rgbToHex`, and `rgbToHsl` are shared (`lib/devtools/shared/color.ts`).
 */

import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { parseHexColor, rgbToHex, rgbToHsl } from "../../lib/devtools/shared/color.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const color = parseHexColor(ctx.input.text);
  const alpha = Number(color.alpha.toFixed(3));
  const outputFormat = ctx.settings.outputFormat ?? "all";
  const rgb =
    (ctx.settings.legacyRgbCommas ?? true)
      ? color.alpha < 1
        ? `rgba(${color.red}, ${color.green}, ${color.blue}, ${alpha})`
        : `rgb(${color.red}, ${color.green}, ${color.blue})`
      : color.alpha < 1
        ? `rgb(${color.red} ${color.green} ${color.blue} / ${alpha})`
        : `rgb(${color.red} ${color.green} ${color.blue})`;
  const entries = [
    {
      label: "HEX",
      value:
        (ctx.settings.normalizeShorthand ?? true)
          ? rgbToHex(color)
          : `#${ctx.input.text.trim().replace(/^#/, "").toUpperCase()}`,
    },
    { label: "RGB", value: rgb },
    ...((ctx.settings.includeHsl ?? true) || outputFormat === "hsl" ? [{ label: "HSL", value: rgbToHsl(color) }] : []),
  ];
  return {
    render: "key-value",
    entries: outputFormat === "all" ? entries : entries.filter(({ label }) => label.toLowerCase() === outputFormat),
  };
};

export default run;
