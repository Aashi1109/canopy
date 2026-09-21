import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.tsv-to-csv",
  app: "devtools",
  category: "csv-data-tools",
  keywords: ["tsv", "csv", "convert", "tab", "spreadsheet", "delimited"],
  name: "TSV to CSV",
  description: "Convert tab-separated values to CSV.",
  outputLanguage: "csv",
  input: {
    kind: "text",
    language: "tsv",
    label: "TSV input",
    surface: "card",
    acceptFiles: {
      accept: ".csv,.tsv,text/csv,text/tab-separated-values",
      maxBytes: 104_857_600,
      maxEditableBytes: 2_000_000,
    },
    placeholder: "name\tage\nAda\t36",
  },
  settings: {
    fields: {},
  },
  trigger: {
    mode: "manual",
    actionLabel: "Convert to CSV",
  },
  capabilities: {
    copy: true,
    download: true,
  },
  workbenchMark: { text: "T>C" },
  labels: {
    empty: "Enter tab-separated rows to convert them to CSV.",
    ready: "CSV output is ready.",
    running: "Converting TSV to CSV…",
  },
  content: {
    howToUse: [
      "Copy a range straight out of a spreadsheet — the clipboard format is already tab-separated — and paste it here.",
      "Convert. Fields containing a comma, a quote, or a line break are quoted and their quotes doubled, so the CSV survives a round trip.",
      "Copy or download the result.",
    ],
    limitations: [
      "Every row must have the same number of fields. A ragged paste is rejected rather than silently padded.",
      "The output always uses a comma. Use the delimiter converter if you need semicolons for a locale that treats the comma as a decimal separator.",
      "No BOM is written. Some spreadsheet apps need one to detect UTF-8 — add it in your editor if accents come out wrong.",
    ],
    faq: [
      {
        q: "Why was my input rejected?",
        a: "Rows had differing field counts. A tab inside a value, or a trailing tab on one line, is the usual cause.",
      },
      {
        q: "Are quotes handled?",
        a: "Yes. Values containing a comma, a double quote, or a newline are wrapped in quotes with inner quotes doubled.",
      },
    ],
    examples: [
      {
        label: "Two columns",
        text: "name\tage\nAda\t36",
      },
    ],
  },
} as const satisfies ToolSpec;
