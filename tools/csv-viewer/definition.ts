import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.csv-viewer",
  app: "devtools",
  category: "csv-data-tools",
  keywords: ["csv", "viewer", "table", "tsv", "delimited", "preview", "spreadsheet"],
  name: "CSV Viewer",
  description: "Render delimited data as an HTML table.",
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
        help: "Pick the character that separates fields. Semicolon is common in European exports; tab means the file is really TSV.",
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
  trigger: { mode: "live", debounceMs: 200 },
  capabilities: { copy: true },
  optionsPanel: { defaultCollapsed: true },
  workbenchMark: { text: "VIEW" },
  labels: {
    empty: "Paste delimited rows to preview them as a table.",
    ready: "CSV table preview is ready.",
    running: "Rendering table preview…",
  },
  content: {
    howToUse: [
      "Paste the delimited text. The first row is treated as the header and becomes the table's `<th>` cells.",
      "Set the delimiter to match your data. Getting it wrong is the usual reason a file appears as one giant column.",
      "The preview updates as you type. Every cell is HTML-escaped, so a value containing `<script>` shows as text and never executes.",
      "Quoted fields containing the delimiter, quotes, or newlines are parsed correctly — leave the quoting as your exporter wrote it.",
    ],
    limitations: [
      "Every row must have the same number of fields as the first row. A ragged file is rejected rather than padded.",
      "Files up to 100 MiB are validated completely in a worker while the table stays bounded to the first 1,000 data rows.",
      "There is no sorting, filtering, or column typing — this is a faithful preview, not a spreadsheet.",
      "Blank rows are dropped, and a UTF-8 BOM on the first header cell is not stripped here.",
    ],
    faq: [
      {
        q: "Why is everything in one column?",
        a: "The delimiter does not match the file. Switch between comma, semicolon, tab, and pipe until the columns split.",
      },
      {
        q: "Is my data uploaded?",
        a: "No. Parsing and rendering both happen in this browser tab.",
      },
      {
        q: "Can a malicious CSV inject HTML into the preview?",
        a: "No. Every header and cell is escaped before it is placed in the markup.",
      },
    ],
    examples: [
      { label: "Two data rows", text: "name,role\nAda,Admin\nLin,Editor" },
      { label: "Quoted field", text: 'name,note\nAda,"Hello, world"' },
    ],
  },
} as const satisfies ToolSpec;
