// Core JSON transform, repair, and summary helpers.
// Verbatim extraction from lib/devtools/format-json.ts (region 1).

export const MAX_JSON_INPUT_CHARS = 2_000_000;

export type JsonIndentation = 2 | 4 | "tab";
export type JsonTransformMode = "format" | "minify";
export type JsonRepairMode = "remove" | "null" | "off";

type JsonTransformError = {
  kind: "empty" | "syntax" | "too-large";
  message: string;
  line?: number;
  column?: number;
};

export type JsonTransformResult =
  { ok: true; output: string; value: unknown } | { ok: false; error: JsonTransformError };

export type JsonRepairResult =
  { ok: true; output: string; value: unknown; repaired: boolean } | { ok: false; error: JsonTransformError };

export type JsonSummary = {
  arrayCount: number;
  byteSize: number;
  depth: number;
  keyCount: number;
  lineCount: number;
};

export type JsonNodeMetadata = {
  preview: Array<{ key: string; value: string }>;
  selectedKey: string;
  selectedType: string;
};

type TransformOptions = {
  mode: JsonTransformMode;
  indentation: JsonIndentation;
};

function getErrorLocation(message: string, input: string) {
  const lineAndColumn = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);

  if (lineAndColumn) {
    return {
      line: Number(lineAndColumn[1]),
      column: Number(lineAndColumn[2]),
    };
  }

  const position = message.match(/position\s+(\d+)/i);

  if (!position) {
    return undefined;
  }

  const prefix = input.slice(0, Number(position[1]));
  const lines = prefix.split(/\r\n|\r|\n/);

  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  };
}

export function transformJson(input: string, { mode, indentation }: TransformOptions): JsonTransformResult {
  if (!input.trim()) {
    return {
      ok: false,
      error: {
        kind: "empty",
        message: "Paste JSON or open a .json file to get started.",
      },
    };
  }

  if (input.length > MAX_JSON_INPUT_CHARS) {
    return {
      ok: false,
      error: {
        kind: "too-large",
        message: `JSON must be ${MAX_JSON_INPUT_CHARS.toLocaleString("en-US")} characters or fewer.`,
      },
    };
  }

  try {
    const value: unknown = JSON.parse(input);
    const spacing = indentation === "tab" ? "\t" : indentation;
    const output = JSON.stringify(value, null, mode === "minify" ? 0 : spacing);

    return { ok: true, output, value };
  } catch (error) {
    const location = getErrorLocation(error instanceof Error ? error.message : "", input);
    const near = location ? ` near line ${location.line}, column ${location.column}` : "";

    return {
      ok: false,
      error: {
        kind: "syntax",
        message: `JSON isn't valid${near}. Check commas, quotes, and brackets.`,
        ...location,
      },
    };
  }
}

const MISSING_VALUE = "__CANOPY_MISSING_JSON_VALUE__";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function repairMissingPropertyValues(input: string): { input: string; repaired: boolean } {
  let repaired = false;
  const nextInput = input.replace(/("(?:\\.|[^"\\])*")\s*:\s*(?=[,}])/g, (match, key: string) => {
    repaired = true;
    return `${key}:"${MISSING_VALUE}"`;
  });
  return { input: nextInput, repaired };
}

export function resolveMissingValues(value: unknown, repairMode: Exclude<JsonRepairMode, "off">): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => (item === MISSING_VALUE ? null : resolveMissingValues(item, repairMode)));
  }
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) => {
      if (child === MISSING_VALUE) {
        return repairMode === "remove" ? [] : [[key, null] as const];
      }
      return [[key, resolveMissingValues(child, repairMode)] as const];
    }),
  );
}

