import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.gradient-generator",
  app: "devtools",
  category: "color-design-tools",
  keywords: [
    "gradient",
    "css",
    "linear-gradient",
    "radial-gradient",
    "color",
    "background",
    "design",
  ],
  name: "Gradient Generator",
  description: "Generate linear or radial CSS gradients.",
  input: {
    kind: "fields",
    label: "Gradient colors",
    fields: [
      {
        channel: "text",
        label: "Start color",
        placeholder: "#2563eb",
        required: true,
        maxLength: 9,
      },
      {
        channel: "secondary",
        label: "End color",
        placeholder: "#7c3aed",
        required: true,
        maxLength: 9,
      },
    ],
  },
  settings: {
    fields: {
      type: {
        kind: "select",
        label: "Gradient type",
        help: "Linear runs along an angle; radial spreads outward from the centre.",
        default: "linear",
        choices: [
          { label: "Linear", value: "linear" },
          { label: "Radial", value: "radial" },
        ],
      },
      angle: {
        kind: "number",
        label: "Angle",
        help: "0deg points up, 90deg points right. Ignored by a radial gradient.",
        default: 135,
        min: 0,
        max: 360,
        suffix: "deg",
        visibleWhen: { key: "type", equals: "linear" },
      },
      includeFallback: {
        kind: "toggle",
        label: "Include fallback",
        help: "Adds the start color before the gradient for unsupported browsers.",
        default: false,
      },
    },
  },
  trigger: { mode: "live", debounceMs: 160 },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "GRAD" },
  labels: {
    empty: "Enter two HEX colors to build a CSS gradient.",
    ready: "CSS gradient is ready.",
    running: "Generating CSS gradient…",
  },
  content: {
    howToUse: [
      "Enter the start and end colors as HEX. Short forms work too: #RGB, #RGBA, #RRGGBB, and #RRGGBBAA are all accepted.",
      "Pick linear or radial. For linear, set the angle — 0deg runs bottom to top, 90deg runs left to right, 180deg runs top to bottom.",
      "The declaration regenerates as you type, so you can nudge the angle and watch the result rather than guessing.",
      "Copy the finished `background:` line straight into your stylesheet.",
    ],
    limitations: [
      "Exactly two colour stops are supported. Multi-stop gradients, explicit stop positions, and repeating gradients have to be written by hand.",
      "Colours must be HEX. Named colours, `rgb()`, `hsl()`, and CSS custom properties are rejected.",
      "The radial form is always `circle` from the centre — there is no ellipse, sizing keyword, or custom origin.",
      "No vendor prefixes are emitted. None are needed by any browser still receiving security updates.",
    ],
    faq: [
      {
        q: "Which way does the angle point?",
        a: "CSS angles are measured clockwise from pointing up, so 0deg goes bottom to top, 90deg goes left to right, and 180deg goes top to bottom.",
      },
      {
        q: "Can I use transparency?",
        a: "Yes. Use the eight-digit #RRGGBBAA form — for example #2563eb00 for a fully transparent blue that fades cleanly.",
      },
      {
        q: "Why does the angle field disappear?",
        a: "A radial gradient has no direction, so the angle is hidden rather than shown as a control that does nothing.",
      },
      {
        q: "Why does my fade to transparent look grey?",
        a: "Fading to plain `transparent` interpolates through transparent black. Fade to the same colour with alpha 00 instead, which is what the #RRGGBBAA form gives you.",
      },
    ],
    examples: [{ label: "Blue to purple", text: "#2563eb", secondary: "#7c3aed" }],
  },
} as const satisfies ToolSpec;
