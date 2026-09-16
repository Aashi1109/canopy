// Typed readers over a resolved option bag, plus the required-input guard.
// Verbatim extraction from lib/devtools/format-json.ts (region 4).

import { ToolError } from "../../tool-framework/run.ts";

export function stringOption(options: Record<string, string | number | boolean>, key: string): string {
  return String(options[key] ?? "");
}

export function numberOption(options: Record<string, string | number | boolean>, key: string): number {
  return Number(options[key]);
}

export function booleanOption(options: Record<string, string | number | boolean>, key: string): boolean {
  return options[key] === true;
}

export function requireUtilityInput(value: string, label: string): string {
  if (!value.trim()) {
    throw new ToolError("input-required", `${label} is required.`, "Enter a value and try again.");
  }
  return value;
}
