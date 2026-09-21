import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.html-decoder",
  app: "devtools",
  category: "encoding-decoding",
  keywords: ["html", "decode", "entities", "unescape", "amp", "nbsp", "numeric"],
  name: "HTML Decoder",
  description: "Decode named and numeric HTML entities.",
  layout: "stacked",
  outputLanguage: "html",
  input: {
    kind: "text",
    label: "Encoded entities",
    placeholder: "&lt;strong&gt;Tom &amp; Ada&lt;/strong&gt;",
  },
  settings: {
    fields: {},
  },
  trigger: {
    mode: "manual",
    actionLabel: "Decode entities",
  },
  capabilities: {
    copy: true,
  },
  workbenchMark: { text: "&;>", tone: "contrast" },
  labels: {
    empty: "Paste text containing HTML entities to decode it.",
    ready: "Decoded HTML text is ready.",
    running: "Decoding HTML entities…",
  },
  content: {
    howToUse: [
      "Paste text containing HTML entities — usually a value that was escaped once too often on its way through a template or an API.",
      "Decode. The five XML named entities plus &nbsp; are recognised, as are numeric forms in decimal (&#8212;) and hex (&#x2014;).",
      "Anything the decoder does not recognise is left exactly as it was, so a literal &copy; passes through untouched rather than being guessed at.",
    ],
    limitations: [
      "Only amp, apos, gt, lt, nbsp, and quot are supported by name. The full HTML5 named-entity table (over 2,000 names) is not included.",
      "Unrecognised entities are passed through verbatim rather than raising an error, so a partial decode is silent.",
      "Decoded output is plain text. Rendering it as HTML re-introduces whatever markup it contained — that is the point of the escaping you just removed.",
    ],
    faq: [
      {
        q: "Why was &copy; not decoded?",
        a: "Only the six most common names are supported. Use the numeric form &#169; instead.",
      },
      {
        q: "Is it safe to render the output?",
        a: "Treat it as untrusted. Decoding is the inverse of escaping, so anything you decode must be re-escaped before it goes back into a page.",
      },
    ],
    examples: [
      {
        label: "Escaped markup",
        text: "&lt;strong&gt;Tom &amp; Ada&lt;/strong&gt;",
      },
    ],
  },
} as const satisfies ToolSpec;
