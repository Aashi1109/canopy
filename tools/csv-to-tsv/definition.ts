import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.csv-to-tsv",
  app: "devtools",
  category: "csv-data-tools",
  keywords: ["csv", "tsv", "convert", "tab separated", "spreadsheet", "excel"],
  name: "CSV to TSV",
  description: "Convert comma-separated values to tab-separated values.",
  outputLanguage: "tsv",
  previewLayout: "table",
  layout: "side-by-side",
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
    placeholder: "name,note\nAda,Hello",
  },
  settings: { fields: {} },
  trigger: { mode: "manual", actionLabel: "Convert to TSV" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "C>T" },
  labels: {
    empty: "Paste comma-separated rows to convert them to TSV.",
    ready: "Tab-separated text is ready.",
    running: "Converting CSV to TSV…",
  },
  content: {
    howToUse: [
      "Paste comma-separated rows, quotes and all. Quoted fields containing commas are parsed correctly and unquoted on the way out.",
      "Convert. Fields are re-joined with tab characters, and only fields that still need quoting keep their quotes.",
      "Paste the TSV straight into a spreadsheet — tab-separated text pastes into cells without an import dialog.",
    ],
    limitations: [
      "The input delimiter is fixed at a comma. Semicolon- or pipe-delimited data needs a delimiter converter first.",
      "Every row must have the same number of fields; a ragged row is rejected rather than padded.",
      "A field containing a literal tab or newline is re-quoted, which some naive TSV readers do not handle.",
    ],
    faq: [
      {
        q: 'What happens to a value like "Hello, world"?',
        a: "The comma was only significant to CSV, so the quotes are dropped and the value becomes a plain tab-delimited field.",
      },
      {
        q: "Is the header row treated specially?",
        a: "No. Row one is converted like every other row, which is what you want when pasting into a spreadsheet.",
      },
    ],
    examples: [{ label: "Quoted field", text: 'name,note\nAda,"Hello, world"' }],
  },
} as const satisfies ToolSpec;
