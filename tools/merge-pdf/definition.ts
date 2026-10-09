import { MEDIA_FILE_ERROR_MESSAGES, MEDIA_PDF_ERROR_MESSAGES } from "../../lib/tool-framework/mediaErrorMessages.ts";
import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  messages: {
    "progress.copyingPdfPages": "Copying PDF pages",
    "progress.copyingPdfPage": "Copying PDF page",

    ...MEDIA_FILE_ERROR_MESSAGES,
    ...MEDIA_PDF_ERROR_MESSAGES,
    "errors.invalidOrder": "The selected PDF order is invalid.",
  },
  toolId: "media.merge-pdf",
  app: "media",
  category: "pdf-organization",
  keywords: ["pdf", "merge", "combine", "join", "append", "order", "documents"],
  name: "Merge PDF",
  description: "Merge PDF files in the order you choose.",
  input: {
    kind: "files",
    label: "PDF documents",
    accept: "application/pdf",
    multiple: true,
    engine: "pdf",
    maxFiles: 20,
    maxBytes: 52_428_800,
    maxTotalBytes: 52_428_800,
  },
  settings: { fields: {} },
  trigger: { mode: "manual", actionLabel: "Merge PDFs" },
  capabilities: { cancel: true, download: true, progress: true },
  workbenchMark: { text: "P+P", tone: "accent" },
  labels: {
    empty: "Add PDFs in the order they should be merged.",
    ready: "PDF order is ready.",
    running: "Merging PDFs…",
  },
  content: {
    howToUse: [
      "Add every PDF you want in the merged document. They are all parsed in your browser, so nothing leaves your machine.",
      "Put the files in the order you want them. The merged document follows the list from top to bottom, and each file contributes all of its pages.",
      "Watch the combined page count: the merge is capped at 500 pages, and it stops as soon as the running total crosses that.",
      "Run the merge and download the single combined PDF. The originals are left untouched.",
    ],
    limitations: [
      "At most 20 PDFs per merge, each 50 MiB or smaller, and 50 MiB across the whole selection.",
      "The merged result may not exceed 500 pages; the copy fails the moment the running page count passes that limit.",
      "Encrypted or password-protected PDFs are rejected. Remove the password in your PDF reader first.",
      "Pages are copied structurally, so bookmarks, form fields, and links that depend on document-level structure can be dropped or lose their targets.",
    ],
    faq: [
      {
        q: "How is the page order decided?",
        a: "It follows the file list, and each file contributes all of its pages in their original order. Reorder the list before running to change the result.",
      },
      {
        q: "Can I merge only some pages of a file?",
        a: "Not here — merge copies whole documents. Use Extract PDF Pages first to cut each file down, then merge the extracts.",
      },
      {
        q: "What is the output named?",
        a: "The first file in the list, with a -merged suffix. Put the document you consider primary at the top.",
      },
    ],
  },
} as const satisfies ToolSpec;
