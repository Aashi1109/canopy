import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.json-to-csv",
  app: "devtools",
  category: "json-tools",
  keywords: ["json", "csv", "convert", "spreadsheet", "flatten", "delimiter", "tabular data"],
  name: "JSON to CSV",
  description: "Convert JSON object records to spreadsheet-ready CSV.",
  outputLanguage: "csv",
  resultStats: "status-only",
  input: {
    kind: "text",
    language: "json",
    label: "JSON input",
    placeholder: '[{"name":"Maya","role":"Engineer"},{"name":"Noah","role":"Designer"}]',
    maxLength: 2_000_000,
  },
  settings: {
    fields: {
      repairMode: {
        kind: "select",
        label: "Auto-fix broken JSON",
        help: "Repairs missing property values before conversion. Turn this off to require strictly valid JSON.",
        default: "remove",
        choices: [
          { label: "Remove broken properties", value: "remove" },
          { label: "Set broken values to null", value: "null" },
          { label: "Off (strict)", value: "off" },
        ],
      },
      delimiter: {
        kind: "select",
        label: "Delimiter",
        help: "Separates columns in the generated file.",
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
  trigger: { mode: "manual", actionLabel: "Convert to CSV" },
  capabilities: { copy: true, download: true },
  layout: "side-by-side",
  workbenchMark: { text: "J>C" },
  labels: {
    empty: "Paste a JSON object or array of objects to convert it to CSV.",
    ready: "CSV is ready.",
    running: "Converting JSON to CSV…",
  },
  content: {
    howToUse: [
      "Paste one JSON object or an array of objects. Each object becomes one CSV row.",
      "Choose the delimiter your spreadsheet or downstream system expects. Auto-fix can remove properties with missing values, replace those values with null, or require strict JSON.",
      "Convert, check the reported row and column counts, then copy the CSV or download data.csv.",
    ],
    limitations: [
      "The top-level value must be an object or an array containing only objects; primitives and mixed arrays are rejected.",
      "Nested objects are flattened to dotted headers such as profile.city. Nested arrays remain in one cell as JSON text.",
      "Columns are the union of keys found across all records, in first-seen order. A missing key produces an empty cell.",
      "Input is limited to 2,000,000 characters. JSON numbers are parsed by JavaScript, so integers beyond 2^53 may lose precision.",
    ],
    faq: [
      {
        q: "When does a CSV value get quoted?",
        a: "A cell is quoted when it contains the selected delimiter, a double quote, or a line break. Double quotes inside the cell are escaped by doubling them.",
      },
      {
        q: "What does auto-fix repair?",
        a: 'It only handles object properties whose value is missing, such as {"name":}. Other invalid JSON is rejected.',
      },
      {
        q: "Is the JSON uploaded?",
        a: "No. Conversion runs locally in your browser.",
      },
    ],
    examples: [
      {
        label: "Two records",
        text: '[{"name":"Maya","role":"Engineer"},{"name":"Noah","role":"Designer"}]',
      },
      {
        label: "Nested record",
        text: '{"name":"Maya","profile":{"city":"Pune","team":"Platform"}}',
      },
    ],
  },
} as const satisfies ToolSpec;
