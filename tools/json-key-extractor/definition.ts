import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.json-key-extractor",
  app: "devtools",
  category: "json-tools",
  keywords: ["json", "keys", "paths", "extract", "schema", "flatten"],
  name: "JSON Key Extractor",
  description: "List every object key path in JSON.",
  layout: "side-by-side",
  input: {
    kind: "text",
    language: "json",
    label: "JSON input",
    placeholder: '{"user":{"name":"Ada","roles":["admin"]}}',
  },
  settings: {
    fields: {
      repairMode: {
        kind: "select",
        label: "Auto-fix broken JSON",
        help: "How to handle values the parser cannot recover: drop them, null them, or refuse the input outright.",
        default: "remove",
        choices: [
          { label: "Remove broken parts", value: "remove" },
          { label: "Set broken values to null", value: "null" },
          { label: "Off (strict)", value: "off" },
        ],
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Extract keys" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "J.K", tone: "contrast" },
  labels: {
    empty: "Paste JSON to list its key paths.",
    ready: "Key paths are ready.",
    running: "Extracting JSON key paths…",
  },
  content: {
    howToUse: [
      "Paste a JSON document — an API response, a config file, or a sample record.",
      "Extract. Every distinct object key path is listed once, in the order it was first encountered.",
      "Array traversal is collapsed: an element path is written as parent[].child, so a thousand-item array still yields one line per field.",
    ],
    limitations: [
      "Only object keys are listed. Scalar values, array indices, and array lengths are not reported.",
      "Paths are deduplicated across the whole document, so two array elements with different shapes produce the union of their keys with no indication of which element had which.",
      "A key containing a dot or a bracket is emitted literally, which makes its path ambiguous to re-parse.",
    ],
    faq: [
      {
        q: "Why does the output use [] instead of an index?",
        a: "Because the point is the shape, not the data. Collapsing indices turns a large array into a single set of field paths you can scan.",
      },
      {
        q: "Can I use this to build a schema?",
        a: "It is a good starting point for one — it tells you every field name that exists — but it does not report types or optionality.",
      },
    ],
    examples: [
      {
        label: "Nested object with an array",
        text: '{"user":{"name":"Ada","roles":[{"name":"Admin"}]}}',
      },
    ],
  },
} as const satisfies ToolSpec;
