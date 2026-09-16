import {
  type JsonRepairMode,
  repairJson,
  transformJson,
  type JsonTransformResult,
} from "../../lib/devtools/shared/json.ts";

import type { JsonViewerExecutionResult } from "./result.ts";

function fallbackErrorLocation(input: string) {
  const missingValue = /:\s*([,}\]])/.exec(input);
  const trailingComma = /,\s*([}\]])/.exec(input);
  const matchedDelimiter = missingValue ?? trailingComma;
  const offset =
    matchedDelimiter?.index !== undefined
      ? matchedDelimiter.index + matchedDelimiter[0].lastIndexOf(matchedDelimiter[1])
      : Math.max(0, input.trimEnd().length - 1);
  const lines = input.slice(0, offset).split(/\r\n|\r|\n/);
  return {
    column: (lines.at(-1)?.length ?? 0) + 1,
    line: lines.length,
  };
}

function appendJsonPath(path: string, segment: string | number) {
  if (typeof segment === "number") return `${path}[${segment}]`;
  return /^[A-Za-z_$][\w$]*$/.test(segment) ? `${path}.${segment}` : `${path}[${JSON.stringify(segment)}]`;
}

function collectMissingValuePaths(nullableValue: unknown, removedValue: unknown, path = "$"): string[] {
  if (
    nullableValue === null ||
    typeof nullableValue !== "object" ||
    removedValue === null ||
    typeof removedValue !== "object"
  ) {
    return [];
  }

  if (Array.isArray(nullableValue)) {
    if (!Array.isArray(removedValue)) return [];
    return nullableValue.flatMap((child, index) =>
      collectMissingValuePaths(child, removedValue[index], appendJsonPath(path, index)),
    );
  }

  if (Array.isArray(removedValue)) return [];
  const removedRecord = removedValue as Record<string, unknown>;
  return Object.entries(nullableValue).flatMap(([key, child]) => {
    const childPath = appendJsonPath(path, key);
    if (!(key in removedRecord)) return child === null ? [childPath] : [];
    return collectMissingValuePaths(child, removedRecord[key], childPath);
  });
}

export function executeJsonViewer(input: string): JsonViewerExecutionResult {
  const result = transformJson(input, { indentation: 2, mode: "format" });
  if (!result.ok) {
    if (result.error.kind !== "syntax" || (result.error.line && result.error.column)) {
      return result;
    }
    const location = fallbackErrorLocation(input);
    return {
      ok: false,
      error: {
        ...result.error,
        ...location,
        message: `JSON isn't valid near line ${location.line}, column ${location.column}. Check commas, quotes, and brackets.`,
      },
    };
  }
  return {
    formattedValue: result.output,
    ok: true,
    value: result.value,
  };
}

export function formatJsonViewerInput(input: string): JsonTransformResult {
  return transformJson(input, { indentation: 2, mode: "format" });
}

export function minifyJsonViewerInput(input: string): JsonTransformResult {
  return transformJson(input, { indentation: 2, mode: "minify" });
}

export function repairJsonViewerInput(input: string, repairMode: Exclude<JsonRepairMode, "off">) {
  return repairJson(input, repairMode);
}

export function describeJsonViewerRepair(input: string, repairMode: Exclude<JsonRepairMode, "off">) {
  const selectedRepair = repairJson(input, repairMode);
  if (!selectedRepair.ok) return selectedRepair;

  const nullableRepair = repairJson(input, "null");
  const removedRepair = repairJson(input, "remove");
  const changedPaths =
    nullableRepair.ok && removedRepair.ok ? collectMissingValuePaths(nullableRepair.value, removedRepair.value) : [];

  return {
    changedPaths,
    kind: repairMode,
    ok: true as const,
    output: selectedRepair.output,
  };
}
