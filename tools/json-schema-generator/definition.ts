import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.json-schema-generator",
  app: "devtools",
  category: "json-tools",
  keywords: ["json schema", "schema", "infer", "validation", "draft", "contract", "sample data"],
  name: "JSON Schema Generator",
  description: "Infer a JSON Schema from sample data.",
  outputLanguage: "json",
  input: {
    kind: "text",
    language: "json",
    label: "Sample JSON",
    placeholder: '{"id":1,"name":"Ada","tags":["admin"]}',
  },
  settings: {
    fields: {
      repairMode: {
        kind: "select",
        label: "Auto-fix broken JSON",
        help: "How to handle properties whose value is missing or unparseable.",
        default: "remove",
        choices: [
          { label: "Remove broken parts", value: "remove" },
          { label: "Set broken values to null", value: "null" },
          { label: "Off (strict)", value: "off" },
        ],
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Generate schema" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "JSG", tone: "contrast" },
  labels: {
    empty: "Paste a representative JSON sample to infer a schema.",
    ready: "JSON Schema is ready.",
    running: "Inferring JSON Schema…",
  },
  content: {
    howToUse: [
      "Paste one representative JSON document — the schema is inferred from exactly what you give it, so include the optional fields you care about.",
      "Generate, then read the result as a starting point rather than a finished contract.",
      "Loosen it by hand: every key lands in `required` and every object gets `additionalProperties: false`, which is stricter than most real APIs want.",
    ],
    limitations: [
      "The schema describes one sample. Fields absent from that sample cannot be inferred, and fields present in it are always marked required.",
      "No `$schema`, `title`, `description`, `format`, or constraint keywords (minLength, pattern, enum) are emitted — types and structure only.",
      "Arrays are summarised by the union of their element schemas: a homogeneous array gets a single `items` schema, a mixed one gets `items.anyOf`. An empty array yields `anyOf: []`, which matches nothing.",
      "Numbers are split into `integer` and `number` by the sampled value, so 10 infers `integer` even when the field can hold 10.5.",
    ],
    faq: [
      {
        q: "Which JSON Schema draft is this?",
        a: "The output uses keywords common to draft-07 and 2020-12 (type, properties, required, items, anyOf, additionalProperties). No `$schema` is declared, so add the draft your validator expects.",
      },
      {
        q: "Why is every field required?",
        a: "Optionality cannot be inferred from a single sample. Delete the keys that are genuinely optional from the `required` array.",
      },
      {
        q: "How do I handle a field that can be null?",
        a: 'Sample data with a non-null value, then widen that property by hand to `{ "anyOf": [ …, { "type": "null" } ] }`.',
      },
    ],
    examples: [
      {
        label: "Object with an array",
        text: '{"id":1,"name":"Ada","tags":["admin"]}',
      },
    ],
  },
} as const satisfies ToolSpec;
