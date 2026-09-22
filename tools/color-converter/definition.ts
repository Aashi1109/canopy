import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.color-converter",
  app: "devtools",
  category: "color-design-tools",
  name: "Color Converter",
  description: "Convert HEX, RGB, HSL, and CSS color names in either direction.",
  keywords: ["color", "converter", "hex", "rgb", "hsl", "rgba", "named", "alpha"],
  layout: "stacked",
  input: {
    kind: "fields",
    label: "Colors",
    fields: [
      {
        channel: "text",
        label: "CSS colors",
        multiline: true,
        required: true,
        placeholder: "hsl(210 60% 50%)\nrebeccapurple\n#36f8",
      },
    ],
  },
  settings: {
    fields: {
      outputFormat: {
        kind: "select",
        label: "Output format",
        default: "hex",
        choices: [
          { label: "HEX", value: "hex" },
          { label: "RGB", value: "rgb" },
          { label: "HSL", value: "hsl" },
        ],
      },
      includeAlpha: {
        kind: "toggle",
        label: "Include alpha",
        default: true,
        help: "Keep transparency in the converted value.",
      },
      modernSyntax: {
        kind: "toggle",
        label: "Modern CSS syntax",
        default: true,
        help: "Use spaces and / alpha for RGB and HSL.",
      },
      precision: {
        kind: "number",
        label: "Decimal places",
        default: 3,
        min: 0,
        max: 6,
        step: 1,
        help: "RGB/HSL display precision. At least three places are kept for alpha.",
      },
    },
  },
  trigger: { mode: "live", debounceMs: 150 },
  capabilities: { copy: true },
  workbenchMark: { text: "COLOR", tone: "accent" },
  labels: {
    empty: "Enter a color to convert it.",
    ready: "Converted colors are ready.",
    running: "Converting colors…",
  },
  content: {
    howToUse: [
      "Paste a HEX, RGB, HSL, or named CSS color. Use one per line for a batch.",
      "Choose HEX, RGB, or HSL output; transparency is preserved by default.",
      "Copy one result or all successful values. Invalid lines remain identified for correction.",
    ],
    limitations: [
      "Uses the sRGB color space. Wide-gamut colors, variables, currentColor, and relative color expressions require additional context and are not accepted.",
      "Out-of-range channels are errors. HEX output quantizes each channel to eight bits; reducing decimal precision may change RGB/HSL values.",
    ],
    examples: [
      { label: "HSL to HEX", text: "hsl(210 60% 50%)" },
      { label: "Mixed formats", text: "rebeccapurple\n#36f8\nrgb(100% 0% 0% / 50%)" },
    ],
  },
} as const satisfies ToolSpec;
