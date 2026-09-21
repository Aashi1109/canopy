// CSV <-> JSON conversion and delimited-row parsing.
// Verbatim extraction from lib/devtools/format-json.ts (region 1).

import {
  isRecord,
  MAX_JSON_INPUT_CHARS,
  repairMissingPropertyValues,
  resolveMissingValues,
  type JsonRepairMode,
} from "./json.ts";

export type CsvDelimiter = "," | ";" | "\t" | "|";

type JsonToCsvError = {
  kind: "empty" | "syntax" | "shape" | "too-large" | "configuration";
  message: string;
};

export type JsonToCsvResult =
  | {
      ok: true;
      columns: string[];
      rows: string[][];
      output: string;
      repaired: boolean;
      rowCount: number;
    }
  | { ok: false; error: JsonToCsvError };

export type CsvToJsonResult =
  { ok: true; columns: string[]; output: string; rowCount: number } | { ok: false; error: JsonToCsvError };

export function flattenRecord(
  value: Record<string, unknown>,
  prefix = "",
  flattened: Record<string, unknown> = {},
): Record<string, unknown> {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isRecord(child) && Object.keys(child).length) {
      flattenRecord(child, path, flattened);
    } else {
      flattened[path] = child;
    }
  }
  return flattened;
}

function csvValueText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function csvCell(value: unknown, delimiter: CsvDelimiter): string {
  const text = csvValueText(value);

  return text.includes(delimiter) || /["\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function convertJsonToCsv(
  input: string,
  { delimiter = ",", repairMode = "remove" }: { delimiter?: CsvDelimiter; repairMode?: JsonRepairMode } = {},
): JsonToCsvResult {
  if (!input.trim()) {
    return {
      ok: false,
      error: { kind: "empty", message: "Paste JSON to convert it to CSV." },
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
  if (delimiter !== "," && delimiter !== ";" && delimiter !== "\t" && delimiter !== "|") {
    return {
      ok: false,
      error: { kind: "configuration", message: "Choose a valid CSV delimiter." },
    };
  }

  let value: unknown;
  let repaired = false;
  try {
    value = JSON.parse(input);
  } catch {
    if (repairMode === "off") {
      return {
        ok: false,
        error: { kind: "syntax", message: "JSON is not valid." },
      };
    }
    const repair = repairMissingPropertyValues(input);
    if (!repair.repaired) {
      return {
        ok: false,
        error: { kind: "syntax", message: "JSON is not valid." },
      };
    }
    try {
      value = resolveMissingValues(JSON.parse(repair.input), repairMode);
      repaired = true;
    } catch {
      return {
        ok: false,
        error: { kind: "syntax", message: "JSON could not be repaired safely." },
      };
    }
  }

  const records = Array.isArray(value) ? value : [value];
  if (!records.every(isRecord)) {
    return {
      ok: false,
      error: {
        kind: "shape",
        message: "Use a JSON object or an array of JSON objects.",
      },
    };
  }

  const flattenedRows = records.map((row) => flattenRecord(row));
  const columns = [...new Set(flattenedRows.flatMap((row) => Object.keys(row)))];
  const rows = flattenedRows.map((row) => columns.map((column) => csvValueText(row[column])));
  const output = columns.length
    ? [
        columns.map((column) => csvCell(column, delimiter)).join(delimiter),
        ...rows.map((row) => row.map((cell) => csvCell(cell, delimiter)).join(delimiter)),
      ].join("\n")
    : "";

  return {
    ok: true,
    columns,
    rows,
    output,
    repaired,
    rowCount: flattenedRows.length,
  };
}

export function parseDelimitedRows(
  input: string,
  delimiter: CsvDelimiter,
): { ok: true; rows: string[][] } | { ok: false; message: string } {
  const text = input.startsWith("\uFEFF") ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (afterQuote && character !== delimiter && character !== "\n" && character !== "\r") {
      return {
        ok: false,
        message: `Unexpected character ${JSON.stringify(character)} after a closing quote.`,
      };
    }

    if (character === '"') {
      if (field) return { ok: false, message: "A quoted field must start after a delimiter." };
      quoted = true;
      afterQuote = false;
    } else if (character === delimiter) {
      row.push(field);
      field = "";
      afterQuote = false;
    } else if (character === "\n" || character === "\r") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      afterQuote = false;
      if (character === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      field += character;
    }
  }

  if (quoted) return { ok: false, message: "A quoted CSV field is not closed." };
  row.push(field);
  rows.push(row);
  return { ok: true, rows: rows.filter((values) => values.some(Boolean)) };
}

export function convertCsvToJson(
  input: string,
  { delimiter = "," }: { delimiter?: CsvDelimiter } = {},
): CsvToJsonResult {
  if (!input.trim()) {
    return {
      ok: false,
      error: { kind: "empty", message: "Paste CSV to convert it to JSON." },
    };
  }
  if (input.length > MAX_JSON_INPUT_CHARS) {
    return {
      ok: false,
      error: {
        kind: "too-large",
        message: `CSV must be ${MAX_JSON_INPUT_CHARS.toLocaleString("en-US")} characters or fewer.`,
      },
    };
  }
  if (![",", ";", "\t", "|"].includes(delimiter)) {
    return {
      ok: false,
      error: { kind: "configuration", message: "Choose a valid CSV delimiter." },
    };
  }

  const parsed = parseDelimitedRows(input, delimiter);
  if (!parsed.ok) {
    return { ok: false, error: { kind: "syntax", message: parsed.message } };
  }

  const [headerRow, ...dataRows] = parsed.rows;
  const columns = (headerRow ?? []).map((column, index) =>
    (index === 0 ? column.replace(/^\uFEFF/, "") : column).trim(),
  );
  if (!columns.length || columns.some((column) => !column)) {
    return {
      ok: false,
      error: { kind: "shape", message: "Every CSV column needs a header." },
    };
  }
  if (new Set(columns).size !== columns.length) {
    return {
      ok: false,
      error: { kind: "shape", message: "CSV headers must be unique." },
    };
  }
  if (dataRows.some((values) => values.length !== columns.length)) {
    return {
      ok: false,
      error: {
        kind: "shape",
        message: "Every CSV row must have the same number of fields as the header.",
      },
    };
  }

  const value = dataRows.map((values) => Object.fromEntries(columns.map((column, index) => [column, values[index]])));
  return {
    ok: true,
    columns,
    output: JSON.stringify(value, null, 2),
    rowCount: value.length,
  };
}
