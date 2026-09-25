import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.text-reverser",
  app: "devtools",
  category: "text-tools",
  keywords: ["reverse", "backwards", "flip", "text", "words", "lines"],
  name: "Text Reverser",
  description: "Reverse characters, words, or lines.",
  layout: "side-by-side",
  input: {
    kind: "text",
    label: "Text to reverse",
    placeholder: "one two three",
  },
  settings: {
    fields: {
      mode: {
        kind: "select",
        label: "Reverse by",
        default: "chars",
        choices: [
          { label: "Characters", value: "chars" },
          { label: "Words", value: "words" },
          { label: "Lines", value: "lines" },
        ],
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Reverse" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "cba" },
  labels: {
    empty: "Enter the text you want to reverse.",
    ready: "Reversed text is ready.",
    running: "Reversing text…",
  },
  content: {
    howToUse: [
      "Paste the text you want reversed.",
      "Choose the unit: Characters flips the whole string, Words flips the word order, Lines flips the line order.",
      "Reverse, then copy the result.",
    ],
    limitations: [
      "Character mode reverses by Unicode code point, so emoji and non-Latin scripts survive — but multi-code-point sequences such as a flag emoji or an accented letter written with a combining mark will come apart.",
      "Word mode trims the text and collapses every run of whitespace to a single space, so the original spacing is not preserved.",
      "Line mode joins with \\n, so CRLF input comes back LF-only.",
    ],
    faq: [
      {
        q: "Why did my emoji break in character mode?",
        a: "Sequences built from several code points — skin-tone modifiers, flags, family emoji — are reversed element by element and lose their joiners. Use word or line mode if the text contains them.",
      },
      {
        q: "Can I reverse lines without changing the words?",
        a: "Yes, that is exactly what Lines mode does: the last line becomes the first, and each line's contents are untouched.",
      },
    ],
    examples: [{ label: "Reverse characters", text: "one two three" }],
  },
} as const satisfies ToolSpec;
