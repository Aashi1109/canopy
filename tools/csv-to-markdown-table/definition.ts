import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.csv-to-markdown-table",
  app: "devtools",
  category: "csv-data-tools",
  keywords: ["csv", "markdown", "table", "readme", "github", "tsv", "convert"],
  name: "CSV to Markdown Table",
  description: "Convert CSV rows to a Markdown table.",
  outputLanguage: "markdown",
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
        help: "The character that separates fields in your input.",
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
  trigger: { mode: "manual", actionLabel: "Convert to Markdown" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "C>M" },
  labels: {
    empty: "Paste CSV with a header row to build a Markdown table.",
    ready: "Markdown table is ready.",
    running: "Building Markdown table…",
  },
  content: {
    howToUse: [
      "Paste your rows, including the header row — the first row becomes the table header.",
      "Set the delimiter to match your data. Exporting from a spreadsheet as tab-separated and choosing Tab avoids most quoting problems.",
      "Convert and paste the result straight into a README, a pull request description, or any GitHub-flavoured Markdown document.",
    ],
    limitations: [
      "Every row must have the same number of fields as the header row; a ragged row is rejected rather than padded.",
      "The first row is always treated as the header. There is no headerless mode.",
      "Alignment is not configurable — the separator row is always `---`.",
      "Pipes and backslashes inside cells are escaped, and embedded newlines become `<br>`, which renders on GitHub but not in every Markdown flavour.",
      'Quoted fields are parsed per RFC 4180, so a comma inside `"a,b"` stays in one cell.',
    ],
    faq: [
      {
        q: "My data has commas inside a field. Will it break?",
        a: 'Not if the field is quoted (`"Smith, Ada"`). Quoted fields are parsed properly. Unquoted commas are genuinely field separators and will split the cell.',
      },
      {
        q: "Why does it say every row must have the same number of fields?",
        a: "A row with more or fewer fields than the header would silently misalign the table. Fix the ragged row, or add the missing empty fields, and run again.",
      },
      {
        q: "Can I control column alignment?",
        a: "Not from this tool. Edit the `---` separator row afterwards to `:---`, `:---:`, or `---:`.",
      },
    ],
    examples: [{ label: "Two columns", text: "name,age\nAda,36" }],
  },
} as const satisfies ToolSpec;
