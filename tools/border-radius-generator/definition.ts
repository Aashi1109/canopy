import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.border-radius-generator",
  app: "devtools",
  category: "color-design-tools",
  keywords: ["border radius", "css", "rounded corners", "generator", "shape", "design"],
  name: "Border Radius Generator",
  description: "Shape rounded corners visually and copy border-radius CSS.",
  outputLanguage: "css",
  input: { kind: "none" },
  settings: {
    fields: {
      topLeft: { kind: "number", label: "Top-left", default: 16, min: 0, max: 10000 },
      topRight: { kind: "number", label: "Top-right", default: 16, min: 0, max: 10000 },
      bottomRight: {
        kind: "number",
        label: "Bottom-right",
        default: 16,
        min: 0,
        max: 10000,
      },
      bottomLeft: {
        kind: "number",
        label: "Bottom-left",
        default: 16,
        min: 0,
        max: 10000,
      },
      unit: {
        kind: "select",
        label: "Radius unit",
        default: "px",
        choices: [
          { label: "px", value: "px" },
          { label: "%", value: "%" },
          { label: "rem", value: "rem" },
        ],
      },
      linked: { kind: "toggle", label: "Link corners", default: true },
      width: { kind: "number", label: "Preview width", default: 280, min: 40, max: 1200, suffix: "px" },
      height: { kind: "number", label: "Preview height", default: 200, min: 40, max: 1200, suffix: "px" },
      rootFontSize: { kind: "number", label: "Root font size", default: 16, min: 1, max: 100, suffix: "px" },
      elliptical: { kind: "toggle", label: "Elliptical corners", default: false },
      topLeftY: { kind: "number", label: "Top-left vertical", default: 16, min: 0, max: 10000 },
      topRightY: { kind: "number", label: "Top-right vertical", default: 16, min: 0, max: 10000 },
      bottomRightY: { kind: "number", label: "Bottom-right vertical", default: 16, min: 0, max: 10000 },
      bottomLeftY: { kind: "number", label: "Bottom-left vertical", default: 16, min: 0, max: 10000 },
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
      "Adjust the controls beside each corner of the preview. Link the corners to change all four together, or choose a card, pill or circle preset.",
      "Choose px, % or rem. Preview dimensions show how the shape responds. Enable elliptical corners to control horizontal and vertical radii separately.",
      "Copy the one-line declaration into your stylesheet.",
    ],
    limitations: [
      "The generated declaration controls corners only; preview dimensions are not included in the copied CSS.",
      "Overlapping corner radii are proportionally reduced by the browser. Percentage radii use the element's width horizontally and height vertically.",
    ],
    faq: [
      {
        q: "How do I make a circle?",
        a: "Choose the Circle preset. It uses 50% corners and a square preview; your real element must also be square to remain circular.",
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
