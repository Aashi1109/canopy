import type { ToolSpec } from "../../lib/tool-framework/spec";

/**
 * `pages` is a `text` field rather than a `pages` field on purpose. A `pages`
 * default must be non-empty (`"all"`, `"odd"`, `"even"`, or a non-empty list),
 * and every one of those pre-selects pages for deletion. For a destructive
 * tool the correct starting state is "nothing selected", which only an empty
 * string can express. `run.worker.ts` parses it with `parsePageSelection`.
 */
export default {
  toolId: "media.delete-pdf-pages",
  app: "media",
  category: "pdf-organization",
  keywords: ["pdf", "delete pages", "remove pages", "drop pages", "trim", "pages", "organize", "cleanup"],
  name: "Delete PDF Pages",
  description: "Remove selected pages while keeping a valid PDF.",
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
        kind: "text",
        label: "Pages to delete",
        help: "Ranges such as 1-3,5, or odd / even. Empty means nothing is deleted, which is the starting state.",
        default: "",
        placeholder: "e.g. 1-3,5",
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Delete pages" },
  capabilities: { cancel: true, download: true, progress: true },
  workbenchMark: { text: "PG-" },
  labels: {
    empty: "Add a PDF to remove pages.",
    ready: "Page selection is ready.",
    running: "Deleting pages…",
  },
  content: {
    howToUse: [
      "Add a single PDF. Page thumbnails are rendered in your browser so you can see exactly what you are removing — nothing is uploaded.",
      "Select the pages to delete in the preview, or type them as ranges such as 1-3,5. Nothing is selected until you choose, so a mis-click cannot silently drop a page.",
      "Check the selection. Deletion is applied to the copy you download; the file you added is never modified.",
      "Delete and download. At least one page must remain, so a selection covering the whole document is rejected.",
    ],
    limitations: [
      "At least one page must survive. A PDF with no pages is not a valid document, so an all-pages selection is refused.",
      "Deleting a page does not shrink the file proportionally: shared resources such as fonts and embedded images may still be referenced by the pages that remain.",
      "Bookmarks and internal links that pointed at a deleted page are left dangling.",
      "Structural jobs are capped at 500 pages, and the PDF must be 50 MiB or smaller.",
      "Encrypted or password-protected PDFs are rejected, and deleting pages invalidates an existing digital signature.",
    ],
    faq: [
      {
        q: "Why did nothing get deleted?",
        a: "The selection was empty, which is the deliberate starting state for a destructive tool. Pick the pages in the preview or type a range first.",
      },
      {
        q: "Can I delete every page?",
        a: "No. A PDF must contain at least one page, so that run is rejected rather than producing a file no reader will open.",
      },
      {
        q: "Why is the output barely smaller?",
        a: "Fonts, images, and other resources are often shared between pages, so removing a page frees only what nothing else references. Run Compress PDF afterwards if size matters.",
      },
      {
        q: "Is the original file changed?",
        a: "Never. Everything happens on a copy in your browser and you download the result; the file you selected is untouched.",
      },
    ],
  },
} as const satisfies ToolSpec;
