import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.csv-delimiter-converter",
  app: "devtools",
  category: "csv-data-tools",
  keywords: ["csv", "tsv", "delimiter", "separator", "semicolon", "pipe", "tab", "convert"],
  name: "CSV Delimiter Converter",
  description: "Change delimiters without corrupting quoted values.",
  outputLanguage: "csv",
  previewLayout: "table",
  input: {
    kind: "text",
    language: "csv",
    label: "Delimited input",
    surface: "card",
    acceptFiles: {
      accept: ".csv,.tsv,text/csv,text/tab-separated-values",
      maxBytes: 104_857_600,
      maxEditableBytes: 2_000_000,
    },
    placeholder: "name,role\nAda,Admin\nLin,Editor",
  },
  settings: {
    fields: {
      from: {
        kind: "select",
        label: "From",
        help: "The delimiter your input uses today.",
        default: ",",
        choices: [
          { label: "Comma", value: "," },
          { label: "Semicolon", value: ";" },
          { label: "Tab", value: "\t" },
          { label: "Pipe", value: "|" },
        ],
      },
      to: {
        kind: "select",
        label: "To",
        help: "The delimiter you want in the output.",
        default: ";",
        choices: [
          { label: "Comma", value: "," },
          { label: "Semicolon", value: ";" },
          { label: "Tab", value: "\t" },
          { label: "Pipe", value: "|" },
        ],
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Convert delimiter" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "SEP" },
  labels: {
    empty: "Paste delimited rows to convert their separator.",
    ready: "Converted delimited data is ready.",
    running: "Converting delimiters…",
  },
  content: {
    howToUse: [
      "Paste the rows exactly as exported. Do not hand-edit the quoting first — the whole point is that quoting is handled for you.",
      "Set 'From' to the delimiter the input uses and 'To' to the one you need. They must differ.",
      "Convert. Fields that contain the new delimiter, a quote, or a newline are re-quoted automatically, so nothing is corrupted on the way through.",
    ],
    limitations: [
      "Only comma, semicolon, tab, and pipe are supported, in either direction.",
      "Every row must have the same number of fields; a ragged row is rejected rather than padded.",
      "Line endings are normalised to `\\n` in the output regardless of the input's CRLF or CR.",
      "This changes the delimiter only. Encoding, BOM, quoting style beyond what re-serialisation requires, and column order are untouched.",
      "Editable text is capped at 2,000,000 characters. CSV and TSV files up to 100 MiB run in read-only streaming mode.",
    ],
    faq: [
      {
        q: "Why not just find-and-replace the delimiter?",
        a: 'Because a comma inside a quoted field (`"Smith, Ada"`) is data, not a separator. A blind replace corrupts it. This tool parses the rows first and re-quotes on the way out.',
      },
      {
        q: "Which delimiter should I target for European Excel?",
        a: "Semicolon. Locales that use a comma as the decimal separator default to `;` for CSV, which is the usual reason to run this conversion.",
      },
      {
        q: "Can I convert from a delimiter to itself?",
        a: "No — that is rejected. If you want to normalise quoting without changing the separator, use the CSV Formatter.",
      },
    ],
    examples: [{ label: "Comma to semicolon", text: "name,age\nAda,36" }],
  },
} as const satisfies ToolSpec;
