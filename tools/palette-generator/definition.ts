import type { ToolSpec } from "../../lib/tool-framework/spec";
export default {
  toolId: "devtools.palette-generator",
  app: "devtools",
  category: "color-design-tools",
  name: "Palette Generator",
  description: "Build harmonious color palettes, keep your favorites, and export reusable color tokens.",
  keywords: ["palette", "color", "scheme", "harmony", "tokens", "swatches"],
  input: { kind: "none" },
  outputLanguage: "css",
  settings: {
    fields: {
      seed: { kind: "text", label: "Starting color", default: "#3366FF", maxLength: 200 },
      harmony: {
        kind: "select",
        label: "Harmony",
        default: "analogous",
        choices: [
          { label: "Analogous", value: "analogous" },
          { label: "Complementary", value: "complementary" },
          { label: "Triadic", value: "triadic" },
          { label: "Monochromatic", value: "monochromatic" },
        ],
      },
      count: { kind: "number", label: "Colors", default: 5, min: 2, max: 10 },
      variation: { kind: "number", label: "Variation", default: 0, min: 0 },
      colors: { kind: "textarea", label: "Palette colors", default: "" },
      format: {
        kind: "select",
        label: "Export format",
        default: "css",
        choices: [
          { label: "CSS variables", value: "css" },
          { label: "JSON", value: "json" },
          { label: "SVG swatches", value: "svg" },
        ],
      },
    },
  },
  trigger: { mode: "live", debounceMs: 100 },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "PAL" },
  labels: { empty: "Choose a starting color.", ready: "Palette is ready.", running: "Updating palette…" },
  content: {
    howToUse: [
      "Choose a starting color and harmony, then generate a palette of 2–10 colors.",
      "Select any swatch to edit it. Lock colors you want to keep when generating another variation.",
      "Drag the handles to change the order, or focus a handle and press Space, arrow keys, then Space.",
      "Copy CSS variables, or download CSS, JSON, or an SVG swatch sheet.",
    ],
    limitations: [
      "Harmonies use the HSL color wheel. A pleasing palette does not guarantee readable text; check intended pairs in Contrast Checker.",
    ],
    relatedToolIds: ["devtools.contrast-checker", "devtools.image-color-picker", "devtools.gradient-generator"],
  },
} as const satisfies ToolSpec;
