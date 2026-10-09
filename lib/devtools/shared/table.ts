// Delimited-table parsing, serialization, and HTML rendering.
// Verbatim extraction from lib/devtools/format-json.ts (region 4).

import { ToolError } from "../../tool-framework/run.ts";
import { csvCell, parseDelimitedRows, type CsvDelimiter } from "./csv.ts";
import { escapeHtml } from "./text.ts";

export function utilityDelimiter(value: string): CsvDelimiter {
  if (value === "," || value === ";" || value === "\t" || value === "|") return value;
  throw new ToolError("invalid-delimiter", "Choose a valid delimiter.", "Choose comma, semicolon, tab, or pipe.", {
    messageRef: { key: "csv.errors.invalidDelimiter" },
    recoveryMessage: { key: "csv.recovery.delimiter" },
  });
}

export function parseUtilityTable(input: string, delimiter: CsvDelimiter): string[][] {
  if (!input.trim()) {
    throw new ToolError("input-required", "Delimited input is required.", "Enter a value and try again.", {
      messageRef: { key: "csv.errors.inputRequired" },
      recoveryMessage: { key: "csv.recovery.inputRequired" },
    });
  }
  const parsed = parseDelimitedRows(input, delimiter);
  if (!parsed.ok)
    throw new ToolError("invalid-delimited-input", parsed.message, undefined, { messageRef: parsed.messageRef });
  if (!parsed.rows.length)
    throw new ToolError("empty-table", "Delimited input has no rows.", undefined, {
      messageRef: { key: "csv.errors.emptyTable" },
    });
  const width = parsed.rows[0].length;
  if (!width || parsed.rows.some((row) => row.length !== width)) {
    throw new ToolError("inconsistent-row-width", "Every row must have the same number of fields.", undefined, {
      messageRef: { key: "csv.errors.inconsistentWidth" },
    });
  }
  return parsed.rows;
}

export function serializeTable(rows: readonly string[][], delimiter: CsvDelimiter): string {
  return rows.map((row) => row.map((cell) => csvCell(cell, delimiter)).join(delimiter)).join("\n");
}

export function tableToHtml(rows: readonly string[][]): string {
  const [headers, ...data] = rows;
  return `<table><thead><tr>${headers.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead><tbody>${data
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}
