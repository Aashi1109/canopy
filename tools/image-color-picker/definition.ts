import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.image-color-picker",
  app: "devtools",
  category: "color-design-tools",
  name: "Image Color Picker",
  description: "Pick exact pixel colors and extract a palette from an image locally.",
  keywords: ["image", "color", "picker", "palette", "pixel", "hex"],
  outputLanguage: "css",
  input: {
    kind: "files",
    label: "Image",
    accept: "image/png,image/jpeg,image/webp,image/gif",
    multiple: false,
    maxFiles: 1,
    maxBytes: 20 * 1024 * 1024,
    engine: "image",
    inspect: false,
  },
  settings: {
    fields: {
      x: { kind: "number", label: "Pixel X", default: 0, min: 0, max: 24_000_000 },
      y: { kind: "number", label: "Pixel Y", default: 0, min: 0, max: 24_000_000 },
      colors: { kind: "number", label: "Palette colors", default: 6, min: 3, max: 12 },
    },
  },
  trigger: { mode: "live", debounceMs: 80 },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "IMG" },
  labels: {
    empty: "Choose an image to sample its colors.",
    ready: "Pixel color and palette are ready.",
    running: "Reading image colors…",
  },
  content: {
    howToUse: [
      "Choose or drop a PNG, JPEG, WebP, or GIF image. Processing stays in your browser.",
      "Click or drag across the image to sample pixels live. Use the magnifier for precision, arrow keys to move the selection, or enter zero-based X/Y coordinates.",
      "Copy the selected HEX, RGB, or HSL value. Copy or download the extracted palette as CSS variables.",
    ],
    limitations: [
      "Images are limited to 20 MB and 24 million pixels. Animated files use their first frame.",
      "The palette is approximate: it uses a 256-pixel thumbnail, groups similar colors, and weights partially transparent pixels by alpha. Fully transparent pixels are excluded.",
      "Selected pixel values are taken from the browser-decoded sRGB image, so embedded image profiles may be converted by the browser.",
    ],
  },
} as const satisfies ToolSpec;
