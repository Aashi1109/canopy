// Parsing and option handling for JSON supplied as untrusted tool input.
// Verbatim extraction from lib/devtools/format-json.ts (region 4).

import { ToolError } from "../../tool-framework/run.ts";
import { MAX_JSON_INPUT_CHARS, repairJson, type JsonRepairMode } from "./json.ts";
import { requireUtilityInput, stringOption } from "./options.ts";

type JsonInputRole = "json" | "left" | "right" | "data" | "schema";

export function repairModeFromOptions(options: Record<string, string | number | boolean>): JsonRepairMode {
  const mode = stringOption(options, "repairMode") || "remove";
  if (mode === "remove" || mode === "null" || mode === "off") return mode;
  throw new ToolError("invalid-json-repair-mode", "Choose a valid JSON repair mode.", undefined, {
    messageRef: { key: "jsonExecution.repairMode" },
  });
}

export function parseUtilityJson(
  input: string,
  options: Record<string, string | number | boolean>,
  label = "JSON input",
  inputRole: JsonInputRole = "json",
): unknown {
  requireUtilityInput(input, label, { key: "jsonExecution.required", values: { input: inputRole } });
  const repairMode = repairModeFromOptions(options);
  if (repairMode === "off") {
    try {
      return JSON.parse(input) as unknown;
    } catch {
      throw new ToolError("invalid-json", `${label} is not valid JSON.`, undefined, {
        messageRef: { key: "jsonExecution.invalidInput", values: { input: inputRole } },
      });
    }
  }
  const repaired = repairJson(input, repairMode);
  if (!repaired.ok)
    throw new ToolError("invalid-json", repaired.error.message, undefined, {
      line: repaired.error.line,
      column: repaired.error.column,
      messageRef:
        repaired.error.kind === "too-large"
          ? { key: "jsonExecution.inputTooLarge", values: { input: inputRole, limit: MAX_JSON_INPUT_CHARS } }
          : repaired.error.line && repaired.error.column
            ? {
                key: "jsonExecution.inputSyntax",
                values: { input: inputRole, line: repaired.error.line, column: repaired.error.column },
              }
            : { key: "jsonExecution.invalidInput", values: { input: inputRole } },
    });
  return repaired.value;
}

export function parseStrictJson(input: string, label: string, inputRole: JsonInputRole = "json"): unknown {
  requireUtilityInput(input, label, { key: "jsonExecution.required", values: { input: inputRole } });
  try {
    return JSON.parse(input) as unknown;
  } catch {
    throw new ToolError("invalid-json", `${label} is not valid JSON.`, undefined, {
      messageRef: { key: "jsonExecution.invalidInput", values: { input: inputRole } },
    });
  }
}

export function jsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
