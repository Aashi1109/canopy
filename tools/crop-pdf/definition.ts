import { MEDIA_FILE_ERROR_MESSAGES, MEDIA_PDF_ERROR_MESSAGES } from "../../lib/tool-framework/mediaErrorMessages.ts";
import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  messages: {
    "progress.croppingPdfPage": "Cropping PDF page",

    "errors.cropPages": "Choose pages from 1 to {count, number}.",
    "errors.cropDimensions": "Enter non-negative Left and Bottom values and positive Width and Height.",
    "errors.cropBeyondPage":
      "The crop extends beyond page {page, number}. Reduce its position or size, or change the selected pages.",
    "errors.cropPagesTooSmall": "The selected pages are too small to crop.",

    "readiness.wholeNumbers": "Enter whole-number points for Left, Bottom, Width, and Height.",
    "readiness.positiveDimensions": "Width and Height must be greater than zero.",

    ...MEDIA_FILE_ERROR_MESSAGES,
    ...MEDIA_PDF_ERROR_MESSAGES,
    "errors.noFiles": "Choose a PDF to crop.",
    "errors.invalidCrop": "The crop box must stay within every selected page.",
    "workspace.apply_crop_to_968ae0": "Apply crop to",
    "workspace.all_pages_903542": "All pages",
    "workspace.odd_pages_e31c32": "Odd pages",
    "workspace.even_pages_bd5d2d": "Even pages",
    "workspace.custom_pages_ffe911": "Custom pages",
    "workspace.page_range_6578bb": "Page range",
    "workspace.crop_box_pdf_4d9949": "Crop box · PDF points",
    "workspace.use_whole_number_cc79b4":
      "Use whole-number points. Bottom is measured upward from the page edge. 72 pt = 1 inch.",
    "workspace.crop_pdf_dc4bdb": "Crop PDF",
    "workspace.drag_to_move_22b33b":
      "Drag to move. Drag an edge or corner to resize. Arrow keys move by 1 pt; Shift moves by 10 pt.",
    "workspace.edit_crop_d614bb": "Edit crop",
    "workspace.crop_another_pdf_2a6923": "Crop another PDF",
    "workspace.pagesSelected": "{selected} of {count, plural, one {# page selected} other {# pages selected}}",
    "workspace.pagesSelectedSummary":
      "{selected} of {count, plural, one {# page selected} other {# pages selected}}. {unchanged} unchanged.",
    "workspace.pagesCroppedSummary":
      "{selected} of {count, plural, one {# page cropped} other {# pages cropped}}. {unchanged} unchanged.",
    "workspace.dimensions.cropX": "Left",
    "workspace.dimensions.cropY": "Bottom",
    "workspace.dimensions.cropWidth": "Width",
    "workspace.dimensions.cropHeight": "Height",
    "workspace.cropSettings": "Crop settings",
  },
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
