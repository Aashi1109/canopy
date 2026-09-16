import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.css-unit-converter",
  app: "devtools",
  category: "color-design-tools",
  keywords: ["css", "px", "rem", "em", "pt", "percent", "unit", "convert"],
  name: "CSS Unit Converter",
  description: "Convert px, rem, em, pt, and percentage values.",
  layout: "stacked",
  input: {
    kind: "fields",
    label: "CSS Value",
    fields: [
      {
        channel: "text",
        label: "Numeric value",
        placeholder: "16\n24\n48",
        required: true,
        multiline: true,
      },
    ],
  },
  settings: {
    fields: {
      from: {
        kind: "select",
        label: "From",
        default: "px",
        choices: [
          {
            label: "px",
            value: "px",
          },
          {
            label: "rem",
            value: "rem",
          },
          {
            label: "em",
            value: "em",
          },
          {
            label: "pt",
            value: "pt",
          },
          {
            label: "%",
            value: "%",
          },
        ],
      },
      to: {
        kind: "select",
        label: "To",
        default: "rem",
        choices: [
          {
            label: "px",
            value: "px",
          },
          {
            label: "rem",
            value: "rem",
          },
          {
            label: "em",
            value: "em",
          },
          {
            label: "pt",
            value: "pt",
          },
          {
            label: "%",
            value: "%",
          },
        ],
      },
      base: {
        kind: "number",
        label: "Base (px)",
        help: "The font size that rem, em, and % are relative to. 16 is the browser default.",
        default: 16,
        min: 0.01,
        max: 10000,
      },
      roundResults: {
        kind: "toggle",
        label: "Round results",
        help: "Limit converted results to four decimal places.",
        default: false,
      },
      includeFormula: {
        kind: "toggle",
        label: "Include formula",
        help: "Show the calculation used for the conversion.",
        default: false,
      },
    },
  },
  trigger: {
    mode: "live",
  },
  capabilities: {
    copy: true,
  },
  workbenchMark: { text: "UNIT" },
  labels: {
    empty: "Enter a number to convert between the selected CSS units.",
    ready: "Converted CSS value is ready.",
    running: "Converting CSS units…",
  },
  content: {
    howToUse: [
      "Enter the bare number without a unit — the From selector says what unit it is in.",
      "Pick the target unit. Set the base to the font size that rem, em, and % are relative to; 16px is the browser default and the right value most of the time.",
      "Convert the value. Results are rounded to six decimal places unless you enable four-place rounding.",
    ],
    limitations: [
      "rem and em share the same base here. In a real page em is relative to the parent's font size, which changes as elements nest, while rem is always relative to the root.",
      "% is treated as a font-relative percentage of the base. A percentage of width, height, or a container is a different calculation and this tool cannot do it.",
      "pt uses the CSS definition of 96px per inch, which is not a physical point on any particular display.",
      "Viewport units (vw, vh, vmin, vmax) and ch/ex are not supported — they depend on the rendered viewport and font metrics.",
    ],
    faq: [
      {
        q: "Why are rem and em the same here?",
        a: "Both are multiples of a font size, and the tool has only one base to work from. In a page they differ because em inherits from the parent chain.",
      },
      {
        q: "What base should I use?",
        a: "16, unless you deliberately changed the root font size. Do not use the 62.5% trick's 10 unless your stylesheet actually sets it.",
      },
    ],
    examples: [
      {
        label: "32px in rem",
        text: "32",
      },
    ],
  },
} as const satisfies ToolSpec;
