import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.json-escape",
  app: "devtools",
  category: "json-tools",
  keywords: ["json", "escape", "string", "quote", "backslash", "stringify", "encode"],
  name: "JSON Escape",
  description: "Escape a raw string for use inside JSON.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "Raw string",
    placeholder: 'He said "hello".\nNext line.',
  },
  settings: { fields: {} },
  trigger: { mode: "manual", actionLabel: "Escape" },
  capabilities: { copy: true },
  workbenchMark: { text: "J\\", tone: "contrast" },
  labels: {
    empty: "Paste the raw text you want to embed in JSON.",
    ready: "Escaped string is ready.",
    result: "Escaped text",
    running: "Escaping text for JSON…",
  },
  content: {
    howToUse: [
      "Paste the raw text exactly as it is — including newlines, tabs, and quotes.",
      'Escape. Quotes become `\\"`, backslashes become `\\\\`, and newlines become `\\n`.',
      "Copy the result and paste it between the quotes of a JSON string value. The surrounding quotes are not included, so you add them yourself.",
    ],
    limitations: [
      "The output is the escaped body only, without the wrapping double quotes.",
      "Non-ASCII characters are left as literal UTF-8, not converted to `\\uXXXX` escapes. That is valid JSON, but some strict consumers prefer the escaped form.",
      "This escapes for JSON only. It is not sufficient to make a string safe for HTML, SQL, or a shell.",
    ],
    faq: [
      {
        q: "Why are there no quotes around the result?",
        a: 'So you can drop it straight into an existing string literal. Add `"` on both sides if you need a complete JSON value.',
      },
      {
        q: "How do I reverse this?",
        a: "Use a JSON unescape tool, or wrap the text in quotes and run it through `JSON.parse`.",
      },
      {
        q: "Are emoji and accented characters handled?",
        a: "Yes — they pass through as UTF-8, which is valid inside a JSON string.",
      },
    ],
    examples: [
      { label: "Quotes and a newline", text: 'He said "hello".\nNext line.' },
      { label: "Windows path", text: "C:\\Users\\ada\\notes.txt" },
    ],
  },
} as const satisfies ToolSpec;
