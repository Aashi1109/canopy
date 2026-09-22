import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.hex-to-rgb",
  app: "devtools",
  category: "color-design-tools",
  keywords: ["hex", "rgb", "rgba", "color", "convert", "css", "alpha"],
  name: "HEX to RGB",
  description: "Convert HEX colors to RGB or RGBA.",
  layout: "stacked",
  input: {
    kind: "fields",
    label: "HEX Color",
    fields: [
      {
        channel: "text",
        label: "HEX color",
        placeholder: "#3366ff\n#ffcc00\n#3366ff80",
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
        help: "Includes the source alpha channel when it is below 1.",
        default: true,
      },
      commaSyntax: {
        kind: "toggle",
        label: "Comma syntax",
        help: "Uses classic comma-separated RGB syntax instead of modern CSS spaces.",
        default: true,
      },
      outputFormat: {
        kind: "select",
        label: "Output format",
        help: "Wraps channels in CSS rgb() syntax or returns bare values.",
        default: "css",
        choices: [
          { label: "rgb()", value: "css" },
          { label: "Channels", value: "channels" },
        ],
        pane: "main",
      },
    },
  },
  trigger: { mode: "live" },
  capabilities: { copy: true },
  workbenchMark: { text: "RGB", tone: "accent" },
  labels: {
    empty: "Enter a HEX color to convert it to RGB.",
    ready: "RGB value is ready.",
    running: "Converting HEX to RGB…",
  },
  content: {
    howToUse: [
      "Type or paste a HEX color. All four CSS forms work: #RGB, #RGBA, #RRGGBB, and #RRGGBBAA — the leading # is optional.",
      "The result updates as you type. By default, a fully opaque color returns rgb(); anything with alpha below 1 returns rgba().",
      "Copy the value straight into a stylesheet or a design token file.",
    ],
    limitations: [
      "Alpha is reported to three decimal places, which preserves the source byte when converting back to eight-digit HEX.",
      "Only hexadecimal input is accepted. Named colors, hsl(), and color() notations are not parsed.",
      "Legacy comma-separated syntax is the default; modern space-separated CSS is available in the options.",
    ],
    faq: [
      {
        q: "How is a three-digit shorthand expanded?",
        a: "Each digit is doubled, so #36f becomes #3366ff. The same applies to the four-digit form with alpha.",
      },
      {
        q: "Why does my eight-digit hex give a fractional alpha?",
        a: "Hex alpha is a byte from 0–255, and CSS rgba() takes a 0–1 fraction. 80 hex, for example, becomes 0.502.",
      },
    ],
    examples: [
      { label: "Opaque blue", text: "#3366ff" },
      { label: "Shorthand with alpha", text: "#36f8" },
    ],
  },
} as const satisfies ToolSpec;
