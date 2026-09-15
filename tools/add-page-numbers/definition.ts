import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "media.add-page-numbers",
  app: "media",
  category: "pdf-optimization",
  keywords: ["pdf", "page numbers", "pagination", "numbering", "footer", "header", "stamp"],
  name: "Add Page Numbers",
  description: "Add configurable page numbers to a PDF.",
  input: {
    kind: "files",
    label: "Add a PDF to number",
    dropzoneDescription:
      "PDF · 1 file · 50 MiB max · processed on this device",
    accept: "application/pdf,.pdf",
    multiple: false,
    engine: "pdf",
    inspect: true,
    maxFiles: 1,
    maxBytes: 52_428_800,
    maxTotalBytes: 52_428_800,
  },
  settings: {
    fields: {
      format: {
        kind: "select",
        label: "Format",
        help: "What is printed on each page: the bare number, a Page N label, or N / total.",
        default: "number",
        choices: [
          { label: "1", value: "number" },
          { label: "Page 1", value: "page-number" },
          { label: "1 / 10", value: "number-of-total" },
        ],
      },
      start: {
        kind: "number",
        label: "Start at",
        help: "The number printed on the first page. Use it to continue the numbering of another document.",
        default: 1,
        min: 0,
      },
      fontSize: {
        kind: "number",
        label: "Font size",
        help: "Size of the number in PDF points. 12 matches typical body text.",
        default: 12,
        min: 6,
        suffix: "pt",
      },
      textColor: {
        kind: "color",
        label: "Text color",
        help: "Choose a color or enter a six-digit hex value, such as #1a1a1a.",
        default: "#1a1a1a",
      },
      position: {
        kind: "position",
        label: "Position",
        help: "Where the number sits on the page. It is inset 24 points from the edges.",
        default: "bottom-center",
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Add page numbers" },
  capabilities: { cancel: true, download: true, progress: true },
  workbenchMark: { text: "#+" },
  labels: {
    empty: "Drop one PDF (.pdf, up to 50 MiB) to add page numbers.",
    ready: "Your numbered PDF is ready to download.",
    running: "Adding page numbers…",
  },
  content: {
    howToUse: [
      "Add a single PDF. Every page in it is numbered — the numbering is applied to the whole document.",
      "Choose the format: a bare number for a clean look, Page N when the label helps, or N / total when readers need to know how much is left.",
      "Set the starting number if this document continues another one, so a second volume can begin at 51 rather than 1.",
      "Pick the position on the nine-point grid, font size, and text color, then run and download the numbered PDF.",
    ],
    limitations: [
      "Numbers are drawn on top of the existing page. If the chosen corner already has content, the number will overlap it — move it to a clearer corner.",
      "Every page is numbered; there is no way to skip a cover page or number only a range.",
      "Numbers use Helvetica; the typeface is not configurable.",
      "The document is capped at 500 pages, and encrypted or password-protected PDFs are rejected.",
    ],
    faq: [
      {
        q: "What does the total in 1 / 10 count?",
        a: "The number of pages in the document, offset by your starting number — starting at 5 on a 10-page file gives 5 / 14, so the last page still reads correctly.",
      },
      {
        q: "Can I skip the cover page?",
        a: "Not directly. Split the cover off, number the rest starting at 2, and merge the cover back on.",
      },
      {
        q: "Can the numbers be removed later?",
        a: "No. They are drawn into the page content, so keep the original file if you may need an unnumbered copy.",
      },
    ],
  },
} as const satisfies ToolSpec;
