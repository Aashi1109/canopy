import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.json-schema-validator",
  app: "devtools",
  category: "json-tools",
  keywords: ["json schema", "validate", "validator", "schema", "required", "type check"],
  name: "JSON Schema Validator",
  description: "Validate JSON against common JSON Schema constraints.",
  layout: "stacked",
  input: {
    kind: "fields",
    label: "JSON data and schema",
    fields: [
      {
        channel: "text",
        label: "JSON data",
        placeholder: '{"name":"Ada","age":36}',
        required: true,
        multiline: true,
      },
      {
        channel: "secondary",
        label: "JSON schema",
        placeholder: '{"type":"object","required":["name"],"properties":{"name":{"type":"string"}}}',
        required: true,
        multiline: true,
      },
    ],
  },
  settings: { fields: {} },
  trigger: { mode: "manual", actionLabel: "Validate against schema" },
  capabilities: { copy: true },
  workbenchMark: { text: "JSV", tone: "contrast" },
  labels: {
    empty: "Paste JSON data and a schema to validate it.",
    ready: "JSON Schema validation is complete.",
    running: "Validating against JSON Schema…",
  },
  content: {
    howToUse: [
      "Paste the JSON document you want to check into the data field.",
      "Paste the JSON Schema into the schema field. Both must be strictly valid JSON — this tool does not repair either side.",
      "Validate. A pass returns a single line; a failure lists one problem per line, each prefixed with the JSON path that caused it.",
    ],
    limitations: [
      "A useful subset of JSON Schema is supported: type (including integer), enum, required, properties, items, minLength, maxLength, and pattern.",
      "Composition keywords ($ref, allOf, anyOf, oneOf, not), numeric bounds, and format assertions are not evaluated and are silently ignored.",
      'Because unsupported keywords are ignored, a "Valid against schema" result means "nothing checked here failed", not full draft compliance.',
    ],
    faq: [
      {
        q: "Which JSON Schema draft is this?",
        a: "None of them completely. It implements the structural keywords that most hand-written schemas actually use. For full draft 2020-12 conformance, run a dedicated validator in CI.",
      },
      {
        q: "Why is a nested error path written like $.user.roles[0].name?",
        a: "That is the location of the failing value inside your data, starting at the document root ($). Use it to jump straight to the offending field.",
      },
    ],
    examples: [
      {
        label: "Object with a required field",
        text: '{"name":"Ada","age":36}',
        secondary:
          '{"type":"object","required":["name"],"properties":{"name":{"type":"string"},"age":{"type":"number"}}}',
      },
    ],
  },
} as const satisfies ToolSpec;
