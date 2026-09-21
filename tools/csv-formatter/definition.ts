import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.csv-formatter",
  app: "devtools",
  category: "csv-data-tools",
  keywords: ["csv", "format", "normalize", "quoting", "trim", "clean", "tidy"],
  name: "CSV Formatter",
  description: "Normalize CSV quoting and row structure.",
  outputLanguage: "csv",
  input: {
    kind: "text",
    language: "csv",
    label: "CSV input",
    surface: "card",
    acceptFiles: {
      accept: ".csv,.tsv,text/csv,text/tab-separated-values",
      maxBytes: 104_857_600,
      maxEditableBytes: 2_000_000,
    },
    placeholder: "name,role\n Ada ,Admin\nLin,Editor",
  },
  settings: {
    fields: {
      delimiter: {
        kind: "select",
        label: "Delimiter",
        help: "Used for both reading and writing — the output uses the same delimiter as the input.",
        default: ",",
        choices: [
          { label: "Comma", value: "," },
          { label: "Semicolon", value: ";" },
          { label: "Tab", value: "\t" },
          { label: "Pipe", value: "|" },
        ],
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Format CSV" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "CSV+" },
  labels: {
    empty: "Paste CSV to normalize its quoting, spacing, and rows.",
    ready: "Formatted CSV is ready.",
    running: "Formatting CSV…",
  },
  content: {
    howToUse: [
      "Paste the CSV you want tidied. Set the delimiter first — it is used to read the input and to write the output.",
      "Format. Leading and trailing whitespace is stripped from every cell, and quoting is re-applied only where it is actually needed.",
      "Compare the result with the original before replacing a source file — trimming is not always what you want for fixed-width or padded exports.",
      "Line endings are normalized to `\\n`.",
    ],
    limitations: [
      "Every row must have the same field count as the first row; a ragged file is rejected rather than padded.",
      "Whitespace inside a cell is preserved; only the leading and trailing whitespace of each cell is removed. That means a deliberately padded value loses its padding.",
      "Blank rows are dropped, and a UTF-8 BOM is not stripped.",
      "The delimiter is not changed — this normalizes quoting and spacing, it does not convert between formats.",
    ],
    faq: [
      {
        q: "Why did quotes disappear from some fields?",
        a: "Quoting is re-applied only where the value actually needs it: when it contains the delimiter, a double quote, or a line break. Unnecessary quotes are dropped.",
      },
      {
        q: "Will this change my numbers or dates?",
        a: "No. Every cell is treated as text and is written back byte-for-byte apart from the trim.",
      },
      {
        q: "Does it fix a ragged file?",
        a: "No. Rows with the wrong field count are reported as an error so you can find the real problem.",
      },
    ],
    examples: [
      { label: "Padded and quoted", text: 'name,note\n Ada ,"Hello, world"' },
      { label: "Redundant quotes", text: '"id","value"\n"1","ok"' },
    ],
  },
} as const satisfies ToolSpec;
