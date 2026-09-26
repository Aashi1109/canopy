import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.base64-encoder",
  sharing: { version: 1 },
  app: "devtools",
  category: "encoding-decoding",
  keywords: ["base64", "encode", "url safe", "base64url", "utf-8", "data uri"],
  name: "Base64 Encoder",
  description: "Encode UTF-8 text as Base64.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "Text input",
    placeholder: "Hello 👋",
  },
  settings: {
    fields: {
      urlSafe: {
        kind: "toggle",
        label: "URL-safe",
        help: "Emit base64url: + becomes -, / becomes _, and the = padding is dropped.",
        default: false,
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Encode" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "64+" },
  labels: {
    empty: "Enter text to encode it as Base64.",
    ready: "Base64 text is ready.",
    running: "Encoding text as Base64…",
  },
  content: {
    howToUse: [
      "Paste the text to encode. It is treated as UTF-8, so emoji and non-Latin scripts encode correctly.",
      "Leave URL-safe off for standard Base64 (the RFC 4648 alphabet with = padding).",
      "Turn URL-safe on when the value goes in a URL path, a query string, or a JWT segment.",
    ],
    limitations: [
      "Text only. Binary files cannot be pasted here — encode those with a file-aware tool.",
      "Base64 is an encoding, not encryption. Anyone can decode the output; never use it to hide a secret.",
      "Encoding inflates the payload by roughly one third.",
    ],
    faq: [
      {
        q: "When do I need the URL-safe variant?",
        a: "Whenever + and / would be reinterpreted — URL paths, query parameters, filenames, and JWT header/payload segments all use base64url.",
      },
      {
        q: "Does my text leave the browser?",
        a: "No. Encoding happens locally in this tab.",
      },
    ],
    examples: [{ label: "Text with an emoji", text: "Hello 👋" }],
  },
} as const satisfies ToolSpec;
