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
        help: "Choose a preset length, or Custom for your own sentence count.",
        default: "medium",
        choices: [
          { label: "Short", value: "short" },
          { label: "Medium", value: "medium" },
          { label: "Long", value: "long" },
          { label: "Custom", value: "custom" },
        ],
      },
      customSentences: {
        kind: "number",
        label: "Sentences per paragraph",
        help: "Choose between 1 and 100 whole sentences per paragraph.",
        default: 3,
        min: 1,
        max: 100,
        step: 1,
        visibleWhen: { key: "paragraphLength", equals: "custom" },
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
      "Choose Short (2 sentences), Medium (3), Long (4), or Custom (1–100 sentences per paragraph).",
      "Generate, then copy the text into your mockup, template, or CMS draft.",
    ],
    limitations: [
      "Custom length counts sentences, not words or characters. Each paragraph can contain up to 100 sentences.",
      "The sentence pool is small and cycles, so long runs repeat. That is fine for layout, less so for testing text-diff or search behaviour.",
      "The output is deterministic — the same settings always produce the same text.",
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
