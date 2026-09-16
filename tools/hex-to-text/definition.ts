import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.hex-to-text",
  app: "devtools",
  category: "encoding-decoding",
  keywords: ["hex", "hexadecimal", "decode", "bytes", "utf-8", "hexdump", "convert"],
  name: "Hex to Text",
  description: "Decode hexadecimal bytes as UTF-8.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "Hex input",
    placeholder: "48 65 6c 6c 6f",
  },
  settings: { fields: {} },
  trigger: { mode: "manual", actionLabel: "Decode hex" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "0x>T", tone: "contrast" },
  labels: {
    empty: "Paste hexadecimal bytes to decode them as UTF-8.",
    ready: "Decoded UTF-8 text is ready.",
    running: "Decoding hexadecimal bytes…",
  },
  content: {
    howToUse: [
      "Paste the hex bytes. Separators are stripped for you, so `48 65 6c`, `48:65:6c`, `48-65-6c`, `0x48 0x65`, and `48656c` all work.",
      "Upper and lower case are both accepted and can be mixed.",
      "Decode to get the UTF-8 text. Text to Hex is the inverse.",
    ],
    limitations: [
      "The digits must form complete bytes. An odd number of hex digits is rejected rather than padded.",
      "Only `0x` prefixes, whitespace, colons, underscores, and hyphens are stripped. Other decoration — commas, `\\x`, `%` — is not, and will be reported as invalid.",
      "Bytes are decoded strictly as UTF-8. A sequence that is not valid UTF-8 is rejected rather than shown with replacement characters, so this will not decode Latin-1 or arbitrary binary.",
      "The output is text only; there is no download-as-binary path.",
    ],
    faq: [
      {
        q: "Can I paste output from `xxd` or a hex dump?",
        a: "Only the hex column. Offsets and the ASCII gutter are not hex bytes and will be rejected; strip them first.",
      },
      {
        q: "Why does it say the input is not valid UTF-8?",
        a: "The digits parsed into bytes, but those bytes are not a legal UTF-8 sequence — often Latin-1 text, or a multi-byte character that was cut short.",
      },
      {
        q: "Does it care about upper versus lower case?",
        a: "No. `4A` and `4a` are the same byte.",
      },
    ],
    examples: [{ label: "Text with an emoji", text: "48656c6c6f20f09f918b" }],
  },
} as const satisfies ToolSpec;
