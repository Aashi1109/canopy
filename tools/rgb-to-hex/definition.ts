import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.rgb-to-hex",
  app: "devtools",
  category: "color-design-tools",
  keywords: ["rgb", "rgba", "hex", "color", "convert", "css", "alpha"],
  name: "RGB to HEX",
  description: "Convert RGB or RGBA colors to HEX.",
  layout: "stacked",
  input: {
    kind: "fields",
    label: "RGB Color",
    fields: [
      {
        channel: "text",
        label: "RGB or RGBA value",
        placeholder: "rgb(51, 102, 255)\nrgba(255, 99, 71, 0.5)",
        required: true,
        multiline: true,
      },
    ],
  },
  settings: {
    fields: {
      includeAlpha: {
        kind: "toggle",
        label: "Include alpha",
        help: "Keeps transparent input as an eight-digit hex value.",
        default: true,
      },
      uppercaseOutput: {
        kind: "toggle",
        label: "Uppercase output",
        help: "Uses A–F instead of a–f in the converted hex value.",
        default: true,
      },
      addHashPrefix: {
        kind: "toggle",
        label: "Add hash prefix",
        help: "Prefixes the converted value with # for CSS-ready output.",
        default: true,
      },
    },
  },
  trigger: {
    mode: "live",
  },
  capabilities: {
    copy: true,
  },
  workbenchMark: { text: "R2H", tone: "accent" },
  labels: {
    empty: "Enter the RGB or RGBA color you want to convert.",
    ready: "HEX color is ready.",
    running: "Converting RGB to HEX…",
  },
  content: {
    howToUse: [
      "Type or paste a CSS colour in rgb(51, 102, 255) or rgba(51, 102, 255, 0.5) form. Output updates as you type.",
      "Channels are 0–255 and alpha is 0–1. Fractional channels are rounded to the nearest integer.",
      "By default, an opaque colour converts to #RRGGBB; anything with alpha below 1 converts to the eight-digit #RRGGBBAA form.",
    ],
    limitations: [
      "Only the legacy comma-separated syntax is accepted. The modern space-separated form rgb(51 102 255 / 50%) is not parsed.",
      "Percentage channels such as rgb(20%, 40%, 100%) are not supported — use 0–255 values.",
      "Alpha is quantised to 8 bits on the way to hex, so 0.5 becomes 80 and round-trips back as 0.502.",
      "Named colours and hsl() input are not accepted here.",
    ],
    faq: [
      {
        q: "Why is my output eight digits?",
        a: "The input had an alpha below 1. #RRGGBBAA is the hex form with alpha; drop the last two digits to lose transparency.",
      },
      {
        q: "Is the output uppercase?",
        a: "By default, yes. Turn off Uppercase output when your style guide prefers lowercase hex digits.",
      },
    ],
    examples: [
      {
        label: "Opaque blue",
        text: "rgb(51, 102, 255)",
      },
    ],
  },
} as const satisfies ToolSpec;
