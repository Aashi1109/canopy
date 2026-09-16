import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "media.compress-pdf",
  app: "media",
  category: "pdf-optimization",
  keywords: [
    "pdf",
    "compress",
    "shrink",
    "optimize",
    "reduce size",
    "qpdf",
    "flatten",
    "downsample",
  ],
  name: "Compress PDF",
  description: "Reduce PDF size with structural or strong compression.",
  input: {
    kind: "files",
    label: "Add a PDF to compress",
    dropzoneDescription: "PDF · 1 file · 100 MiB max · processed on this device",
    accept: "application/pdf,.pdf",
    multiple: false,
    engine: "pdf",
    inspect: true,
    maxFiles: 1,
    maxBytes: 104_857_600,
    maxTotalBytes: 104_857_600,
  },
  settings: {
    fields: {
      mode: {
        kind: "select",
        label: "Compression mode",
        help: "Preserve Document rewrites the file structure and keeps text, links, forms, and accessibility intact. Strong Compression rasterizes every page.",
        default: "preserve",
        choices: [
          { label: "Preserve Document", value: "preserve" },
          { label: "Strong Compression", value: "strong" },
        ],
      },
      removeMetadata: {
        kind: "toggle",
        label: "Remove document metadata",
        help: "Text, links, forms, annotations, bookmarks, and accessibility structures remain structural where qpdf permits.",
        default: true,
        visibleWhen: { key: "mode", equals: "preserve" },
      },
      strongPreset: {
        kind: "select",
        label: "Preset",
        help: "Lower DPI means a smaller file and coarser pages.",
        default: "balanced",
        choices: [
          { label: "High · 150 DPI", value: "high" },
          { label: "Balanced · 120 DPI", value: "balanced" },
          { label: "Smallest · 96 DPI", value: "smallest" },
        ],
        visibleWhen: { key: "mode", equals: "strong" },
      },
      color: {
        kind: "select",
        label: "Color",
        help: "Grayscale and black-and-white shrink scanned documents further.",
        default: "original",
        choices: [
          { label: "Original", value: "original" },
          { label: "Grayscale", value: "grayscale" },
          { label: "Black and white", value: "black-and-white" },
        ],
        visibleWhen: { key: "mode", equals: "strong" },
      },
      confirmed: {
        kind: "toggle",
        label: "I understand document content will be flattened",
        help: "Strong Compression cannot run until this is acknowledged.",
        default: false,
        visibleWhen: { key: "mode", equals: "strong" },
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Compress PDF" },
  capabilities: { cancel: true, download: true, progress: true },
  workbenchMark: { text: "PDF-" },
  labels: {
    empty: "Drop one PDF (.pdf, up to 100 MiB) to compress it.",
    ready: "Your compressed PDF is ready to download.",
    running: "Compressing PDF…",
  },
  content: {
    howToUse: [
      "Add a single PDF. It is compressed in your browser — the document is never uploaded.",
      "Leave the mode on Preserve Document for almost every file. It rewrites object streams and recompresses embedded data with qpdf, and selectable text, links, forms, bookmarks, and accessibility structure all survive.",
      "Turn on Remove document metadata to drop the producer, author, and XMP blocks as part of the same rewrite.",
      "Only reach for Strong Compression when a scan-heavy file must get dramatically smaller. It renders each page to a JPEG, so pick a preset and colour mode, tick the acknowledgement, and check the result before you use it.",
    ],
    limitations: [
      "Preserve Document needs a cross-origin-isolated browser, because qpdf runs as WebAssembly over a SharedArrayBuffer. If that is unavailable the run fails outright — there is no silent fallback to a lossy mode.",
      "Strong Compression is destructive. Selectable text, links, forms, digital signatures, bookmarks, annotations, and accessibility information are all lost, and the pages become images.",
      "A file that is already well compressed may barely shrink, or grow slightly. Preserve Document never guarantees a smaller output.",
      "Preserve Document supports PDFs up to 100 MiB and 500 pages. Strong Compression supports PDFs up to 50 MiB and rasterizes at most 200 pages.",
      "Encrypted or password-protected PDFs are rejected. Remove the password in your PDF reader first.",
    ],
    faq: [
      {
        q: "Which mode should I use?",
        a: "Preserve Document, unless you have measured that it is not enough. It is lossless for page content and keeps the document usable; Strong Compression trades the document away for size.",
      },
      {
        q: "Why did Preserve Document fail with an availability error?",
        a: "qpdf needs SharedArrayBuffer, which the browser only exposes on a cross-origin-isolated page. Reload the tool, and if it still fails the browser or an extension is blocking isolation. Nothing is silently downgraded.",
      },
      {
        q: "Why is my compressed file barely smaller?",
        a: "Most of the bytes are probably already-compressed images. Preserve Document can only improve the structural layer; the images are untouched by design.",
      },
      {
        q: "Does compressing remove a digital signature?",
        a: "Any rewrite invalidates an existing signature, and Strong Compression removes it entirely. Sign after compressing, not before.",
      },
    ],
  },
} as const satisfies ToolSpec;
