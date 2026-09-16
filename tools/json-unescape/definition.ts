import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.json-unescape",
  app: "devtools",
  category: "json-tools",
  keywords: ["json", "unescape", "decode", "escape sequence", "backslash", "stringified"],
  name: "JSON Unescape",
  description: "Decode JSON string escape sequences.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "Escaped string",
    placeholder: 'He said \\"hello\\".\\nNext line.',
  },
  settings: { fields: {} },
  trigger: { mode: "manual", actionLabel: "Unescape" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "\\J", tone: "contrast" },
  labels: {
    empty: "Provide JSON-escaped string content to decode.",
    ready: "Unescaped text is ready.",
    running: "Decoding JSON escape sequences…",
  },
  content: {
    howToUse: [
      "Paste the contents of a JSON string — the part between the quotes, without the surrounding quotes.",
      'Run the tool to turn `\\n`, `\\t`, `\\"`, `\\\\`, and `\\uXXXX` back into the characters they stand for.',
      "This is the usual next step after pulling a stringified payload out of a log line or a database column.",
    ],
    limitations: [
      "Input is the string body only. Including the outer quotes makes them part of the value, and a stray unescaped quote is rejected as invalid string content.",
      'Only JSON escapes are understood: `\\b \\f \\n \\r \\t \\" \\\\ \\/` and `\\uXXXX`. Sequences such as `\\x41` or `\\u{1F600}` are not JSON and are rejected.',
      "A lone surrogate (for example `\\uD83D` with no low half) decodes to an unpaired surrogate character, which may display as a replacement glyph.",
      "This is the inverse of JSON Escape; it does not parse the result as JSON.",
    ],
    faq: [
      {
        q: "I get 'Escaped string is not valid JSON string content' — why?",
        a: 'Most often an unescaped double quote or a trailing lone backslash in the input, or a backslash sequence JSON does not define. Escape the quote as `\\"` and the backslash as `\\\\`.',
      },
      {
        q: "Should I include the wrapping quotes?",
        a: "No. Paste only what is inside them; the tool adds the quotes for you.",
      },
      {
        q: "My value is a stringified JSON object — what now?",
        a: "Unescape it here to recover the raw JSON text, then run that through JSON Formatter or JSON Validator.",
      },
    ],
    examples: [
      {
        label: "Quotes and a newline",
        text: 'He said \\"hello\\".\\nNext line.',
      },
    ],
  },
} as const satisfies ToolSpec;
