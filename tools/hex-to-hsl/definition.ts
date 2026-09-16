import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.hex-to-hsl",
  app: "devtools",
  category: "color-design-tools",
  keywords: ["hex", "hsl", "color", "convert", "css", "hue", "saturation"],
  name: "HEX to HSL",
  description: "Convert HEX colors to HSL.",
  layout: "stacked",
  input: {
    kind: "fields",
    label: "HEX Color",
    fields: [
      {
        channel: "text",
        label: "HEX color",
        placeholder: "#3366ff\n#ff3366\n#33ff66",
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
        help: "Preserve transparency from four- and eight-digit HEX values.",
        default: true,
      },
      roundPercentages: {
        kind: "toggle",
        label: "Round percentages",
        help: "Round saturation and lightness to whole percentages.",
        default: true,
      },
      outputFormat: {
        kind: "select",
        label: "Output format",
        help: "Wrap the channels in hsl()/hsla(), or return the channel list alone.",
        default: "css",
        choices: [
          { label: "hsl()", value: "css" },
          { label: "Channels only", value: "channels" },
        ],
        pane: "main",
      },
    },
  },
  trigger: { mode: "live", debounceMs: 150 },
  capabilities: { copy: true },
  workbenchMark: { text: "HSL", tone: "accent" },
  labels: {
    empty: "Enter a HEX color to convert it to HSL.",
    ready: "HSL value is ready.",
    running: "Converting HEX to HSL…",
  },
  content: {
    howToUse: [
      "Type or paste a HEX value with or without the leading `#`. Shorthand (`#f0c`) and alpha (`#RRGGBBAA`) both work.",
      "The `hsl()` string updates as you type and is ready to paste straight into CSS.",
      "Once you are in HSL, build a palette by changing one channel at a time — same hue with different lightness gives you a tint and shade ramp.",
      "A HEX with an alpha channel produces `hsla()` with the alpha as the fourth value.",
    ],
    limitations: [
      "Hue, saturation, and lightness are rounded to whole numbers, so a round trip back to HEX can land one step off the original.",
      "Only HEX input is accepted — no `rgb()`, no colour names, no `hsl()`.",
      "The `hsl()` format uses legacy comma-separated `hsl(H, S%, L%)` syntax, not the modern space-separated form.",
      "HSL lightness is not perceived brightness. Do not use it to judge contrast; use a contrast checker against WCAG thresholds.",
    ],
    faq: [
      {
        q: "Why use HSL at all?",
        a: "It makes colour relationships obvious. Holding hue and saturation fixed while varying lightness gives a coherent tint and shade ramp, which is fiddly to do in HEX.",
      },
      {
        q: "Why did my colour shift slightly after converting back?",
        a: "Rounding. The HSL channels are whole numbers, so some HEX values have no exact HSL representation.",
      },
      {
        q: "Is transparency supported?",
        a: "Yes. By default, an 8-digit or 4-digit HEX produces `hsla()` with the alpha preserved. Turn off Include alpha to omit it.",
      },
    ],
    examples: [
      { label: "Six-digit HEX", text: "#3366ff" },
      { label: "With alpha", text: "#3366ff80" },
    ],
  },
} as const satisfies ToolSpec;
