import type { ToolSpec } from "../../lib/tool-framework/spec";

/**
 * `input.accept` carries two file roles: the PDF to stamp, and — when the
 * watermark is an image — the JPG or PNG to stamp it with. The framework has a
 * single `files` channel and validates every entry against `accept`, so the
 * image formats have to be declared here for the second file to survive
 * `assertRunnableFiles`. `run.worker.ts` partitions the two by content
 * signature, not by position, and rejects a selection with no PDF in it.
 */
export default {
  toolId: "media.watermark-pdf",
  app: "media",
  category: "pdf-optimization",
  keywords: [
    "pdf",
    "watermark",
    "stamp",
    "draft",
    "confidential",
    "overlay",
    "logo",
    "opacity",
  ],
  name: "Watermark PDF",
  description: "Add a text or image watermark to PDF pages.",
  layout: "stacked",
  input: {
    kind: "files",
    label: "PDF document, plus a JPG or PNG for an image watermark",
    accept: "application/pdf,image/jpeg,image/png",
    multiple: true,
    engine: "pdf",
    maxFiles: 2,
    maxBytes: 52_428_800,
    maxTotalBytes: 52_428_800,
    inspect: true,
  },
  settings: {
    fields: {
      watermarkKind: {
        kind: "select",
        label: "Watermark",
        help: "For an image watermark, choose a JPG or PNG in these settings.",
        default: "text",
        choices: [
          { label: "Text", value: "text" },
          { label: "JPG or PNG image", value: "image" },
        ],
      },
      watermarkText: {
        kind: "text",
        label: "Text",
        help: "Must fit the standard PDF font. Use an image watermark for other scripts or unsupported characters.",
        default: "DRAFT",
        visibleWhen: { key: "watermarkKind", equals: "text" },
      },
      pages: {
        kind: "pages",
        presets: true,
        label: "Pages",
        help: "Choose which pages receive the watermark, or select pages directly in the preview.",
        default: "all",
      },
      opacity: {
        kind: "slider",
        label: "Opacity",
        default: 25,
        min: 5,
        max: 100,
        suffix: "%",
      },
      watermarkSize: {
        kind: "number",
        label: "Size",
        help: "Font size in points for a text watermark; percentage of the page width for an image.",
        default: 48,
        min: 1,
        suffix: "pt / %",
      },
      watermarkRotation: {
        kind: "number",
        label: "Rotation",
        default: -30,
        min: -180,
        max: 180,
        leadingIcon: "rotate-cw",
      },
      position: {
        kind: "position",
        label: "Position",
        help: "Anchor point on the page, with a 24-point margin from the edges.",
        default: "bottom-center",
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Apply watermark" },
  capabilities: { cancel: true, download: true, progress: true },
  workbenchMark: { text: "WM", tone: "accent" },
  labels: {
    empty: "Add a PDF to configure its watermark.",
    ready: "Your watermarked PDF is ready to download.",
    running: "Applying watermark…",
  },
  content: {
    howToUse: [
      "Add the PDF you want to stamp. It is processed in your browser — nothing is uploaded.",
      "Choose a text or image watermark. For an image, choose a JPG or PNG in the watermark settings.",
      "Set the pages, opacity, size, rotation, and anchor position. Size is a font size in points for text, and a percentage of the page width for an image.",
      "Apply the watermark and download. Check a couple of pages before you distribute the file.",
    ],
    limitations: [
      "A watermark is decoration, not protection. Anyone can remove it with the same class of tool, so never rely on it to secure a document.",
      "Text watermarks use the standard Helvetica font, which covers Latin characters only. Text it cannot encode is rejected — use an image watermark for other scripts.",
      "Image watermarks accept JPG and PNG only, and a rotated JPEG is re-encoded once so its EXIF orientation is applied.",
      "The watermark is drawn on top of existing content and may obscure it. Lower the opacity or move the anchor if that matters.",
      "Structural jobs are capped at 500 pages, and the PDF must be 50 MiB or smaller.",
    ],
    faq: [
      {
        q: "Where do I add an image watermark?",
        a: "Choose JPG or PNG image in the watermark settings, then choose your image. The PDF remains in the main preview while you adjust its watermark.",
      },
      {
        q: "Can someone remove my watermark?",
        a: "Yes. It is ordinary page content, so treat it as a visual label — a 'DRAFT' or 'CONFIDENTIAL' marker — and not as a security control.",
      },
      {
        q: "Why was my watermark text rejected?",
        a: "The standard PDF font could not encode it. That happens with non-Latin scripts and some symbols. Render the text as a PNG and use an image watermark instead.",
      },
      {
        q: "How big will my image watermark be?",
        a: "Size is a percentage of the page width, and the height follows the image's own aspect ratio, so it scales sensibly across mixed page sizes.",
      },
    ],
  },
} as const satisfies ToolSpec;
