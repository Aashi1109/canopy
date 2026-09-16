import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "media.pdf-to-png",
  app: "media",
  category: "pdf-conversion",
  keywords: ["pdf", "png", "convert", "render", "pages", "dpi", "transparent", "export"],
  name: "PDF to PNG",
  description: "Convert selected PDF pages to PNG images.",
  input: {
    kind: "files",
    label: "Add a PDF to convert",
    dropzoneDescription: "PDF · 1 file · 100 MiB max · processed on this device",
    accept: "application/pdf,.pdf",
    multiple: false,
    engine: "pdf",
    maxFiles: 1,
    maxBytes: 104_857_600,
    maxTotalBytes: 104_857_600,
    inspect: true,
  },
  settings: {
    fields: {
      pages: {
        kind: "pages",
        label: "Pages",
        help: "Use all, or ranges such as 1-3,5,8.",
        default: "all",
      },
      dpi: {
        kind: "select",
        label: "Resolution",
        help: "150 DPI is fine for screen use. 300 DPI is print resolution and roughly quadruples the pixel count.",
        default: "150",
        choices: [
          { label: "150 DPI", value: "150" },
          { label: "300 DPI", value: "300" },
        ],
      },
      background: {
        kind: "select",
        label: "Background",
        help: "Transparent keeps the PNG alpha channel where the page has no content. White paints the page on solid white first.",
        default: "white",
        choices: [
          { label: "White", value: "white" },
          { label: "Transparent", value: "transparent" },
        ],
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Convert to PNG" },
  capabilities: { cancel: true, download: true, progress: true },
  workbenchMark: { text: "P2PN", tone: "accent" },
  labels: {
    empty: "Drop one PDF (.pdf, up to 100 MiB) to convert its pages to PNG.",
    ready: "The PDF and PNG export settings are ready.",
    running: "Converting PDF pages to PNG…",
  },
  content: {
    howToUse: [
      "Add a single PDF. It is parsed and rendered in your browser — the document is never uploaded.",
      "Choose which pages to export. Leave it on all, or enter ranges such as 1-3,5,8 to pull out just the pages you need.",
      "Pick a resolution: 150 DPI for screens and previews, 300 DPI when the page will be printed or cropped into.",
      "Choose white or a transparent background, then run the conversion. Preview and download each PNG, or download the ZIP when exporting several pages.",
    ],
    limitations: [
      "Each page becomes a flat image. Text is no longer selectable or searchable, and vector artwork becomes pixels at the chosen DPI.",
      "PNG is lossless, so files are much larger than the equivalent JPG — a 300 DPI page can run to tens of megabytes. Use PDF to JPG when size matters more than fidelity.",
      "Raster conversion is capped at 200 pages per run, and a single rendered page may not exceed 100 megapixels — a large page at 300 DPI can hit that.",
      "Encrypted or password-protected PDFs are rejected; remove the password in your PDF reader first.",
      "The PDF must be 100 MiB or smaller.",
    ],
    faq: [
      {
        q: "When should I use the transparent background?",
        a: "When you want to composite the page over something else — a slide, a mockup, a coloured layout. Areas the PDF leaves blank stay transparent instead of turning white.",
      },
      {
        q: "Why did I get a ZIP instead of images?",
        a: "Runs with more than one page include a ZIP for downloading all images together. You can also preview and download each PNG individually in the output gallery.",
      },
      {
        q: "PNG or JPG for my pages?",
        a: "PNG for pages of text, diagrams, and line art, where lossless output keeps edges crisp and transparency is available. JPG for photographic pages where a much smaller file is worth some compression artefacts.",
      },
    ],
  },
} as const satisfies ToolSpec;
