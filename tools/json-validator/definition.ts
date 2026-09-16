import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.json-validator",
  app: "devtools",
  category: "json-tools",
  keywords: ["json", "validator", "syntax", "lint", "parse", "check"],
  name: "JSON Validator",
  description: "Validate JSON syntax and report its root type.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "JSON input",
    acceptFiles: {
      accept: ".json,application/json,text/json",
      maxBytes: 104_857_600,
      maxEditableBytes: 2_000_000,
    },
    placeholder: '{"valid":true}',
  },
  settings: {
    fields: {},
  },
  trigger: {
    mode: "manual",
    actionLabel: "Validate",
  },
  capabilities: {
    copy: true,
  },
  workbenchMark: { text: "JOK", tone: "contrast" },
  labels: {
    empty: "Provide JSON to validate its syntax.",
    ready: "JSON is valid.",
    running: "Validating JSON…",
  },
  content: {
    howToUse: [
      "Paste the JSON you want to check. Nothing is uploaded — parsing happens in this browser tab.",
      "Run the validator. Valid input reports the root type (object, array, string, number, boolean, or null).",
      "Invalid input reports the parser's own message, which names the character position where parsing stopped.",
      "Fix the first reported error and re-run: a single stray comma usually cascades into several later complaints.",
    ],
    limitations: [
      "This is a strict JSON.parse check. Comments, trailing commas, single quotes, and NaN/Infinity are all rejected — use the JSON formatter's repair mode if you need those tolerated.",
      "Only syntax is checked. Validating a document against a JSON Schema is a separate tool.",
      "Duplicate object keys are not reported; JSON.parse silently keeps the last one.",
    ],
    faq: [
      {
        q: "Why is my JSON rejected when my editor accepts it?",
        a: "Editors often accept JSON5 or JSONC. Strict JSON has no comments, no trailing commas, and requires double-quoted keys.",
      },
      {
        q: "What does 'root type' mean?",
        a: "The type of the outermost value. A JSON document does not have to be an object — a bare string or number is valid JSON too.",
      },
    ],
    examples: [
      {
        label: "Minimal object",
        text: '{"valid":true}',
      },
    ],
  },
} as const satisfies ToolSpec;
