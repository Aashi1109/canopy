import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.csv-column-extractor",
  app: "devtools",
  category: "csv-data-tools",
  keywords: ["csv", "column", "extract", "select", "field", "cut"],
  name: "CSV Column Extractor",
  description: "Extract CSV columns by name or one-based number.",
  outputLanguage: "csv",
  resultStats: "status-only",
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
        pane: "input",
        help: "Header names or one-based numbers, separated by commas. Press Enter to extract.",
        default: "name",
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Extract columns" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "COL" },
  labels: {
    empty: "Paste delimited data with a header row to extract columns.",
    ready: "Extracted columns are ready.",
    running: "Extracting CSV columns…",
  },
  content: {
    howToUse: [
      "Paste delimited data whose first row is a header.",
      "Enter header names (exact, case-sensitive matches) or one-based positions, separated by commas, such as firstName,lastName or 2,3.",
      "Press Enter in the Column field or choose Extract columns. View the CSV as Raw or Table, then copy it or download extracted-columns.csv.",
    ],
    limitations: [
      "Separate selections with commas even when the input uses semicolons, tabs, or pipes. The output uses the selected data delimiter.",
      "Repeated selections produce repeated columns in the requested order.",
      "The header row is included in the output; delete the first line if you only want data.",
      "A value that would be ambiguous on its own — one containing the delimiter, a quote, or a newline — is re-quoted using CSV rules.",
      "Table previews show up to 1,000 data rows within row, cell, and 2 MiB text limits. Rows exceeding the remaining text budget are omitted; oversized headers use Raw view only. Large files also use a bounded raw preview; download the complete CSV for all selected rows.",
    ],
    faq: [
      {
        q: "Can I extract by position instead of name?",
        a: "Yes. Numbers are one-based column positions, so 1 is the first column. You can mix positions and header names, such as 2,lastName.",
      },
      {
        q: "What if a header contains a comma?",
        a: 'An exact full-header match takes precedence. To combine a comma-containing header with others, quote it: "last,name",2. If firstName,lastName is itself a header but you want the two separate fields, enter "firstName","lastName".',
      },
      {
        q: "How do I drop the header?",
        a: "Remove the first line of the result. The tool always emits the header so the output stays self-describing.",
      },
    ],
    examples: [
      { label: "Extract a named column", text: "name,age\nAda,36\nLin,29" },
      {
        label: "Select firstName,lastName",
        text: "id,firstName,lastName\n1001,Aarav,Sharma\n1002,Priya,Mehta",
        settings: { column: "firstName,lastName" },
      },
    ],
  },
} as const satisfies ToolSpec;
