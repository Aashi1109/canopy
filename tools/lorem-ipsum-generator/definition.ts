import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.lorem-ipsum-generator",
  app: "devtools",
  category: "text-tools",
  keywords: ["lorem ipsum", "placeholder", "dummy text", "filler", "mockup", "paragraphs"],
  name: "Lorem Ipsum Generator",
  description: "Generate placeholder paragraphs.",
  input: { kind: "none" },
  settings: {
    fields: {
      paragraphs: {
        kind: "number",
        label: "Paragraphs",
        default: 3,
        min: 1,
        max: 50,
        pane: "main",
        span: "full",
      },
      startWithLorem: {
        kind: "toggle",
        label: 'Start with "Lorem ipsum"',
        help: "Keep the classic opening at the start of the first paragraph.",
        default: true,
      },
      paragraphLength: {
        kind: "select",
        label: "Paragraph length",
        help: "Choose two, three, or four sentences per paragraph.",
        default: "medium",
        choices: [
          { label: "Short", value: "short" },
          { label: "Medium", value: "medium" },
          { label: "Long", value: "long" },
        ],
      },
      includePunctuation: {
        kind: "toggle",
        label: "Include punctuation",
        help: "Keep sentence punctuation in the generated text.",
        default: true,
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Generate" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "LORE", tone: "accent" },
  labels: {
    empty: "Choose the number of paragraphs to generate.",
    ready: "Placeholder text is ready.",
    running: "Generating…",
  },
  content: {
    howToUse: [
      "Pick how many paragraphs of filler you need, between 1 and 50.",
      "Generate, then copy the text into your mockup, template, or CMS draft.",
      "Each paragraph is three sentences long, and consecutive paragraphs start at a different sentence so the block does not look copy-pasted.",
    ],
    limitations: [
      "Paragraph length is fixed at three sentences; there is no word- or character-count target.",
      "The sentence pool is small and cycles, so long runs repeat. That is fine for layout, less so for testing text-diff or search behaviour.",
      "The output is deterministic — the same paragraph count always produces the same text.",
    ],
    faq: [
      {
        q: 'Why does the classic "Lorem ipsum dolor sit amet" opening not appear in every paragraph?',
        a: "Paragraphs are offset through the sentence pool so the block reads as varied text rather than the same stanza repeated.",
      },
      {
        q: "Should I ship this to production?",
        a: 'No. Placeholder Latin that survives to production is a classic launch bug — search for "lorem" before you release.',
      },
    ],
  },
} as const satisfies ToolSpec;
