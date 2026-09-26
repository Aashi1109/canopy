import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.text-to-hex",
  sharing: { version: 1 },
  app: "devtools",
  category: "encoding-decoding",
  keywords: ["hex", "hexadecimal", "encode", "utf-8", "bytes", "dump"],
  name: "Text to Hex",
  description: "Encode UTF-8 text as hexadecimal bytes.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "Text input",
    placeholder: "Hello 👋",
  },
  settings: { fields: {} },
  trigger: { mode: "manual", actionLabel: "Encode as hex" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "T>0x" },
  labels: {
    empty: "Enter text to encode as UTF-8 hexadecimal.",
    ready: "Hexadecimal bytes are ready.",
    running: "Encoding text as hexadecimal…",
  },
  content: {
    howToUse: [
      "Paste the text you want to inspect as bytes.",
      "Encode. Each byte of the UTF-8 encoding becomes two lowercase hex digits, with no separators.",
      "Use it to check exactly what is on the wire — an invisible BOM, a non-breaking space, or a trailing newline all show up here.",
    ],
    limitations: [
      "Output is lowercase and unseparated. Tools that expect spaced or 0x-prefixed bytes need the string reformatted.",
      "The encoding is always UTF-8; there is no option for UTF-16 or a legacy single-byte codepage.",
      "Text only — binary input cannot be pasted accurately.",
    ],
    faq: [
      {
        q: "Why is one character several bytes?",
        a: "UTF-8 is variable width. ASCII is one byte, most accented and Greek/Cyrillic letters are two, most CJK is three, and emoji are four.",
      },
      {
        q: "How do I spot a hidden character?",
        a: "Look for efbbbf (a byte-order mark), c2a0 (a non-breaking space), or a trailing 0a / 0d0a newline.",
      },
    ],
    examples: [{ label: "Text with an emoji", text: "Hello 👋" }],
  },
} as const satisfies ToolSpec;
