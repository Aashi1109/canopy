import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.csv-to-json",
  app: "devtools",
  category: "csv-data-tools",
  keywords: ["csv", "json", "convert", "parse", "spreadsheet", "delimiter", "records"],
  name: "CSV to JSON",
  description: "Convert delimited rows to a formatted JSON array.",
  input: {
    kind: "text",
    label: "CSV input",
    acceptFiles: {
      accept: ".csv,.tsv,text/csv,text/tab-separated-values",
      maxBytes: 104_857_600,
      maxEditableBytes: 2_000_000,
    },
    placeholder: "name,role,active\nMaya,Engineer,true\nNoah,Designer,false",
    maxLength: 2_000_000,
  },
  settings: {
    fields: {
      delimiter: {
        kind: "select",
        label: "Delimiter",
        help: "Separates fields in the source data.",
        default: ",",
        choices: [
          { label: "Comma", value: "," },
          { label: "Semicolon", value: ";" },
          { label: "Tab", value: "\t" },
          { label: "Pipe", value: "|" },
        ],
      },
      firstRowAsHeaders: {
        kind: "toggle",
        label: "First row as headers",
        help: "Use the first row as JSON property names.",
        default: true,
      },
      parseNumbers: {
        kind: "toggle",
        label: "Parse numbers",
        help: "Convert numeric cell values to JSON numbers.",
        default: false,
      },
      trimWhitespace: {
        kind: "toggle",
        label: "Trim whitespace",
        help: "Strip leading and trailing whitespace from cell values.",
        default: false,
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Convert to JSON" },
  capabilities: { copy: true, download: true },
  layout: "stacked",
  workbenchMark: { text: "C>J" },
  labels: {
    empty: "Paste CSV rows to convert them to JSON.",
    ready: "JSON is ready.",
    running: "Converting CSV to JSON…",
  },
  content: {
    howToUse: [
      "Paste CSV or other supported delimited text. Keep the header option on for an array of objects, or turn it off for an array of rows.",
      "Choose the delimiter and any value cleanup, then convert. Quoted fields may contain delimiters, escaped double quotes, and line breaks.",
      "Review the formatted array, check the row and column counts, then copy it or download data.json.",
    ],
    limitations: [
      "In header mode, every column needs a non-empty, unique header. All rows must contain the same number of fields.",
      "Cell values remain strings unless Parse numbers is enabled. Booleans, dates, and empty values are never inferred.",
      "Header mode returns flat objects; without headers, the result is an array of rows. Dotted headers remain literal keys.",
      "Editable input is limited to 2,000,000 characters; CSV and TSV files up to 100 MiB are converted as a stream with bounded preview output.",
    ],
    faq: [
      {
        q: "Can quoted fields contain commas or line breaks?",
        a: "Yes. Select the correct delimiter and wrap the field in double quotes. Represent a literal double quote inside it as two double quotes.",
      },
      {
        q: 'Why is true written as "true" in the JSON?',
        a: "CSV has no standard type metadata, so values stay as text by default. Parse numbers converts numeric cells only; booleans and dates remain text.",
      },
      {
        q: "Does it handle a UTF-8 BOM?",
        a: "Yes in header mode. A BOM at the start of the first header is removed.",
      },
      {
        q: "Is the CSV uploaded?",
        a: "No. Conversion runs locally in your browser.",
      },
    ],
    examples: [
      {
        label: "People and roles",
        text: "name,role\nMaya,Engineer\nNoah,Designer",
      },
      {
        label: "Quoted value",
        text: 'name,note\nMaya,"Hello, world"',
      },
    ],
  },
} as const satisfies ToolSpec;
