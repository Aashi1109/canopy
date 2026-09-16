import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.json-array-to-table",
  app: "devtools",
  category: "json-tools",
  keywords: ["json", "array", "table", "html", "flatten", "objects", "grid"],
  name: "JSON Array to Table",
  description: "Render an array of JSON objects as an HTML table.",
  input: {
    kind: "text",
    label: "JSON array",
    placeholder: '[{"name":"Ada","role":"Admin"},{"name":"Lin","role":"Editor"}]',
  },
  settings: {
    fields: {
      repairMode: {
        kind: "select",
        label: "Auto-fix broken JSON",
        help: "Truncated or hand-edited JSON is repaired before conversion. Turn this off to require strictly valid input.",
        default: "remove",
        choices: [
          {
            label: "Remove broken parts",
            value: "remove",
          },
          {
            label: "Set broken values to null",
            value: "null",
          },
          {
            label: "Off (strict)",
            value: "off",
          },
        ],
      },
    },
  },
  trigger: {
    mode: "manual",
    actionLabel: "Build table",
  },
  capabilities: {
    copy: true,
    download: true,
  },
  workbenchMark: { text: "J[]", tone: "contrast" },
  labels: {
    empty: "Paste an array of JSON objects to build a table.",
    ready: "HTML table is ready.",
    running: "Building HTML table…",
  },
  content: {
    howToUse: [
      "Paste a JSON array whose every element is an object — an API list response is the usual source.",
      "Build the table. Nested objects are flattened into dotted column names such as address.city, and the column set is the union of every row's keys.",
      "Copy the HTML into a page or a rich-text email. Every cell is HTML-escaped, so values containing < or & are safe to paste.",
    ],
    limitations: [
      "The input must be an array of objects. A bare object, an array of strings, or a mixed array is rejected.",
      "Arrays nested inside a row are not expanded into columns; they are stringified into a single cell.",
      "A missing key renders as an empty cell rather than being omitted, so every row has the full column set.",
      "No styling is emitted — the output is a plain table element for you to style.",
    ],
    faq: [
      {
        q: "Why are my columns named with dots?",
        a: 'Nested objects are flattened. {"address":{"city":"Lisbon"}} becomes a column called address.city.',
      },
      {
        q: "Is the output safe to inject into a page?",
        a: "Cell values are HTML-escaped, so text content cannot break out. Still render it in a context you control.",
      },
    ],
    examples: [
      {
        label: "List of records",
        text: '[{"name":"Ada","role":"Admin"},{"name":"Lin","role":"Editor"}]',
      },
    ],
  },
} as const satisfies ToolSpec;
