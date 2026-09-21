import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.json-to-yaml",
  app: "devtools",
  category: "json-tools",
  keywords: ["json", "yaml", "convert", "config", "kubernetes", "serialize"],
  name: "JSON to YAML",
  description: "Convert JSON values to YAML.",
  outputLanguage: "yaml",
  input: {
    kind: "text",
    language: "json",
    label: "JSON input",
    placeholder: '{"name":"Ada","active":true}',
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
    actionLabel: "Convert to YAML",
  },
  capabilities: {
    copy: true,
    download: true,
  },
  workbenchMark: { text: "J>Y", tone: "contrast" },
  labels: {
    empty: "Paste JSON to convert it to YAML.",
    ready: "YAML is ready.",
    running: "Converting to YAML…",
  },
  content: {
    howToUse: [
      "Paste the JSON document you want as YAML. Conversion runs locally.",
      "Leave auto-fix on if the JSON was copied from a log or truncated response; turn it off when you need the input validated strictly.",
      "Copy the YAML into your config file. Key order is preserved exactly as it appeared in the JSON.",
    ],
    limitations: [
      "Anchors and aliases are not emitted — repeated structures are written out in full.",
      "Only JSON's value types round-trip: dates, comments, and multi-document YAML have no JSON source to come from.",
      "Very deep or very large documents produce long output; YAML's indentation grows with nesting depth.",
    ],
    faq: [
      {
        q: "Is key order preserved?",
        a: "Yes. Keys are emitted in the order the JSON declared them rather than sorted.",
      },
      {
        q: "Can I convert YAML back to JSON?",
        a: "Yes — the YAML to JSON tool does the reverse.",
      },
    ],
    examples: [
      {
        label: "Flat object",
        text: '{"name":"Ada","active":true}',
      },
    ],
  },
} as const satisfies ToolSpec;
