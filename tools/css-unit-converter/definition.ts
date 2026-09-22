import type { ToolSpec } from "../../lib/tool-framework/spec";

const unitChoices = ["px", "rem", "em", "pt", "%", "vw", "vh", "vmin", "vmax"].map((value) => ({
  label: value,
  value,
}));

export default {
  toolId: "devtools.css-unit-converter",
  app: "devtools",
  category: "color-design-tools",
  keywords: ["css", "px", "rem", "em", "pt", "percent", "viewport", "unit", "convert"],
  name: "CSS Unit Converter",
  description: "Convert CSS lengths with explicit font, percentage and viewport references.",
  input: {
    kind: "fields",
    label: "CSS values",
    fields: [{ channel: "text", label: "Values", placeholder: "16px\n2rem\n50%", required: true, multiline: true }],
  },
  settings: {
    fields: {
      from: { kind: "select", label: "From", default: "px", choices: unitChoices },
      to: { kind: "select", label: "To", default: "rem", choices: unitChoices },
      base: {
        kind: "number",
        label: "Root font size",
        help: "rem uses the computed font size of the root element.",
        default: 16,
        min: 0.01,
        max: 10000,
        suffix: "px",
      },
      elementFontSize: { kind: "number", label: "Element font size", default: 16, min: 0.01, max: 10000, suffix: "px" },
      parentFontSize: { kind: "number", label: "Parent font size", default: 16, min: 0.01, max: 10000, suffix: "px" },
      emContext: {
        kind: "select",
        label: "em reference",
        default: "element",
        choices: [
          { label: "Element (spacing and sizes)", value: "element" },
          { label: "Parent (font-size)", value: "parent" },
        ],
      },
      percentageReference: {
        kind: "select",
        label: "Percentage reference",
        default: "parent-font",
        choices: [
          { label: "Parent font size", value: "parent-font" },
          { label: "Explicit reference length", value: "length" },
        ],
      },
      percentageBase: {
        kind: "number",
        label: "Reference length",
        help: "The pixel length represented by 100%, such as the containing block width.",
        default: 100,
        min: 0.01,
        max: 100000,
        suffix: "px",
      },
      viewportWidth: { kind: "number", label: "Viewport width", default: 1366, min: 1, max: 100000, suffix: "px" },
      viewportHeight: { kind: "number", label: "Viewport height", default: 768, min: 1, max: 100000, suffix: "px" },
      precision: { kind: "number", label: "Decimal places", default: 6, min: 0, max: 12, step: 1 },
      roundResults: {
        kind: "toggle",
        label: "Use four decimal places",
        help: "Compatibility setting for saved conversions; changing precision turns it off.",
        default: false,
      },
      includeFormula: { kind: "toggle", label: "Include formula", default: false },
    },
  },
  trigger: { mode: "live" },
  capabilities: { copy: true },
  workbenchMark: { text: "UNIT" },
  labels: {
    empty: "Enter a CSS value to convert.",
    ready: "Converted CSS values are ready.",
    running: "Converting CSS units…",
  },
  content: {
    howToUse: [
      "Enter a number or paste a value with its unit. Use one value per line for a batch; a suffix overrides the From unit for that line.",
      "Choose the target unit and the relevant font, percentage or viewport references. rem uses the root font; em uses the element font, except when converting font-size itself, which uses the parent.",
      "Copy the result. Set decimal precision or include the calculation; invalid batch rows are reported without discarding valid conversions.",
    ],
    limitations: [
      "Percentages depend on the CSS property. Choose parent font size for font-size, or supply the actual reference length for a size; this tool cannot infer page layout.",
      "Viewport units use the dimensions supplied here. Dynamic and small viewport variants, ch/ex, expressions such as calc(), and CSS variables are not evaluated.",
      "Negative numbers are converted mathematically; whether a negative value is valid depends on the CSS property where you use it.",
    ],
    faq: [
      {
        q: "Why do rem and em give different results?",
        a: "rem always uses the root element's font size. em uses the element's own font size for lengths, or the parent's font size when setting font-size.",
      },
      {
        q: "What does 100% mean?",
        a: "It means the selected reference: the parent font size, or an explicit pixel length. The correct reference depends on the CSS property.",
      },
    ],
    examples: [
      { label: "32px in rem", text: "32" },
      { label: "Mixed units", text: "16px\n2rem\n12pt" },
    ],
  },
} as const satisfies ToolSpec;
