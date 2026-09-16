import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.duplicate-word-remover",
  app: "devtools",
  category: "text-tools",
  keywords: ["duplicate", "words", "remove", "dedupe", "unique", "text", "clean"],
  name: "Duplicate Word Remover",
  description: "Remove repeated words while preserving first occurrences.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "Text input",
    placeholder: "smart tools make tools simple",
  },
  settings: {
    fields: {},
  },
  trigger: {
    mode: "manual",
    actionLabel: "Remove duplicates",
  },
  capabilities: {
    copy: true,
  },
  workbenchMark: { text: "WD-" },
  labels: {
    empty: "Paste text to remove repeated words.",
    ready: "Text without repeated words is ready.",
    running: "Removing repeated words…",
  },
  content: {
    howToUse: [
      "Paste the text. Keyword lists, tag strings, and generated prose are the usual candidates.",
      "Run the tool. The first occurrence of each word is kept and every later repeat is dropped; the surviving words stay in their original order.",
      "Matching ignores case, so Smart and smart count as the same word and only the first spelling survives.",
    ],
    limitations: [
      "Words are compared including any attached punctuation, so tools, and tools are treated as different words.",
      "This removes repeated words across the whole text, not repeated adjacent words. It will change the meaning of ordinary prose — it is a list-cleaning tool.",
      "Runs of whitespace between surviving words collapse to a single space, and leading and trailing whitespace is trimmed.",
    ],
    faq: [
      {
        q: "Is matching case-sensitive?",
        a: "No. The comparison is lowercased, so the first-seen capitalisation is the one kept.",
      },
      {
        q: "Why did my sentence stop making sense?",
        a: "Every repeat is removed globally, including articles and prepositions. Use it on keyword and tag lists rather than prose.",
      },
    ],
    examples: [
      {
        label: "Repeated keywords",
        text: "smart tools make tools simple and smart",
      },
    ],
  },
} as const satisfies ToolSpec;
