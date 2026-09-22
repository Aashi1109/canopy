import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.csv-sorter",
  app: "devtools",
  category: "csv-data-tools",
  keywords: ["csv", "sort", "order", "column", "ascending", "descending"],
  name: "CSV Sorter",
  description: "Sort CSV rows by a named or numbered column.",
  layout: "side-by-side",
  outputLanguage: "csv",
  previewLayout: "table",
  input: {
    kind: "text",
    language: "csv",
    label: "CSV input",
    surface: "card",
    placeholder: "name,role\nLin,Editor\nAda,Admin",
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
        label: "Sort by column",
        help: "A header name, or a one-based column number.",
        default: "1",
      },
      order: {
        kind: "select",
        label: "Order",
        default: "asc",
        choices: [
          { label: "Ascending", value: "asc" },
          { label: "Descending", value: "desc" },
        ],
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Sort rows" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "SORT" },
  labels: {
    empty: "Paste CSV with a header row to sort its rows.",
    ready: "Sorted CSV is ready.",
    running: "Sorting CSV rows…",
  },
  content: {
    howToUse: [
      "Paste delimited data whose first row is a header. The header is never sorted — it stays on top.",
      "Name the sort column either by its header text (an exact, case-sensitive match) or by its one-based position.",
      "Choose ascending or descending, then sort. Comparison is natural: item2 sorts before item10, and case and accents are ignored.",
    ],
    limitations: [
      "The first row is always treated as a header. Headerless data loses its first row from the sort.",
      "Only one sort key is supported; there is no secondary tiebreak, though the sort is stable so the original order survives among equal keys.",
      "Numbers are compared by natural-language rules, not numerically — mixed formats such as 1e3 or 1,000 will not order the way arithmetic would.",
    ],
    faq: [
      {
        q: "Why was my column not found?",
        a: "Header matching is exact and case-sensitive, and a stray leading space counts. Use the one-based column number if the header text is awkward.",
      },
      {
        q: "Does sorting change my data?",
        a: "Only the row order. Field values, quoting, and the delimiter are re-serialised exactly as parsed.",
      },
    ],
    examples: [{ label: "Sort by first column", text: "name,age\nLin,29\nAda,36" }],
  },
} as const satisfies ToolSpec;
