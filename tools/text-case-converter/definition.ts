import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.text-case-converter",
  app: "devtools",
  category: "text-tools",
  keywords: ["case", "camelcase", "snake_case", "kebab-case", "uppercase", "title case", "convert"],
  name: "Text Case Converter",
  description: "Convert text between common naming and prose cases.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "Text to convert",
    placeholder: "hello smart tools",
  },
  settings: {
    fields: {
      target: {
        kind: "select",
        label: "Convert to",
        default: "title",
        choices: [
          {
            label: "UPPERCASE",
            value: "upper",
          },
          {
            label: "lowercase",
            value: "lower",
          },
          {
            label: "Title Case",
            value: "title",
          },
          {
            label: "Sentence case",
            value: "sentence",
          },
          {
            label: "camelCase",
            value: "camel",
          },
          {
            label: "PascalCase",
            value: "pascal",
          },
          {
            label: "snake_case",
            value: "snake",
          },
          {
            label: "kebab-case",
            value: "kebab",
          },
          {
            label: "CONSTANT_CASE",
            value: "constant",
          },
        ],
      },
    },
  },
  trigger: {
    mode: "live",
  },
  capabilities: {
    copy: true,
  },
  workbenchMark: { text: "Aa" },
  labels: {
    empty: "Enter text and choose the case to convert it.",
    ready: "Case-converted text is ready.",
    running: "Converting text case…",
  },
  content: {
    howToUse: [
      "Paste the text or identifier you want reshaped. Output updates as you type.",
      "Pick the target case. The identifier cases (camel, Pascal, snake, kebab, CONSTANT) split the input on spaces, punctuation, and existing camelCase boundaries first.",
      "UPPERCASE and lowercase are the only options that leave punctuation and spacing intact — the rest rebuild the string from its words.",
    ],
    limitations: [
      "Words are detected from letters and digits only, so every other character is dropped by the identifier cases.",
      "Accents are stripped during word splitting, so naïve becomes naive in camel, snake, kebab, and CONSTANT output.",
      "Title Case capitalises every word; it does not apply editorial rules that keep short prepositions lowercase.",
      "Sentence case capitalises only the first word — existing acronyms are lowercased with the rest.",
    ],
    faq: [
      {
        q: "Why did my punctuation disappear?",
        a: "camelCase, snake_case, kebab-case, PascalCase, and CONSTANT_CASE are identifier formats. They are rebuilt from words, so separators other than the target one are dropped.",
      },
      {
        q: "Does it split existing camelCase?",
        a: "Yes. smartTools is treated as two words, so it converts cleanly to smart_tools.",
      },
    ],
    examples: [
      {
        label: "Plain phrase",
        text: "hello smart tools",
      },
    ],
  },
} as const satisfies ToolSpec;
