import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.word-counter",
  app: "devtools",
  category: "text-tools",
  keywords: ["word count", "character count", "sentences", "paragraphs", "reading time", "text statistics", "seo"],
  name: "Word Counter",
  description: "Count words, characters, sentences, paragraphs, lines, and reading time.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "Text",
    placeholder: "Smart tools make repeated work faster.",
  },
  settings: {
    fields: {
      countHyphenated: {
        kind: "toggle",
        label: "Count hyphenated words as one word",
        help: "Off splits `state-of-the-art` into four words, which matches how some editorial word limits are counted.",
        default: true,
      },
      ignoreNumbers: {
        kind: "toggle",
        label: "Ignore standalone numbers",
        help: "Skips tokens that are purely numeric, such as `2026` or `1,500`.",
        default: false,
      },
      excludeEmails: {
        kind: "toggle",
        label: "Exclude email-like strings",
        help: "Skips tokens shaped like an address so a contact block does not inflate the count.",
        default: true,
      },
      estimateReadingTime: {
        kind: "toggle",
        label: "Estimate reading time",
        help: "Shows an estimate based on 200 words per minute, accounting for long unbroken text.",
        default: true,
      },
    },
  },
  trigger: { mode: "live", debounceMs: 200 },
  capabilities: { copy: true },
  workbenchMark: { text: "W#" },
  labels: {
    empty: "Enter text to count its words and characters.",
    ready: "Text statistics are ready.",
    running: "Counting words and characters…",
  },
  content: {
    howToUse: [
      "Paste or type the text. Every count updates as you type — there is nothing to submit.",
      "Adjust the counting toggles to match the convention you are held to. Hyphenation is the one that most often explains a mismatch with another tool.",
      "Read `Characters` for limits that count code points (most CMS fields) and `Characters without spaces` for editorial limits.",
      "Reading time assumes 200 words per minute and treats every five non-space characters as at least one word. Short text is shown in seconds; longer text is rounded up to whole minutes.",
    ],
    limitations: [
      "Words are whitespace-delimited tokens. Languages that do not separate words with spaces — Chinese, Japanese, Thai — will not be counted meaningfully.",
      "Sentence detection is punctuation-based, so `Dr. Ada` and `3.5` each count as a sentence break.",
      "Paragraphs are runs of text separated by one or more blank lines. A single-spaced document is one paragraph.",
      "`Characters` counts Unicode code points, so an emoji built from several code points counts as more than one character. Byte length is a fourth number again.",
    ],
    faq: [
      {
        q: "Why does my word count differ from Word or Google Docs?",
        a: "Almost always hyphenation or email/number handling. Match the three toggles to the other tool's convention and the numbers converge.",
      },
      {
        q: "How is reading time calculated?",
        a: "It uses 200 words per minute and a five-character word equivalent for long unbroken text. Short text is shown in seconds and longer text in rounded-up whole minutes.",
      },
      {
        q: "Is my text sent anywhere?",
        a: "No. Counting happens in this browser tab and nothing is uploaded or stored.",
      },
    ],
    examples: [
      {
        label: "Two sentences",
        text: "Smart tools make repeated work faster. They should remain easy to trust.",
      },
      {
        label: "Hyphenation and an address",
        text: "State-of-the-art tooling. Reach us at hello@example.com for 2026 pricing.",
      },
    ],
  },
} as const satisfies ToolSpec;
