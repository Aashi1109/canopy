import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.csv-filter",
  app: "devtools",
  category: "csv-data-tools",
  keywords: ["csv", "filter", "rows", "search", "column", "delimiter", "spreadsheet"],
  name: "CSV Filter",
  description: "Keep rows containing text, optionally in one column.",
  layout: "side-by-side",
  outputLanguage: "csv",
  previewLayout: "table",
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
    placeholder: "name,role\nAda,Admin\nLin,Editor",
  },
  settings: {
    fields: {
      delimiter: {
        kind: "select",
        label: "Delimiter",
        help: "Must match the file you pasted, or every row parses as one column.",
        default: ",",
        choices: [
          { label: "Comma", value: "," },
          { label: "Semicolon", value: ";" },
          { label: "Tab", value: "\t" },
          { label: "Pipe", value: "|" },
        ],
      },
      query: {
        kind: "text",
        pane: "input",
        label: "Contains text",
        help: "Case-insensitive substring match. Required — an empty filter is rejected rather than returning every row.",
        default: "Admin",
      },
      column: {
        kind: "text",
        pane: "input",
        label: "In column (optional)",
        help: "A header name or a 1-based column number. Leave blank to search every column.",
        default: "",
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Filter rows" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "FILT" },
  labels: {
    empty: "Paste CSV with a header row to filter its rows.",
    ready: "Filtered CSV is ready.",
    running: "Filtering CSV rows…",
  },
  content: {
    howToUse: [
      "Paste the CSV including its header row — the header is always kept, so the output stays loadable by the same tools that read the input.",
      "Pick the delimiter that matches the file. Comma is the default; European exports are usually semicolon-separated.",
      "Type the text to match. Matching is case-insensitive and matches anywhere inside a cell, not just at the start.",
      "Optionally restrict the search to one column by entering its header name or its 1-based position, then filter and copy or download the result.",
    ],
    limitations: [
      "Every row must have the same number of fields as the header. A ragged file is rejected rather than silently misaligned.",
      "Matching is a plain substring test — there is no regular-expression, numeric-comparison, or date-range mode.",
      "Only one filter term is supported per run. Chain runs to combine conditions.",
      "CSV and TSV files up to 100 MiB are filtered row by row in a worker; only a bounded preview is kept in the page.",
    ],
    faq: [
      {
        q: "Is the header row ever removed?",
        a: "No. The header is always emitted first, even when no data row matches.",
      },
      {
        q: "Can I filter on a column by position?",
        a: "Yes. Enter a number and it is read as a 1-based column index; anything else is matched against the header names.",
      },
      {
        q: "Are quoted values with embedded delimiters handled?",
        a: "Yes. Quoting is parsed properly on the way in and re-applied on the way out, so a value containing the delimiter survives the round trip.",
      },
      {
        q: "Why is an empty filter rejected?",
        a: "An empty filter matches everything, which is a no-op that usually means the field was left blank by mistake.",
      },
    ],
    examples: [{ label: "Roles table", text: "name,role\nAda,Admin\nLin,Editor" }],
  },
} as const satisfies ToolSpec;
