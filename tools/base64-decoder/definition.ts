import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.base64-decoder",
  app: "devtools",
  category: "encoding-decoding",
  keywords: ["base64", "decode", "base64url", "utf-8", "atob", "data uri"],
  name: "Base64 Decoder",
  description: "Decode Base64 text, images, and binary files.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "Base64 input",
    placeholder: "SGVsbG8g8J+Riw==",
  },
  settings: { fields: {} },
  trigger: { mode: "manual", actionLabel: "Decode" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "64-" },
  labels: {
    empty: "Paste Base64 to decode its contents.",
    ready: "Decoded content is ready.",
    running: "Decoding Base64…",
  },
  content: {
    howToUse: [
      "Paste the Base64 string. Standard and URL-safe alphabets both work, and missing `=` padding is added for you.",
      "Whitespace and line breaks inside the value are ignored, so a wrapped PEM-style block or a value copied across several lines decodes fine.",
      "Decode, then copy text or preview and download the decoded file.",
    ],
    limitations: [
      "Recognized PNG, JPEG, and WebP images are previewed. Other binary payloads are downloaded as `decoded.bin`.",
      "Base64 data URIs are accepted directly; the encoded body is extracted automatically.",
      "A JWT is three Base64url segments joined by dots. Paste one segment, or use the JWT Decoder for the whole token.",
      "Invalid characters or a length that cannot be padded to a multiple of four are rejected with 'Base64 input is invalid.'",
    ],
    faq: [
      {
        q: "Do I need to convert Base64url to standard Base64 first?",
        a: "No. `-` and `_` are translated automatically and the padding is restored, so Base64url values decode as-is.",
      },
      {
        q: "What happens when the result is not text?",
        a: "Recognized images are previewed. Any other binary payload is preserved and offered as a download.",
      },
      {
        q: "Is my data uploaded?",
        a: "No. Decoding happens entirely in this browser tab.",
      },
    ],
    examples: [{ label: "Text with an emoji", text: "SGVsbG8g8J+Riw==" }],
  },
} as const satisfies ToolSpec;
