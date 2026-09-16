// Parsing and option handling for JSON supplied as untrusted tool input.
// Verbatim extraction from lib/devtools/format-json.ts (region 4).

import { ToolError } from "../../tool-framework/run.ts";
import { repairJson, type JsonRepairMode } from "./json.ts";
import { requireUtilityInput, stringOption } from "./options.ts";

export function repairModeFromOptions(options: Record<string, string | number | boolean>): JsonRepairMode {
  const mode = stringOption(options, "repairMode") || "remove";
  if (mode === "remove" || mode === "null" || mode === "off") return mode;
  throw new ToolError("invalid-json-repair-mode", "Choose a valid JSON repair mode.");
}

export function parseUtilityJson(
  input: string,
  options: Record<string, string | number | boolean>,
  label = "JSON input",
): unknown {
  requireUtilityInput(input, label);
  const repairMode = repairModeFromOptions(options);
  if (repairMode === "off") {
    try {
      return JSON.parse(input) as unknown;
    } catch {
      throw new ToolError("invalid-json", `${label} is not valid JSON.`);
    }
  }
  const repaired = repairJson(input, repairMode);
  if (!repaired.ok) throw new ToolError("invalid-json", repaired.error.message);
  return repaired.value;
}

export function parseStrictJson(input: string, label: string): unknown {
  requireUtilityInput(input, label);
  try {
    return JSON.parse(input) as unknown;
  } catch {
    throw new ToolError("invalid-json", `${label} is not valid JSON.`);
  }
}

export function jsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
