import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.unicode-encoder",
  app: "devtools",
  category: "encoding-decoding",
  keywords: ["unicode", "escape", "code point", "utf-16", "encode", "ascii", "emoji"],
  name: "Unicode Encoder",
  description: "Encode text as Unicode code-point escapes.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "Text input",
    placeholder: "Hello 👋",
  },
  settings: { fields: {} },
  trigger: { mode: "manual", actionLabel: "Encode Unicode" },
  capabilities: { copy: true },
  workbenchMark: { text: ">\\u" },
  labels: {
    empty: "Enter text to encode non-ASCII characters as Unicode escapes.",
    ready: "Unicode-escaped text is ready.",
    running: "Encoding text as Unicode escapes…",
  },
  content: {
    howToUse: [
      "Paste text containing accents, symbols, or emoji.",
      "Encode. Printable ASCII passes through unchanged, so the result stays readable; only characters above U+007F are escaped.",
      "Characters in the Basic Multilingual Plane become `\\uXXXX`. Anything above U+FFFF — most emoji — becomes the ES6 `\\u{...}` form.",
      "Use this when a file, config, or protocol must be ASCII-only, or to make an invisible character visible while debugging.",
    ],
    limitations: [
      "The `\\u{...}` form for astral characters is ES6 JavaScript syntax. It is not valid in JSON, in older JavaScript, or in most other languages — those need a surrogate pair instead.",
      "ASCII control characters (tab, newline, carriage return) are below U+007F and so pass through as literal characters rather than being escaped.",
      "Escaping is unconditional above U+007F; there is no option to escape everything, or to escape only selected ranges.",
      "Output is lowercase hexadecimal with no option to change the case.",
    ],
    faq: [
      {
        q: "Why do I get `\\u{1f44b}` instead of two `\\uXXXX` escapes?",
        a: "The character is above U+FFFF, so it is emitted as a single code point in the ES6 form rather than as a UTF-16 surrogate pair.",
      },
      {
        q: "Can I paste this into JSON?",
        a: "Only the `\\uXXXX` escapes. JSON does not accept `\\u{...}` — convert those to a surrogate pair first.",
      },
      {
        q: "Why is my plain English text unchanged?",
        a: "Everything in it is ASCII, and ASCII is left alone by design so the result stays readable.",
      },
    ],
    examples: [
      { label: "ASCII with emoji", text: "Hello 👋" },
      { label: "Accented text", text: "café" },
    ],
  },
} as const satisfies ToolSpec;
