import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.contrast-checker",
  app: "devtools",
  category: "color-design-tools",
  name: "Contrast Checker",
  description: "Check text contrast, preview readable combinations, and find an accessible foreground color.",
  keywords: ["color", "contrast", "accessibility", "WCAG", "AA", "AAA"],
  input: { kind: "none" },
  settings: {
    fields: {
      foreground: { kind: "text", label: "Text color", default: "#334155", maxLength: 200 },
      background: { kind: "text", label: "Background", default: "#FFFFFF", maxLength: 200 },
      canvas: { kind: "text", label: "Canvas behind transparency", default: "#FFFFFF", maxLength: 200 },
    },
  },
  trigger: { mode: "live", debounceMs: 100 },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "AA" },
  labels: {
    empty: "Choose your text and background colors.",
    ready: "Contrast measured.",
    running: "Measuring contrast…",
  },
  content: {
    howToUse: [
      "Choose text and background colors or paste HEX, RGB, HSL, or a CSS name.",
      "Compare the ratio with the AA and AAA thresholds. Alpha is composited over the opaque canvas color.",
      "Try a suggested foreground, swap colors, or copy the report.",
    ],
    limitations: [
      "Measures WCAG 2 contrast for solid sRGB colors. Images, gradients, blend modes, and font rendering are not evaluated.",
      "Large text means at least 24 CSS px, or about 18.67 CSS px when bold. A passing color pair alone does not establish page accessibility.",
    ],
    relatedToolIds: ["devtools.color-picker", "devtools.palette-generator", "devtools.color-converter"],
  },
} as const satisfies ToolSpec;
