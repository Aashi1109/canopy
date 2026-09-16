import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.random-number-generator",
  app: "devtools",
  category: "developer-generators",
  keywords: ["random", "number", "integer", "secure", "csprng", "range", "dice"],
  name: "Random Number Generator",
  description: "Generate random whole or decimal numbers in a range.",
  input: { kind: "none" },
  settings: {
    fields: {
      count: {
        kind: "number",
        label: "How many",
        default: 10,
        min: 1,
        max: 1000,
        pane: "main",
      },
      min: {
        kind: "number",
        label: "Min",
        default: 1,
        min: -1_000_000_000,
        max: 1_000_000_000,
        pane: "main",
      },
      max: {
        kind: "number",
        label: "Max",
        default: 100,
        min: -1_000_000_000,
        max: 1_000_000_000,
        pane: "main",
      },
      seed: {
        kind: "text",
        label: "Seed",
        help: "Repeats a predictable, non-secure sequence; leave blank for secure random values.",
        default: "",
        maxLength: 128,
        pane: "main",
      },
      decimalPlaces: {
        kind: "select",
        label: "Decimal places",
        help: "Sets precision when whole numbers are turned off.",
        default: "2",
        choices: [
          { label: "1 place", value: "1" },
          { label: "2 places", value: "2" },
          { label: "3 places", value: "3" },
          { label: "4 places", value: "4" },
        ],
        pane: "main",
      },
      uniqueValues: {
        kind: "toggle",
        label: "Unique values",
        help: "Prevents duplicate values in the result.",
        default: false,
      },
      wholeNumbers: {
        kind: "toggle",
        label: "Whole numbers",
        help: "Returns integers instead of decimal values.",
        default: true,
      },
      sortResult: {
        kind: "toggle",
        label: "Sort result",
        help: "Orders generated values from lowest to highest.",
        default: false,
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Generate" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "#?", tone: "accent" },
  labels: {
    empty: "Choose a minimum, maximum, and quantity to generate.",
    ready: "Numbers are ready.",
    running: "Generating…",
  },
  content: {
    howToUse: [
      "Set the minimum and maximum. Both ends are inclusive, and both may be negative.",
      "Choose how many numbers you want, up to 1000. Turn off whole numbers to set decimal precision, or require unique values when the range is large enough.",
      "Leave the seed blank for secure random values, or enter one to repeat a sequence. Sort the result when you need ascending output.",
    ],
    limitations: [
      "Both bounds must be safe integers. Decimal output is generated at the selected precision between those bounds.",
      "The range cannot exceed 2^32 possible values after decimal precision is applied.",
      "Unique output requires at least as many possible values as the requested count.",
      "Seeded sequences are deterministic, not cryptographically secure. Leave the seed blank for security-sensitive randomness.",
    ],
    faq: [
      {
        q: "Is this good enough for a security token?",
        a: "With a blank seed the randomness is secure, but the numeric shape is weak. Use an API key or random string generator for credentials.",
      },
      {
        q: "Why did the same number appear twice?",
        a: "Duplicates are allowed by default. Turn on unique values to sample without replacement when the range is large enough.",
      },
      {
        q: 'What does "no modulo bias" mean?',
        a: "A naive random % n makes the low values slightly more likely. This generator discards and redraws the values that would cause that skew.",
      },
    ],
    examples: [
      {
        label: "Unique lottery picks",
        text: "",
        settings: {
          count: 6,
          min: 1,
          max: 49,
          seed: "",
          decimalPlaces: "2",
          uniqueValues: true,
          wholeNumbers: true,
          sortResult: true,
        },
      },
      {
        label: "Repeatable test decimals",
        text: "",
        settings: {
          count: 5,
          min: -1,
          max: 1,
          seed: "test-sequence",
          decimalPlaces: "3",
          uniqueValues: false,
          wholeNumbers: false,
          sortResult: false,
        },
      },
    ],
  },
} as const satisfies ToolSpec;
