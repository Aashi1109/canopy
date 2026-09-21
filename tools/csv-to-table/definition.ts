import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.csv-to-table",
  app: "devtools",
  category: "csv-data-tools",
  keywords: ["csv", "html", "table", "convert", "markup", "thead", "accessible"],
  name: "CSV to Table",
  description: "Convert CSV to an accessible HTML table.",
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
    placeholder: "name,role\nAda,Admin",
  },
  settings: {
    fields: {
      delimiter: {
        kind: "select",
        label: "Delimiter",
        help: "Pick the character that separates fields in your source data.",
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
  trigger: { mode: "manual", actionLabel: "Build table" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "TBL" },
  labels: {
    empty: "Paste CSV rows to generate HTML table markup.",
    ready: "HTML table markup is ready.",
    running: "Generating HTML table…",
  },
  content: {
    howToUse: [
      "Paste the CSV. The first row becomes the `<thead>` row, and every remaining row becomes a `<tbody>` row.",
      "Set the delimiter to match your export before building.",
      "Build, then copy the markup into your page. It is a plain semantic `<table>` with no classes, inline styles, or wrapper elements, so your own CSS applies unchanged.",
      "Every cell is HTML-escaped on the way out, so pasting the result into a page cannot introduce markup that came from the data.",
    ],
    limitations: [
      "All rows must have the same field count as the header; a ragged file is rejected.",
      "No `scope`, `caption`, `colgroup`, or `id`/`headers` attributes are emitted. For a complex table with merged or multi-level headers you will need to add those by hand.",
      "There is no styling and no column-type detection — numbers stay left-aligned text.",
      "Blank rows are dropped.",
    ],
    faq: [
      {
        q: "What makes the output accessible?",
        a: "The header row is emitted as `<th>` inside `<thead>`, which is what screen readers use to announce each cell's column. Add a `<caption>` yourself for a fuller description.",
      },
      {
        q: "Can data in the CSV inject HTML?",
        a: "No. `&`, `<`, `>`, `\"`, and `'` are escaped in every header and cell.",
      },
      {
        q: "How is this different from CSV Viewer?",
        a: "The markup is identical. CSV Viewer previews live as you type; this tool is aimed at producing markup you copy into a page.",
      },
    ],
    examples: [
      { label: "Small table", text: "name,role\nAda,Admin" },
      { label: "Tab-separated", text: "id\tvalue\n1\ttrue" },
    ],
  },
} as const satisfies ToolSpec;
