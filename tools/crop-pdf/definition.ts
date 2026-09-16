import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "media.crop-pdf",
  app: "media",
  category: "pdf-organization",
  keywords: ["pdf", "crop", "crop box", "trim", "margins", "pages", "resize page", "points"],
  name: "Crop PDF",
  description: "Change the visible crop box on selected pages.",
  layout: "stacked",
  input: {
    kind: "files",
    label: "PDF document",
    accept: "application/pdf",
    multiple: false,
    engine: "pdf",
    maxBytes: 52_428_800,
    maxTotalBytes: 52_428_800,
    inspect: true,
  },
  settings: {
    fields: {
      pages: {
        kind: "pages",
        label: "Pages",
        help: "Use all, odd, even, or ranges such as 1-3,5.",
        default: "all",
      },
      cropX: {
        kind: "number",
        label: "Left",
        help: "Distance from the left edge of the page to the left edge of the crop box.",
        default: 0,
        min: 0,
        suffix: "pt",
      },
      cropY: {
        kind: "number",
        label: "Bottom",
        help: "PDF coordinates start at the bottom-left corner, so this is measured upwards.",
        default: 0,
        min: 0,
        suffix: "pt",
      },
      cropWidth: {
        kind: "number",
        label: "Width",
        help: "Seeded from the narrowest selected page when previews load.",
        default: 0,
        min: 0,
        suffix: "pt",
      },
      cropHeight: {
        kind: "number",
        label: "Height",
        help: "Seeded from the shortest selected page when previews load.",
        default: 0,
        min: 0,
        suffix: "pt",
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Crop PDF" },
  capabilities: { cancel: true, download: true, progress: true },
  workbenchMark: { text: "PCUT" },
  labels: {
    empty: "Add a PDF to set its visible crop area.",
    ready: "Crop area is ready to apply.",
    running: "Cropping PDF…",
  },
  content: {
    howToUse: [
      "Add a single PDF. Page previews are rendered in your browser so you can see what you are cropping — the document is never uploaded.",
      "Choose which pages to crop. The same crop box is applied to every page you select, so crop mixed-size pages in separate passes.",
      "Set Left, Bottom, Width, and Height in PDF points (72 points = 1 inch). PDF coordinates start at the bottom-left corner, so Bottom counts upwards, not downwards.",
      "Run the crop and download. Width and Height are pre-filled from the smallest selected page, so the default box is always valid.",
    ],
    limitations: [
      "Cropping only sets the crop box. The content outside it is hidden, not deleted — it is still present in the file and can be recovered by resetting the box.",
      "One crop box is applied to every selected page. If the box would fall outside any of them the run is rejected rather than silently clamped.",
      "Everything is measured in PDF points, not pixels or millimetres, and the origin is the bottom-left corner.",
      "Structural jobs are capped at 500 pages, and the PDF must be 50 MiB or smaller.",
      "Encrypted or password-protected PDFs are rejected, and cropping invalidates an existing digital signature.",
    ],
    faq: [
      {
        q: "Is the cropped-away content actually removed?",
        a: "No. A crop box changes what a viewer displays and prints; the underlying page objects are untouched. Use it for presentation, never to redact sensitive content.",
      },
      {
        q: "Why is Bottom measured from the bottom?",
        a: "That is the PDF coordinate system: the origin sits at the bottom-left of the page and y grows upwards. Every PDF tool works this way.",
      },
      {
        q: "Why was my crop box rejected?",
        a: "It extended past the edge of at least one selected page. Either shrink the box or select only the pages it fits, since one box has to satisfy them all.",
      },
      {
        q: "How do I convert millimetres to points?",
        a: "Multiply by 72 and divide by 25.4 — a 10 mm margin is about 28.35 points.",
      },
    ],
  },
} as const satisfies ToolSpec;
