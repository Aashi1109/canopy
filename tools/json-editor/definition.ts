import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.json-editor",
  app: "devtools",
  category: "json-tools",
  keywords: ["json", "editor", "format", "repair", "pretty print", "indent"],
  name: "JSON Editor",
  description: "Repair and consistently format editable JSON.",
  input: {
    kind: "text",
    label: "JSON input",
    placeholder: '{"name":"Ada","active":true}',
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
      indent: {
        kind: "select",
        label: "Indent",
        default: "2",
        choices: [
          { label: "2 spaces", value: "2" },
          { label: "4 spaces", value: "4" },
        ],
      },
    },
  },
  trigger: { mode: "live" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "JED", tone: "contrast" },
  labels: {
    empty: "Paste JSON to repair and reformat it.",
    ready: "Formatted JSON is ready.",
    running: "Formatting JSON…",
  },
  content: {
    howToUse: [
      "Paste JSON — including hand-edited JSON with trailing commas, single quotes, or unquoted keys.",
      "Leave auto-fix on to salvage a broken document, or switch it to Off (strict) when you need to know whether the input is genuinely valid.",
      "Pick a two- or four-space indent to match your project's formatter, then copy the result.",
    ],
    limitations: [
      "Auto-fix is a best-effort repair. Removing or nulling a broken value changes the data, so review the output before committing it.",
      "Key order is preserved exactly; this tool formats, it does not sort.",
      "Comments are not part of JSON and do not survive the round trip.",
    ],
    faq: [
      {
        q: "What is the difference between the two auto-fix modes?",
        a: '"Remove broken parts" drops the unrecoverable key or element entirely; "Set broken values to null" keeps the key and gives it a null value. Use the second when downstream code expects the key to exist.',
      },
      {
        q: "How do I check whether my JSON is actually valid?",
        a: "Set auto-fix to Off (strict). The tool then either formats the input unchanged or reports a parse error.",
      },
    ],
    examples: [
      { label: "Hand-edited JSON", text: "{ name: 'Ada', active: true, }" },
      { label: "Minified JSON", text: '{"name":"Ada","roles":["admin","owner"]}' },
    ],
  },
} as const satisfies ToolSpec;
