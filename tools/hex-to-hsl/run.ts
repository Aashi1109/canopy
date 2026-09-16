/**
 * Moved verbatim from the `hex-to-hsl` case in `lib/devtools/format-json.ts`
 * (arm at line 2762). Both helpers are shared
 * (`lib/devtools/shared/color.ts`).
 */

import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { parseHexColor, rgbToHsl } from "../../lib/devtools/shared/color.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

function precisePercentages(red: number, green: number, blue: number): [number, number] {
  const channels = [red, green, blue].map((channel) => channel / 255);
  const max = Math.max(...channels);
  const min = Math.min(...channels);
  const lightness = (max + min) / 2;
  const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return [Number((saturation * 100).toFixed(3)), Number((lightness * 100).toFixed(3))];
}

function convert(input: string, settings: Settings): string {
  const color = parseHexColor(input);
  let text = rgbToHsl(settings.includeAlpha === false ? { ...color, alpha: 1 } : color);

  if (settings.roundPercentages === false) {
    const [saturation, lightness] = precisePercentages(color.red, color.green, color.blue);
    text = text.replace(/\d+%, \d+%/, `${saturation}%, ${lightness}%`);
  }
  if (settings.outputFormat === "channels") text = text.replace(/^hsla?\(|\)$/g, "");

  return text;
}

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const lines = ctx.input.text
    .split(/\r?\n/)
    .map((input, index) => ({ input: input.trim(), line: index + 1 }))
    .filter(({ input }) => input);

  if (lines.length <= 1)
    return { render: "text", text: convert(lines[0]?.input ?? ctx.input.text, ctx.settings) };

  const items: string[] = [];
  const labels: string[] = [];
  const issues: NonNullable<ToolResult["issues"]>[number][] = [];
  for (const line of lines) {
    try {
      items.push(convert(line.input, ctx.settings));
      labels.push(line.input);
    } catch (error) {
      issues.push({
        line: line.line,
        message: `"${line.input}": ${error instanceof Error ? error.message : String(error)}`,
        target: "input",
      });
    }
  }

  return {
    render: "list",
    items,
    labels,
    issues: issues.length ? issues : undefined,
  };
};

export default run;
