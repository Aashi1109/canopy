import { ToolError, type ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const base = ctx.settings.base;
  const from = ctx.settings.from;
  const to = ctx.settings.to;
  const toPixels: Record<string, number> = {
    px: 1,
    rem: base,
    em: base,
    pt: 96 / 72,
    "%": base / 100,
  };
  const convert = (input: string) => {
    const value = Number(input.trim());
    if (!Number.isFinite(value)) {
      throw new ToolError(
        "not-a-number",
        "Value must be a number.",
        "Enter the number on its own, without a unit suffix.",
      );
    }
    const result = (value * toPixels[from]) / toPixels[to];
    const converted = `${Number(result.toFixed(ctx.settings.roundResults ? 4 : 6))}${to}`;
    const factor = Number((toPixels[from] / toPixels[to]).toFixed(6));
    return ctx.settings.includeFormula
      ? `${converted}\nFormula: ${value}${from} × ${factor} ≈ ${converted}`
      : converted;
  };

  const lines = ctx.input.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) return { render: "text", text: convert(lines[0] ?? "") };

  return {
    render: "list",
    labels: lines,
    items: lines.map((line) => {
      try {
        return convert(line);
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    }),
  };
};

export default run;
