import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.yaml-to-json",
  app: "devtools",
  category: "json-tools",
  keywords: ["yaml", "json", "convert", "yml", "config", "parser"],
  name: "YAML to JSON",
  description: "Convert YAML documents to formatted JSON.",
  outputLanguage: "json",
  input: {
    kind: "text",
    language: "yaml",
    label: "YAML input",
    placeholder: "name: Ada\nactive: true",
  },
  settings: { fields: {} },
  trigger: { mode: "manual", actionLabel: "Convert to JSON" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "Y>J" },
  labels: {
    empty: "Enter YAML to convert it to JSON.",
    ready: "Converted JSON is ready.",
    running: "Converting YAML to JSON…",
  },
  content: {
    howToUse: [
      "Paste a YAML document. Indentation is significant, so copy it verbatim rather than retyping it.",
      "Convert. The result is JSON pretty-printed with a two-space indent.",
      "Copy the JSON, or download it if you are feeding it into a config loader or a fixture file.",
    ],
    limitations: [
      "Only the first document of a multi-document stream (separated by ---) is converted.",
      "YAML anchors and aliases are expanded, so shared structure becomes duplicated JSON.",
      "YAML types with no JSON equivalent — dates, binary, custom tags — are not representable and will either stringify or fail.",
    ],
    faq: [
      {
        q: "Why does my YAML fail to parse?",
        a: "Almost always indentation: tabs are not valid YAML indentation, and a single misaligned key breaks the block. The error message names the line.",
      },
      {
        q: "Is my YAML uploaded anywhere?",
        a: "No. The conversion runs entirely in this browser tab.",
      },
    ],
    examples: [{ label: "Simple mapping", text: "name: Ada\nactive: true" }],
  },
} as const satisfies ToolSpec;
