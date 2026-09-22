import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.character-counter",
  app: "devtools",
  category: "text-tools",
  keywords: ["character count", "count", "length", "bytes", "utf-8", "words", "lines", "twitter limit"],
  name: "Character Counter",
  description: "Count characters, bytes, words, and lines.",
  layout: "stacked",
  inputSize: { default: 70 },
  input: {
    kind: "text",
    label: "Text",
    placeholder: "Hello, world!\nThis is a sample.",
  },
  settings: {
    fields: {
      includeSpaces: {
        kind: "toggle",
        label: "Include spaces",
        help: "Include spaces and tabs in the character total.",
        default: true,
      },
      limit280: {
        kind: "toggle",
        label: "Limit: 280 characters",
        help: "Show the count against a 280-character limit and the remaining characters.",
        default: false,
      },
      countLineBreaks: {
        kind: "toggle",
        label: "Count line breaks",
        help: "Treat line breaks as characters in the total.",
        default: true,
      },
    },
  },
  trigger: { mode: "live", debounceMs: 150 },
  capabilities: { copy: true },
  workbenchMark: { text: "#CH" },
  labels: {
    empty: "Type or paste text to count its characters, words, lines, and bytes.",
    ready: "Text counts are ready.",
    running: "Counting text…",
  },
  content: {
    howToUse: [
      "Type or paste your text — the counts update as you type, so there is nothing to press.",
      "Read 'Characters' for a UI or database limit expressed in characters, and 'UTF-8 bytes' for a limit expressed in bytes.",
      "The two differ for anything outside ASCII, which is exactly when a field silently overflows.",
    ],
    limitations: [
      "Characters are counted as Unicode code points, so an emoji outside the Basic Multilingual Plane counts as 1 here but as 2 in JavaScript's `.length` and in any UTF-16 length limit.",
      "A grapheme built from several code points — a flag, a skin-toned emoji, a base letter plus a combining accent — counts once per code point, not once per visible glyph.",
      "Words are whitespace-separated tokens after normalisation, so hyphenated compounds count as one word and `a - b` counts as three.",
      "Sentence and paragraph counts are not reported here; use the Word Counter for those.",
      "Line count is the number of lines including the last one, whether or not the text ends with a newline.",
    ],
    faq: [
      {
        q: "Why is my character count lower than my database reports?",
        a: "Most likely a code-point versus UTF-16 difference. A character above U+FFFF (many emoji) is one code point but two UTF-16 units. Compare against 'UTF-8 bytes' if the limit is in bytes.",
      },
      {
        q: "Does whitespace count?",
        a: "'Characters' includes it; 'Characters without spaces' excludes every whitespace character, including tabs and newlines, not just spaces.",
      },
      {
        q: "Is my text sent anywhere?",
        a: "No. Counting happens entirely in this browser tab.",
      },
    ],
    examples: [{ label: "Text with an emoji", text: "Hello 👋" }],
  },
} as const satisfies ToolSpec;
