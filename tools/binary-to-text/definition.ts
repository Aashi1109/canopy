import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.binary-to-text",
  app: "devtools",
  category: "encoding-decoding",
  keywords: ["binary", "decode", "bits", "bytes", "ascii", "utf-8", "convert"],
  name: "Binary to Text",
  description: "Decode eight-bit binary bytes as UTF-8.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "Binary input",
    placeholder: "01001000 01101001",
  },
  settings: { fields: {} },
  trigger: { mode: "manual", actionLabel: "Decode binary" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "B>T" },
  labels: {
    empty: "Paste whitespace-separated eight-bit binary bytes to decode.",
    ready: "Decoded UTF-8 text is ready.",
    running: "Decoding binary bytes…",
  },
  content: {
    howToUse: [
      "Paste the bytes as groups of exactly eight 0s and 1s, separated by whitespace: `01001000 01101001`.",
      "Any whitespace works as a separator, so bytes split across several lines decode fine.",
      "Decode to get the UTF-8 text those bytes represent. Text to Binary is the inverse.",
    ],
    limitations: [
      "Every group must be exactly eight bits. Nibbles, 16-bit words, and unseparated bit streams are rejected rather than guessed at.",
      "The separator must be whitespace — commas, hyphens, and `0b` prefixes are not accepted.",
      "The bytes are decoded strictly as UTF-8. An invalid byte sequence is rejected instead of producing replacement characters, so this will not decode Latin-1 or arbitrary binary.",
      "A multi-byte character spans several groups: `👋` is four bytes and so four groups, in order.",
    ],
    faq: [
      {
        q: "My input has no spaces between the bytes. Can I still decode it?",
        a: "Not directly — the input must be whitespace-separated. Insert a space every eight characters first.",
      },
      {
        q: "Why does it say the input is not valid UTF-8?",
        a: "The groups parsed as bytes, but those bytes are not a legal UTF-8 sequence. A high byte such as `11100011` on its own, or an incomplete multi-byte character, will do it.",
      },
      {
        q: "Does it handle big-endian versus little-endian?",
        a: "Byte order does not apply: each group is one byte and the bytes are decoded in the order given.",
      },
    ],
    examples: [{ label: "Two ASCII bytes", text: "01001000 01101001" }],
  },
} as const satisfies ToolSpec;
