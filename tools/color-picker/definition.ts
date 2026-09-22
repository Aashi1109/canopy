import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.color-picker",
  app: "devtools",
  category: "color-design-tools",
  keywords: ["color", "picker", "hex", "rgb", "hsl", "convert", "alpha"],
  name: "Color Picker",
  description: "Pick a color visually, adjust transparency, and copy HEX, RGB, or HSL.",
  layout: "stacked",
  input: {
    kind: "fields",
    label: "Color",
    fields: [
      {
        channel: "text",
        label: "Color",
        placeholder: "#2563eb",
        required: true,
        multiline: false,
      },
    ],
  },
  settings: {
    fields: {
      normalizeShorthand: {
        kind: "toggle",
        label: "Normalize shorthand",
        help: "Expand #RGB and #RGBA output to their full channel forms.",
        default: true,
      },
      legacyRgbCommas: {
        kind: "toggle",
        label: "Legacy RGB commas",
        help: "Use comma-separated rgb() and rgba() syntax instead of CSS space syntax.",
        default: true,
      },
      includeHsl: {
        kind: "toggle",
        label: "Include HSL",
        help: "Include the equivalent HSL value when showing all formats.",
        default: true,
      },
      outputFormat: {
        kind: "select",
        label: "Output format",
        help: "Show all color forms or limit the result to one format.",
        default: "all",
        choices: [
          { label: "HEX · RGB · HSL", value: "all" },
          { label: "HEX", value: "hex" },
          { label: "RGB", value: "rgb" },
          { label: "HSL", value: "hsl" },
        ],
        pane: "main",
      },
    },
  },
  trigger: { mode: "live", debounceMs: 150 },
  capabilities: { copy: true },
  workbenchMark: { text: "PICK" },
  labels: {
    empty: "Pick a color or enter HEX, RGB, HSL, or a CSS color name.",
    ready: "Color values are ready.",
    running: "Updating color values…",
  },
  content: {
    howToUse: [
      "Choose a color visually, move the hue/saturation/lightness controls, or paste HEX, RGB, HSL, or a CSS color name.",
      "The three forms update as you type — HEX for design handoff, `rgb()` for canvas and image work, `hsl()` for making a lighter or darker variant by hand.",
      "Include an alpha channel (`#RRGGBBAA`) and the output switches to `rgba()` and `hsla()` automatically.",
      "Adjust opacity and copy the format your target needs. Recent colors remain available during this visit.",
    ],
    limitations: [
      "Standalone HEX, RGB, HSL, named colors, and transparent are supported. Stylesheet-dependent variables and currentColor are not resolved.",
      "HEX output is uppercase and cannot be switched to lowercase.",
      "HSL uses three decimal places; converting arbitrary fractional RGB values to HEX quantizes channels to eight bits.",
      "This is sRGB arithmetic with no colour management — no P3, no OKLCH, and no perceptual lightness. Two colours with the same HSL lightness will not look equally bright.",
      "Alpha is reported to three decimal places.",
    ],
    faq: [
      {
        q: "Can I enter an `rgb()` or a colour name?",
        a: "Yes. Paste RGB, HSL, any standard CSS color name, or transparent alongside the four HEX forms.",
      },
      {
        q: "Why is the HSL lightness misleading?",
        a: "HSL lightness is a geometric average of the RGB channels, not perceived brightness. Pure yellow and pure blue are both 50% lightness but look nothing alike.",
      },
      {
        q: "How is transparency handled?",
        a: "An 8-digit (or 4-digit) HEX carries alpha, and the output switches to `rgba()` and `hsla()`. Anything shorter is fully opaque.",
      },
    ],
    examples: [
      { label: "Six-digit HEX", text: "#3366ff" },
      { label: "With alpha", text: "#3366ff80" },
      { label: "Shorthand", text: "#f0c" },
    ],
  },
} as const satisfies ToolSpec;
