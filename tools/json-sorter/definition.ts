import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.json-sorter",
  app: "devtools",
  category: "json-tools",
  keywords: ["json", "sort", "keys", "alphabetical", "normalize", "diff"],
  name: "JSON Sorter",
  description: "Sort object keys recursively.",
  input: {
    kind: "text",
    label: "JSON input",
    placeholder: '{"z":1,"a":{"d":4,"b":2}}',
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
      indent: {
        kind: "select",
        label: "Indent",
        default: "2",
        choices: [
          {
            label: "2 spaces",
            value: "2",
          },
          {
            label: "4 spaces",
            value: "4",
          },
        ],
      },
    },
  },
  trigger: {
    mode: "manual",
    actionLabel: "Sort keys",
  },
  capabilities: {
    copy: true,
    download: true,
  },
  workbenchMark: { text: "JAZ", tone: "contrast" },
  labels: {
    empty: "Paste JSON to sort its keys.",
    ready: "Sorted JSON is ready.",
    running: "Sorting JSON keys…",
  },
  content: {
    howToUse: [
      "Paste the JSON whose keys you want in a stable order — this is what makes two config files diffable.",
      "Pick the indent width, then sort. Every object at every depth is reordered; array element order is left alone.",
      "Sort both sides of a comparison the same way before diffing them.",
    ],
    limitations: [
      "Array order is data, not formatting, so arrays are never reordered.",
      "Sorting uses localeCompare, so ordering can differ slightly between locales for non-ASCII keys.",
      "Duplicate keys are already collapsed by the parser before sorting can see them.",
    ],
    faq: [
      {
        q: "Does this change what my JSON means?",
        a: "No. Object key order is not significant in JSON, so a sorted document is equivalent to the original.",
      },
      {
        q: "Why are my arrays still unsorted?",
        a: "Array order carries meaning. Only object keys are reordered.",
      },
    ],
    examples: [
      {
        label: "Nested object",
        text: '{"z":1,"a":{"d":4,"b":2}}',
      },
    ],
  },
} as const satisfies ToolSpec;
