import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "media.image-to-pdf",
  app: "media",
  category: "pdf-conversion",
  keywords: ["image", "pdf", "convert", "jpg", "png", "scan", "document", "pages"],
  name: "Image to PDF",
  description: "Combine local images into one PDF.",
  input: {
    kind: "files",
    label: "Source images",
    accept: "image/jpeg,image/png,image/webp,image/heic,image/heif",
    multiple: true,
    engine: "image",
    maxFiles: 50,
    maxBytes: 26_214_400,
    maxTotalBytes: 52_428_800,
  },
  settings: {
    fields: {
      page: {
        kind: "select",
        label: "Page",
        help: "Auto sizes each page to its image. A4 and Letter give every page the same fixed size.",
        default: "auto",
        choices: [
          { label: "Auto", value: "auto" },
          { label: "A4", value: "a4" },
          { label: "Letter", value: "letter" },
        ],
      },
      orientation: {
        kind: "select",
        label: "Orientation",
        help: "Auto follows each image: wider than tall becomes landscape, otherwise portrait.",
        default: "auto",
        choices: [
          { label: "Auto", value: "auto" },
          { label: "Portrait", value: "portrait" },
          { label: "Landscape", value: "landscape" },
        ],
      },
      margin: {
        kind: "select",
        label: "Margin",
        help: "White space around the image on every page: none, small (18pt), or normal (36pt).",
        default: "small",
        choices: [
          { label: "None", value: "none" },
          { label: "Small", value: "small" },
          { label: "Normal", value: "normal" },
        ],
      },
      fit: {
        kind: "select",
        label: "Fit",
        help: "Contain keeps the whole image visible inside the margins. Fill covers the page and crops the overflowing edges.",
        default: "contain",
        choices: [
          { label: "Contain", value: "contain" },
          { label: "Fill", value: "fill" },
        ],
      },
      quality: {
        kind: "select",
        label: "Quality",
        help: "Original embeds untouched JPG and PNG data. Balanced and Small re-encode to JPEG to shrink the document.",
        default: "balanced",
        choices: [
          { label: "Original", value: "original" },
          { label: "Balanced", value: "balanced" },
          { label: "Small", value: "small" },
        ],
      },
      background: {
        kind: "color",
        label: "Alpha background",
        help: "Transparent pixels are flattened onto this colour, since a PDF page has no alpha channel.",
        default: "#ffffff",
      },
      filename: {
        kind: "text",
        label: "Output filename",
        help: "Name of the produced PDF. A .pdf extension is added when it is missing.",
        default: "converted-images.pdf",
        maxLength: 120,
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Create PDF" },
  capabilities: { cancel: true, download: true, progress: true },
  workbenchMark: { text: "I2P", tone: "accent" },
  labels: {
    empty: "Add images to build a PDF.",
    ready: "PDF settings are ready.",
    running: "Creating PDF…",
  },
  content: {
    howToUse: [
      "Add your images and drag them into reading order — each one becomes a page, top of the list first. Rotate any page that came off the camera sideways.",
      "Choose a page size: Auto matches every page to its own image, while A4 or Letter gives a uniform document you can print.",
      "Set the margin and fit. Contain keeps the whole image visible; Fill crops it to cover the page, which suits full-bleed photo books but loses the edges.",
      "Pick a quality — Original for archival scans, Balanced for everyday sharing, Small for email — name the file, and download the finished PDF.",
    ],
    limitations: [
      "Original quality only avoids re-encoding for untouched JPG and PNG files. Rotating a page, an EXIF-rotated photo, or a WebP or HEIC source forces a JPEG re-encode.",
      "The PDF contains pictures, not text. Nothing in it is searchable or selectable, and this tool does no OCR.",
      "Each image must be 25 MiB or smaller, selected images must total 50 MiB or less, and each decoded image is capped at 100 megapixels.",
      "Transparency is flattened onto the alpha background colour, because a PDF page cannot be transparent.",
      "HEIC images are supported but may not preview as thumbnails in every browser — check the order by filename.",
    ],
    faq: [
      {
        q: "How do I set the page order?",
        a: "Pages follow the file order in the workspace. Reorder the queue before running, and use the per-file rotation control for images that need turning.",
      },
      {
        q: "Which quality setting should I use?",
        a: "Original when the source images are already sized right and you want no further loss; Balanced for a much smaller file at close to the same look; Small when the PDF has to fit an attachment limit.",
      },
      {
        q: "Why is my image cropped?",
        a: "Fit is set to Fill, which scales the image to cover the whole content box and cuts whatever hangs over. Switch to Contain to keep every pixel inside the page.",
      },
    ],
  },
} as const satisfies ToolSpec;
