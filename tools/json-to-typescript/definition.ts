import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.json-to-typescript",
  app: "devtools",
  category: "json-tools",
  keywords: ["json", "typescript", "interface", "types", "codegen", "schema", "dto"],
  name: "JSON to TypeScript",
  description: "Generate TypeScript interfaces from sample JSON.",
  input: {
    kind: "text",
    label: "JSON input",
    placeholder: '{"name":"Ada","active":true,"tags":["admin"]}',
  },
  settings: {
    fields: {
      repairMode: {
        kind: "select",
        label: "Auto-fix broken JSON",
        help: "Sample payloads copied from a log are often not strict JSON. Repair fixes trailing commas, comments, and single quotes before inference.",
        default: "remove",
        choices: [
          { label: "Remove broken parts", value: "remove" },
          { label: "Set broken values to null", value: "null" },
          { label: "Off (strict)", value: "off" },
        ],
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Generate types" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "J>TS", tone: "contrast" },
  labels: {
    empty: "Paste a sample JSON payload to generate interfaces.",
    ready: "TypeScript interfaces are ready.",
    running: "Generating TypeScript interfaces…",
  },
  content: {
    howToUse: [
      "Paste one representative JSON response. The shape of that single sample is what the interfaces describe, so pick a record with every optional field populated.",
      "Leave auto-fix on if the sample came from a log or a JS object literal; switch it to strict when you want malformed input rejected instead of silently repaired.",
      "Generate, then copy the interfaces into your codebase. The root interface is named `Root` — rename it to something meaningful.",
      "Re-run with a second sample if any field can be null or missing, and widen the generated types by hand where the samples disagree.",
    ],
    limitations: [
      "Types are inferred from one sample only. A field that is `null` in the sample becomes `null`, not `string | null`, and a field absent from the sample does not appear at all.",
      "Arrays are typed as the union of their observed element types. An empty array becomes `unknown[]`.",
      "No optional (`?`) markers are emitted, because a single sample cannot show which keys are optional.",
      "Nested objects reuse the property name for the interface name, so two differently-shaped objects under the same key name will collide.",
    ],
    faq: [
      {
        q: "Why are my fields not optional?",
        a: "One sample cannot distinguish 'always present' from 'present this time'. Add `?` by hand to any key the API may omit.",
      },
      {
        q: "Where did the root interface name come from?",
        a: "The root is always `Root`, and nested interfaces take their name from the property that holds them, converted to PascalCase.",
      },
      {
        q: "Does my JSON leave the browser?",
        a: "No. Inference runs entirely in this tab.",
      },
    ],
    examples: [
      {
        label: "Object with an array",
        text: '{"name":"Ada","active":true,"tags":["admin"]}',
      },
      {
        label: "Nested object",
        text: '{"id":1,"profile":{"email":"ada@example.com","verified":false}}',
      },
    ],
  },
} as const satisfies ToolSpec;