function normalizeJsonLikeText(input: string): { ok: true; output: string; repaired: boolean } | { ok: false } {
  let output = "";
  let repaired = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];

    if (character === '"') {
      const start = index;
      index += 1;
      while (index < input.length) {
        if (input[index] === "\\") index += 1;
        else if (input[index] === '"') break;
        index += 1;
      }
      if (index >= input.length) return { ok: false };
      output += input.slice(start, index + 1);
      continue;
    }

    if (character === "'") {
      let value = "";
      let closed = false;
      for (index += 1; index < input.length; index += 1) {
        const current = input[index];
        if (current === "'") {
          closed = true;
          break;
        }
        if (current !== "\\") {
          value += current;
          continue;
        }

        const escaped = input[index + 1];
        const escapes: Record<string, string> = {
          b: "\b",
          f: "\f",
          n: "\n",
          r: "\r",
          t: "\t",
        };
        if (escaped === "u" && /^[\da-f]{4}$/i.test(input.slice(index + 2, index + 6))) {
          value += String.fromCharCode(Number.parseInt(input.slice(index + 2, index + 6), 16));
          index += 5;
        } else {
          value += escapes[escaped] ?? escaped;
          index += 1;
        }
      }
      if (!closed) return { ok: false };
      output += JSON.stringify(value);
      repaired = true;
      continue;
    }

    if (character === "/" && next === "/") {
      index += 2;
      while (index < input.length && input[index] !== "\n" && input[index] !== "\r") {
        index += 1;
      }
      output += input[index] ?? "";
      repaired = true;
      continue;
    }

    if (character === "/" && next === "*") {
      const end = input.indexOf("*/", index + 2);
      if (end === -1) return { ok: false };
      output += " ";
      index = end + 1;
      repaired = true;
      continue;
    }

    output += character;
  }

  let normalized = "";
  for (let index = 0; index < output.length; index += 1) {
    const character = output[index];

    if (character === '"') {
      const start = index;
      index += 1;
      while (index < output.length) {
        if (output[index] === "\\") index += 1;
        else if (output[index] === '"') break;
        index += 1;
      }
      if (index >= output.length) return { ok: false };
      normalized += output.slice(start, index + 1);
      continue;
    }

    if (character === ",") {
      let nextIndex = index + 1;
      while (/\s/.test(output[nextIndex] ?? "")) nextIndex += 1;
      if (output[nextIndex] === "}" || output[nextIndex] === "]") {
        normalized += output.slice(index + 1, nextIndex);
        index = nextIndex - 1;
        repaired = true;
        continue;
      }
    }

    normalized += character;
    if (character !== "{" && character !== ",") continue;

    let keyStart = index + 1;
    while (/\s/.test(output[keyStart] ?? "")) keyStart += 1;
    if (!/[A-Za-z_$]/.test(output[keyStart] ?? "")) continue;
    let keyEnd = keyStart + 1;
    while (/[\w$-]/.test(output[keyEnd] ?? "")) keyEnd += 1;
    let colon = keyEnd;
    while (/\s/.test(output[colon] ?? "")) colon += 1;
    if (output[colon] !== ":") continue;

    normalized += output.slice(index + 1, keyStart);
    normalized += JSON.stringify(output.slice(keyStart, keyEnd));
    normalized += output.slice(keyEnd, colon + 1);
    index = colon;
    repaired = true;
  }

  return { ok: true, output: normalized, repaired };
}

export function repairJson(input: string, repairMode: Exclude<JsonRepairMode, "off">): JsonRepairResult {
  if (!input.trim()) {
    return {
      ok: false,
      error: { kind: "empty", message: "Paste JSON to repair it." },
    };
  }
  if (input.length > MAX_JSON_INPUT_CHARS) {
    return {
      ok: false,
      error: {
        kind: "too-large",
        message: `JSON must be ${MAX_JSON_INPUT_CHARS.toLocaleString("en-US")} characters or fewer.`,
      },
    };
  }

  try {
    const value: unknown = JSON.parse(input);
    return { ok: true, output: JSON.stringify(value, null, 2), value, repaired: false };
  } catch {
    const normalized = normalizeJsonLikeText(input);
    if (!normalized.ok) {
      return {
        ok: false,
        error: { kind: "syntax", message: "JSON could not be repaired safely." },
      };
    }

    const missing = repairMissingPropertyValues(normalized.output);
    try {
      const value = resolveMissingValues(JSON.parse(missing.input), repairMode);
      return {
        ok: true,
        output: JSON.stringify(value, null, 2),
        value,
        repaired: normalized.repaired || missing.repaired,
      };
    } catch {
      return {
        ok: false,
        error: { kind: "syntax", message: "JSON could not be repaired safely." },
      };
    }
  }
}

export function summarizeJson(value: unknown, output: string): JsonSummary {
  let arrayCount = 0;
  let depth = 0;
  let keyCount = 0;

  function visit(current: unknown, currentDepth: number) {
    if (Array.isArray(current)) {
      arrayCount += 1;
      depth = Math.max(depth, currentDepth);
      current.forEach((child) => visit(child, currentDepth + 1));
      return;
    }

    if (typeof current === "object" && current !== null) {
      depth = Math.max(depth, currentDepth);
      Object.values(current).forEach((child) => {
        keyCount += 1;
        visit(child, currentDepth + 1);
      });
    }
  }

  visit(value, 0);

  return {
    arrayCount,
    byteSize: new TextEncoder().encode(output).length,
    depth,
    keyCount,
    lineCount: output.split("\n").length,
  };
}

function previewJsonNodeValue(value: unknown): string {
  if (Array.isArray(value)) return "[…]";
  if (value !== null && typeof value === "object") return "{…}";
  return JSON.stringify(value) ?? String(value);
}

export function getJsonNodeMetadata(selectedKey: string, value: unknown, previewLimit = 2): JsonNodeMetadata {
  const limit = Math.max(0, Math.trunc(previewLimit));
  const preview = Array.isArray(value)
    ? value.slice(0, limit).map((item, index) => ({
        key: String(index),
        value: previewJsonNodeValue(item),
      }))
    : value !== null && typeof value === "object"
      ? Object.entries(value)
          .slice(0, limit)
          .map(([key, item]) => ({
            key,
            value: previewJsonNodeValue(item),
          }))
      : [{ key: "value", value: previewJsonNodeValue(value) }];

  return {
    preview,
    selectedKey,
    selectedType: Array.isArray(value)
      ? `Array [${value.length}]`
      : value === null
        ? "Null"
        : typeof value === "object"
          ? `Object {${Object.keys(value).length}}`
          : typeof value,
  };
}
