import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.url-decoder",
  app: "devtools",
  category: "encoding-decoding",
  keywords: ["url", "decode", "percent encoding", "uri", "query string", "unescape"],
  name: "URL Decoder",
  description: "Decode percent-encoded URL text.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "Encoded input",
    placeholder: "hello%20smart%20tools%3Factive%3Dtrue",
  },
  settings: {
    fields: {},
  },
  trigger: {
    mode: "manual",
    actionLabel: "Decode",
  },
  capabilities: {
    copy: true,
  },
  workbenchMark: { text: "%>" },
  labels: {
    empty: "Enter percent-encoded text to decode it.",
    ready: "Decoded text is ready.",
    running: "Decoding percent-encoded text…",
  },
  content: {
    howToUse: [
      "Paste the percent-encoded text — a whole URL, a single query parameter, or a redirect target pulled out of a log.",
      "Decode. %20 becomes a space, %3F a question mark, and multi-byte UTF-8 sequences such as %F0%9F%91%8B are reassembled into the original character.",
      "If the value was encoded twice, decode the output a second time.",
    ],
    limitations: [
      "This is decodeURIComponent, so it decodes reserved characters too. Running it over a full URL will turn an encoded ? or & inside a parameter into a real delimiter.",
      "A + is left as a plus sign. Form-encoded bodies use + for a space and need that replaced first.",
      "An incomplete or invalid escape such as %zz or a trailing % is rejected rather than passed through.",
    ],
    faq: [
      {
        q: "Why is my + still a plus?",
        a: "Percent-encoding and form encoding are different. application/x-www-form-urlencoded uses + for space; replace + with a space before decoding those.",
      },
      {
        q: "Why did decoding fail?",
        a: "The text contains a malformed escape — a % not followed by two hex digits, or a byte sequence that is not valid UTF-8.",
      },
    ],
    examples: [
      {
        label: "Encoded query",
        text: "hello%20smart%20tools%3Factive%3Dtrue",
      },
    ],
  },
} as const satisfies ToolSpec;
