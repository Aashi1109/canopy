import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "media.extract-pdf-pages",
  app: "media",
  category: "pdf-organization",
  keywords: ["pdf", "extract", "pages", "select", "subset", "copy", "range"],
  name: "Extract PDF Pages",
  description: "Create a PDF from selected pages.",
  input: {
    kind: "files",
    label: "Add a PDF to extract pages",
    dropzoneDescription:
      "PDF · 1 file · 50 MiB max · processed on this device",
    accept: "application/pdf,.pdf",
    multiple: false,
    engine: "pdf",
    maxFiles: 1,
    maxBytes: 52_428_800,
    maxTotalBytes: 52_428_800,
    inspect: true,
  },
  settings: {
    fields: {
      pages: {
        kind: "pages",
        label: "Pages",
        help: "Click pages in the preview to select or deselect them, or enter pages such as 1-3,5,8. They are written out in the order you list them.",
        default: [1],
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Extract pages" },
  capabilities: { cancel: true, download: true, progress: true },
  workbenchMark: { text: "PGX" },
  labels: {
    empty: "Drop one PDF (.pdf, up to 50 MiB) to extract selected pages.",
    ready: "Your extracted PDF is ready to download.",
    running: "Extracting pages…",
  },
  content: {
    howToUse: [
      "Add a single PDF. It is parsed in your browser and its real page count is used to check your selection.",
      "Enter the pages you want to keep — a list such as 1,4,9, a range such as 2-7, or a mix of both.",
      "The order you type is the order you get, so 5,1,3 puts page 5 first; use that to reorder while you extract.",
      "Run the extraction and download the single new PDF. The original file is left exactly as it was.",
    ],
    limitations: [
      "The source document is capped at 500 pages.",
      "Every page you list must exist in the document, and no page may be listed twice — either stops the run with an error.",
      "Only whole pages can be extracted; cropping a region of a page is the job of Crop PDF.",
      "Encrypted or password-protected PDFs are rejected; remove the password first.",
      "Links, bookmarks, and form fields that point at pages you left behind do not survive the copy.",
    ],
    faq: [
      {
        q: "Can I get one file per page instead?",
        a: "Use Split PDF in every-page mode. Extract always produces a single document containing the pages you chose.",
      },
      {
        q: "Does it remove the pages from the original?",
        a: "No. Extraction copies into a new file. Use Delete PDF Pages if you want the pages gone from the document instead.",
      },
      {
        q: "Why was my selection rejected?",
        a: "Either a page number falls outside the document, or the same page appears more than once. Both are checked against the real page count before anything is copied.",
      },
    ],
  },
} as const satisfies ToolSpec;
