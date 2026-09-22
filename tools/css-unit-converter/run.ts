import { ToolError, type ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult, ToolValidationIssue } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;
const UNITS = ["px", "rem", "em", "pt", "%", "vw", "vh", "vmin", "vmax"];
const VALUE = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(px|rem|em|pt|%|vw|vh|vmin|vmax)?$/i;

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const settings = ctx.settings;
  if (!UNITS.includes(settings.from) || !UNITS.includes(settings.to))
    throw new ToolError("invalid-unit", "Choose a supported CSS unit.");
  const precision = settings.roundResults ? 4 : (settings.precision ?? 6);
  if (!Number.isInteger(precision) || precision < 0 || precision > 12)
    throw new ToolError("invalid-precision", "Precision must be a whole number from 0 to 12.");

  function positive(value: number, label: string) {
    if (!Number.isFinite(value) || value <= 0)
      throw new ToolError("invalid-reference", `${label} must be a finite, positive number.`);
    return value;
  }
  function pixels(unit: string): number {
    switch (unit) {
      case "px":
        return 1;
      case "pt":
        return 96 / 72;
      case "rem":
        return positive(settings.base, "Root font size");
      case "em":
        return settings.emContext === "parent"
          ? positive(settings.parentFontSize ?? settings.base, "Parent font size")
          : positive(settings.elementFontSize ?? settings.base, "Element font size");
      case "%":
        return settings.percentageReference === "length"
          ? positive(settings.percentageBase, "Percentage reference length") / 100
          : positive(settings.parentFontSize ?? settings.base, "Parent font size") / 100;
      case "vw":
        return positive(settings.viewportWidth ?? 1366, "Viewport width") / 100;
      case "vh":
        return positive(settings.viewportHeight ?? 768, "Viewport height") / 100;
      case "vmin":
        return Math.min(pixels("vw"), pixels("vh"));
      case "vmax":
        return Math.max(pixels("vw"), pixels("vh"));
      default:
        throw new ToolError("invalid-unit", "Choose a supported CSS unit.");
    }
  }

  function convert(input: string) {
    const match = VALUE.exec(input);
    if (!match) throw new ToolError("invalid-value", "Enter a number, optionally followed by a supported CSS unit.");
    const value = Number(match[1]);
    if (!Number.isFinite(value)) throw new ToolError("invalid-value", "The value is too large; enter a finite number.");
    const from = match[2]?.toLowerCase() ?? settings.from;
    const factor = pixels(from) / pixels(settings.to);
    const result = value * factor;
    if (!Number.isFinite(result))
      throw new ToolError("overflow", "The converted value is too large. Reduce the value or its reference size.");
    const converted = `${Number(result.toFixed(precision))}${settings.to}`;
    const formula = `${value}${from} × ${Number(factor.toPrecision(12))} ≈ ${converted}`;
    return { converted, formula };
  }

  const lines = ctx.input.text
    .split(/\r?\n/)
    .map((text, index) => ({ text: text.trim(), line: index + 1 }))
    .filter(({ text }) => text);
  if (lines.length === 0) throw new ToolError("empty-value", "Enter a CSS value to convert.");
  if (lines.length === 1) {
    const { converted, formula } = convert(lines[0].text);
    return { render: "text", text: settings.includeFormula ? `${converted}\nFormula: ${formula}` : converted };
  }

  const issues: ToolValidationIssue[] = [];
  const rows = lines.map(({ text, line }) => {
    try {
      const { converted, formula } = convert(text);
      return [String(line), text, converted, ...(settings.includeFormula ? [formula] : [])];
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not convert this value.";
      issues.push({ target: "input", line, message });
      return [String(line), text, "", ...(settings.includeFormula ? [""] : [])];
    }
  });
  return {
    render: "table",
    columns: ["Line", "Input", "Result", ...(settings.includeFormula ? ["Formula"] : [])],
    rows,
    ...(issues.length
      ? {
          issues,
          verdict: {
            level: "warn" as const,
            label: `${lines.length - issues.length} converted · ${issues.length} need correction`,
          },
        }
      : {}),
  };
};

export default run;
