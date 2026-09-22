/** Standalone sRGB color values, formatted according to the existing output options. */

import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { parseColor, rgbToHex, rgbToHsl } from "../../lib/devtools/shared/color.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const color = parseColor(ctx.input.text);
  const channels = [color.red, color.green, color.blue].map((value) => Number(value.toFixed(3)));
  const alpha = Number(color.alpha.toFixed(3));
  const outputFormat = ctx.settings.outputFormat ?? "all";
  const rgb =
    (ctx.settings.legacyRgbCommas ?? true)
      ? color.alpha < 1
        ? `rgba(${channels.join(", ")}, ${alpha})`
        : `rgb(${channels.join(", ")})`
      : color.alpha < 1
        ? `rgb(${channels.join(" ")} / ${alpha})`
        : `rgb(${channels.join(" ")})`;
  const entries = [
    {
      label: "HEX",
      value:
        (ctx.settings.normalizeShorthand ?? true) || !/^#?[\da-f]{3,8}$/i.test(ctx.input.text.trim())
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
