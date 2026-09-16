import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "media.pdf-to-jpg",
  app: "media",
  category: "pdf-conversion",
  keywords: ["pdf", "jpg", "jpeg", "convert", "render", "pages", "dpi", "export"],
  name: "PDF to JPG",
  description: "Convert selected PDF pages to JPG images.",
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
      quality: {
        kind: "slider",
        label: "Quality",
        help: "JPEG quality of each rendered page. Pages are always rendered on a white background.",
        default: 80,
        min: 30,
        max: 100,
        suffix: "%",
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Convert to JPG" },
  capabilities: { cancel: true, download: true, progress: true },
  workbenchMark: { text: "P2JP", tone: "accent" },
  labels: {
    empty: "Drop one PDF, up to 100 MiB, to convert its pages to JPG.",
    ready: "PDF-to-JPG page settings are ready.",
    running: "Converting PDF pages to JPG…",
  },
  content: {
    howToUse: [
      "Add a single PDF. It is parsed and rendered in your browser — the document is never uploaded.",
      "Choose which pages to export. Leave it on all, or enter ranges such as 1-3,5,8 to pull out just the pages you need.",
      "Pick a resolution: 150 DPI for screens, email, and previews; 300 DPI when the page will be printed or cropped into.",
      "Set the JPEG quality, run the conversion, and download. One page gives you a single JPG; several pages are bundled into a ZIP.",
    ],
    limitations: [
      "Each page becomes a flat image. Text is no longer selectable or searchable, and vector artwork becomes pixels at the chosen DPI.",
      "JPEG cannot store transparency, so every page is rendered on white. Use PDF to PNG if you need a transparent background.",
      "Raster conversion is capped at 200 pages per run, and a single rendered page may not exceed 100 megapixels — a large page at 300 DPI can hit that.",
      "Encrypted or password-protected PDFs are rejected; remove the password in your PDF reader first.",
      "The PDF must be 100 MiB or smaller.",
    ],
    faq: [
      {
        q: "Why did I get a ZIP instead of images?",
        a: "Any run that produces more than one page is packaged as a ZIP so the download stays a single file. Convert one page at a time if you want a bare JPG.",
      },
      {
        q: "Which DPI should I choose?",
        a: "150 DPI matches typical screen use and keeps files small. Choose 300 DPI only when the output is destined for print or will be zoomed into, since file size and memory use rise sharply.",
      },
      {
        q: "Can I get the text back out afterwards?",
        a: "Not from the JPG. Rendering flattens the page, so keep the original PDF if you still need to select, search, or copy the text.",
      },
    ],
  },
} as const satisfies ToolSpec;
