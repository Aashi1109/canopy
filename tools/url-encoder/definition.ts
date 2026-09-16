import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.url-encoder",
  app: "devtools",
  category: "encoding-decoding",
  keywords: ["url", "encode", "percent encoding", "escape", "query string", "uri", "encodeuricomponent"],
  name: "URL Encoder",
  description: "Percent-encode a URL or URL component.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "Text or URL",
    placeholder: "hello smart tools?active=true",
  },
  settings: {
    fields: {
      component: {
        kind: "toggle",
        label: "Encode component",
        help: "On encodes a single value — `?`, `&`, `=`, and `/` are escaped. Off encodes a whole URL and leaves that punctuation intact.",
        default: true,
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Encode" },
  capabilities: { copy: true },
  workbenchMark: { text: ">%" },
  labels: {
    empty: "Enter text or a URL to percent-encode it.",
    ready: "Percent-encoded value is ready.",
    running: "Percent-encoding input…",
  },
  content: {
    howToUse: [
      "Leave the toggle on when you are encoding one value that will be dropped into a query string or a path segment — that is the common case.",
      "Turn it off only when the input is already a complete URL and you want its structural characters left alone.",
      "Encode, then paste the result into the URL. Do not encode an already-encoded value: `%20` would become `%2520`.",
      "Non-ASCII text is encoded as UTF-8 percent triplets, which is what servers expect.",
    ],
    limitations: [
      "Component mode does not escape `!`, `'`, `(`, `)`, or `*`, which are legal in a URL but are sometimes rejected by strict OAuth 1.0 and RFC 3986 implementations. Encode those by hand if a signature check fails.",
      "Whole-URL mode leaves `?`, `&`, `=`, `#`, `/`, and `:` untouched, so it cannot make an arbitrary value safe — it only fixes spaces and non-ASCII characters in a URL that is otherwise already well-formed.",
      "The input is not validated as a URL. Junk in, percent-encoded junk out.",
      "This does not encode `+` as a space. Form-style `application/x-www-form-urlencoded` encoding is a different scheme.",
    ],
    faq: [
      {
        q: "Which mode do I want?",
        a: "Component, almost always. Switch it off only when you are encoding an entire URL as one string.",
      },
      {
        q: "Why is my space `%20` and not `+`?",
        a: "`%20` is the URL percent-encoding of a space. `+` is the form-encoding convention and applies only to `application/x-www-form-urlencoded` bodies.",
      },
      {
        q: "Can I decode with this tool?",
        a: "No — use the URL Decoder for the reverse direction.",
      },
    ],
    examples: [
      { label: "Value with punctuation", text: "hello smart tools?active=true" },
      { label: "Non-ASCII", text: "café & crème" },
    ],
  },
} as const satisfies ToolSpec;
