import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "media.combine-images",
  app: "media",
  category: "image-editing",
  keywords: ["combine", "merge", "collage", "grid", "montage", "images", "stitch", "layout"],
  name: "Combine Images",
  description: "Arrange images horizontally, vertically, or in a grid.",
  optionsPanel: { collapsible: false },
  layout: "stacked",
  input: {
    kind: "files",
    label: "Source images",
    accept: "image/jpeg,image/png,image/webp,image/heic,image/heif",
    multiple: true,
    engine: "image",
    maxFiles: 50,
    maxBytes: 26_214_400,
    maxTotalBytes: 104_857_600,
  },
  settings: {
    fields: {
      layout: {
        kind: "select",
        label: "Layout",
        help: "Horizontal places images in one row, vertical in one column, grid wraps them across columns.",
        default: "horizontal",
        choices: [
          { label: "Horizontal", value: "horizontal" },
          { label: "Vertical", value: "vertical" },
          { label: "Grid", value: "grid" },
        ],
      },
      columns: {
        kind: "number",
        label: "Columns",
        help: "How many images per row in the grid. Rows are filled left to right in file order.",
        default: 2,
        min: 1,
        visibleWhen: { key: "layout", equals: "grid" },
      },
      cellSizing: {
        kind: "select",
        label: "Cell sizing",
        help: "Centered keeps original pixels, Fit shows the whole image, and Fill crops it to cover the largest grid cell.",
        default: "centered",
        choices: [
          { label: "Centered · largest cell", value: "centered" },
          { label: "Fit · largest cell", value: "fit" },
          { label: "Fill · largest cell", value: "fill" },
        ],
        visibleWhen: { key: "layout", equals: "grid" },
      },
      gap: {
        kind: "number",
        label: "Gap",
        help: "Spacing in pixels between images. The gap is filled with the background colour.",
        default: 0,
        min: 0,
        suffix: "px",
      },
      background: {
        kind: "color",
        label: "Background",
        help: "Fills the gaps, the padding around differently sized images, and any transparent area.",
        default: "#ffffff",
      },
      outputFormat: {
        kind: "select",
        label: "Output format",
        help: "PNG keeps edges and flat colour crisp. JPEG is smaller for photos. WebP is smaller again where it is supported.",
        default: "png",
        choices: [
          { label: "PNG", value: "png" },
          { label: "JPEG", value: "jpeg" },
          { label: "WebP", value: "webp" },
        ],
      },
      quality: {
        kind: "slider",
        label: "Quality",
        help: "Applies to the JPEG and WebP outputs only; PNG is always lossless.",
        default: 80,
        min: 30,
        max: 100,
        suffix: "%",
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Combine images" },
  capabilities: { cancel: true, download: true, progress: true },
  workbenchMark: { text: "IMG+" },
  labels: {
    empty: "Add images to arrange into one canvas.",
    ready: "Your combined image is ready to download.",
    running: "Combining images…",
  },
  content: {
    howToUse: [
      "Add two or more images and drag them into the order you want — the first file becomes the leftmost or topmost tile, and names the output.",
      "Pick a layout: horizontal for a filmstrip, vertical for a tall stack, or grid when you want a fixed number of columns.",
      "Set the gap, background, and cell sizing. Centered keeps original pixels, Fit shows the whole image, and Fill crops it to cover the largest grid cell.",
      "Choose the output format and quality, run it, and download the single combined image.",
    ],
    limitations: [
      "Centered keeps each image at its original pixel size; Fit and Fill resample images to the largest grid cell.",
      "The combined canvas must stay under 100 megapixels, which a long row of large photos can exceed.",
      "Everything is composited to one flat image, so individual pictures cannot be edited or separated afterwards.",
      "Each source image must be 25 MiB or smaller, up to 50 files per run.",
      "HEIC files can be combined but may not show a thumbnail preview in every browser.",
    ],
    faq: [
      {
        q: "How do I control the order of the images?",
        a: "The output follows the file order in the workspace. Reorder the queue before running; the layout reads it top to bottom.",
      },
      {
        q: "Why are there wide margins around some images?",
        a: "Centered keeps smaller images at their original size inside the largest grid cell; choose Fit to enlarge the whole image or Fill to crop it flush to the cell.",
      },
      {
        q: "Which format should I choose?",
        a: "PNG for screenshots, text, and logos; JPEG for photographs where file size matters; WebP when the result is for the web and you control the browsers.",
      },
    ],
  },
} as const satisfies ToolSpec;
