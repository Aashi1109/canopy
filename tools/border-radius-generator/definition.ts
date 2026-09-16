import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.border-radius-generator",
  app: "devtools",
  category: "color-design-tools",
  keywords: ["border radius", "css", "rounded corners", "generator", "shape", "design"],
  name: "Border Radius Generator",
  description: "Generate four-corner border-radius CSS.",
  input: { kind: "none" },
  settings: {
    fields: {
      topLeft: { kind: "number", label: "Top-left", default: 16, min: 0, max: 500, suffix: "px" },
      topRight: { kind: "number", label: "Top-right", default: 16, min: 0, max: 500, suffix: "px" },
      bottomRight: {
        kind: "number",
        label: "Bottom-right",
        default: 16,
        min: 0,
        max: 500,
        suffix: "px",
      },
      bottomLeft: {
        kind: "number",
        label: "Bottom-left",
        default: 16,
        min: 0,
        max: 500,
        suffix: "px",
      },
    },
  },
  trigger: { mode: "live" },
  capabilities: { copy: true },
  workbenchMark: { text: "BR" },
  labels: {
    empty: "Choose the four corner radii to generate CSS.",
    ready: "CSS is ready.",
    running: "Generating…",
  },
  content: {
    howToUse: [
      "Set each corner independently. The order in the generated shorthand is top-left, top-right, bottom-right, bottom-left — clockwise from the top-left.",
      "The declaration updates as you change a value, so you can watch the shape settle.",
      "Copy the one-line declaration into your stylesheet.",
    ],
    limitations: [
      "Values are whole pixels only. Percentages, rem, and the elliptical two-radius syntax (10px / 20px) are not generated.",
      "All four corners are always written out, even when they are equal, rather than collapsing to the shorter shorthand.",
      "A radius larger than half the element's side is clamped by the browser at render time, so very large values look identical.",
    ],
    faq: [
      {
        q: "How do I make a circle?",
        a: "Pixels cannot do it responsively. Use border-radius: 50% on a square element instead — that is outside what this generator emits.",
      },
      {
        q: "Why is the corner order not clockwise from the top-right?",
        a: "CSS shorthand starts at the top-left and goes clockwise. The fields are labelled so you never have to remember that.",
      },
    ],
    examples: [
      {
        label: "Asymmetric card",
        text: "",
        settings: {
          topLeft: 48,
          topRight: 12,
          bottomRight: 48,
          bottomLeft: 12,
        },
      },
    ],
  },
} as const satisfies ToolSpec;
