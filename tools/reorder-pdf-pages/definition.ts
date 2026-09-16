import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "media.reorder-pdf-pages",
  app: "media",
  category: "pdf-organization",
  keywords: ["pdf", "reorder", "rearrange", "page order", "sort pages", "move pages", "organize", "shuffle"],
  name: "Reorder PDF Pages",
  description: "Rearrange PDF pages with accessible controls.",
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
        label: "Page order",
        help: "Every page exactly once, in the order you want them. Seeded from the document when previews load.",
        default: [1],
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Reorder pages" },
  capabilities: { cancel: true, download: true, progress: true },
  workbenchMark: { text: "P<>", tone: "accent" },
  labels: {
    empty: "Add a PDF to reorder its pages.",
    ready: "Page order is ready.",
    running: "Reordering pages…",
  },
  content: {
    howToUse: [
      "Add a single PDF. Page thumbnails are rendered in your browser so you can see what you are moving — nothing is uploaded.",
      "Drag the previews into the order you want, or use the keyboard controls to move a page up or down without a mouse.",
      "The order starts as the document's own, so you only need to move the pages that are wrong.",
      "Reorder and download. The output is a new PDF whose pages appear in the order you set.",
    ],
    limitations: [
      "The order must contain every page exactly once. This tool rearranges pages; it cannot drop or duplicate them — use Delete PDF Pages or Extract PDF Pages for that.",
      "Page content, links, and form fields move with their page, but a link that pointed at a page number rather than a named destination may end up pointing somewhere else.",
      "Structural jobs are capped at 500 pages, and the PDF must be 50 MiB or smaller.",
      "Encrypted or password-protected PDFs are rejected, and reordering invalidates an existing digital signature.",
      "One document at a time. To interleave two PDFs, merge them first and then reorder.",
    ],
    faq: [
      {
        q: "Can I delete or duplicate a page here?",
        a: "No. A reorder is a permutation, and the run is rejected unless every page appears exactly once. Delete PDF Pages and Extract PDF Pages cover the other cases.",
      },
      {
        q: "Is the document re-rendered?",
        a: "No. Pages are copied structurally, so text stays selectable and images keep their original quality.",
      },
      {
        q: "Do bookmarks and links survive?",
        a: "Content moves with its page. Named destinations follow correctly; links written against absolute page numbers can end up pointing at the wrong page after a reorder.",
      },
    ],
  },
} as const satisfies ToolSpec;
