import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.csv-column-extractor",
  app: "devtools",
  category: "csv-data-tools",
  keywords: ["csv", "column", "extract", "select", "field", "cut"],
  name: "CSV Column Extractor",
  description: "Extract one CSV column by name or one-based number.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "CSV input",
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
        default: ",",
        choices: [
          { label: "Comma", value: "," },
          { label: "Semicolon", value: ";" },
          { label: "Tab", value: "\t" },
          { label: "Pipe", value: "|" },
        ],
      },
      column: {
        kind: "text",
        label: "Column",
        help: "A header name, or a one-based column number.",
        default: "name",
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Extract column" },
  capabilities: { copy: true },
  workbenchMark: { text: "COL" },
  labels: {
    empty: "Paste delimited data with a header row to extract one column.",
    ready: "Extracted column is ready.",
    running: "Extracting CSV column…",
  },
  content: {
    howToUse: [
      "Paste delimited data whose first row is a header.",
      "Name the column by its header text (an exact, case-sensitive match) or by its one-based position.",
      "Extract. You get one value per line, header included, ready to paste into a query, a list, or another column.",
    ],
    limitations: [
      "One column at a time. To pull several, run the tool once per column.",
      "The header row is included in the output; delete the first line if you only want data.",
      "A value that would be ambiguous on its own — one containing the delimiter, a quote, or a newline — is re-quoted using CSV rules.",
    ],
    faq: [
      {
        q: "Can I extract by position instead of name?",
        a: "Yes. Enter a number and it is read as a one-based column index, so 1 is the first column.",
      },
      {
        q: "How do I drop the header?",
        a: "Remove the first line of the result. The tool always emits the header so the output stays self-describing.",
      },
    ],
    examples: [{ label: "Extract a named column", text: "name,age\nAda,36\nLin,29" }],
  },
} as const satisfies ToolSpec;
