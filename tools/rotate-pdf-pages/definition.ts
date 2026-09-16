import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "media.rotate-pdf-pages",
  app: "media",
  category: "pdf-organization",
  keywords: ["pdf", "rotate", "turn pages", "landscape", "portrait", "orientation", "sideways", "pages"],
  name: "Rotate PDF Pages",
  description: "Rotate all or selected PDF pages.",
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
      degrees: {
        kind: "select",
        label: "Rotation",
        help: "Applied clockwise, on top of each page's existing rotation.",
        default: "90",
        choices: [
          { label: "90°", value: "90" },
          { label: "180°", value: "180" },
          { label: "270°", value: "270" },
        ],
      },
      rotateSelectedOnly: {
        kind: "toggle",
        label: "Rotate selected only",
        help: "Turn off to rotate every page regardless of the page selection.",
        default: true,
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Rotate pages" },
  capabilities: { cancel: true, download: true, progress: true },
  workbenchMark: { text: "P90", tone: "accent" },
  labels: {
    empty: "Add a PDF to rotate pages.",
    ready: "Rotation settings are ready.",
    running: "Rotating pages…",
  },
  content: {
    howToUse: [
      "Add a single PDF. Page thumbnails are rendered in your browser so you can see which way each page currently faces — nothing is uploaded.",
      "Choose the pages to rotate. Leave it on all, or use odd, even, or ranges such as 1-3,5 when a scanner produced alternating orientations.",
      "Pick 90°, 180°, or 270°. Rotation is clockwise and is added to whatever rotation the page already has, so running 90° twice gives 180°.",
      "Rotate and download. Only the page rotation changes; the content itself is untouched.",
    ],
    limitations: [
      "Only quarter turns are supported, because a PDF page rotation is defined as a multiple of 90 degrees. Arbitrary angles are not possible.",
      "Rotation is relative, not absolute: it is added to the page's current rotation rather than replacing it. Two 270° runs leave a page at 180°.",
      "The page content and its box are unchanged — a viewer simply displays the page turned. Nothing is re-rendered and no quality is lost.",
      "Structural jobs are capped at 500 pages, and the PDF must be 50 MiB or smaller.",
      "Encrypted or password-protected PDFs are rejected, and rotating pages invalidates an existing digital signature.",
    ],
    faq: [
      {
        q: "Is the rotation absolute or relative?",
        a: "Relative. The chosen angle is added to each page's existing rotation, which is what you want when a document already contains a mix of orientations.",
      },
      {
        q: "How do I fix a scan where every other page is upside down?",
        a: "Select odd or even to match the affected pages and apply 180°. That is exactly the case the page selection exists for.",
      },
      {
        q: "Does rotating reduce quality or change the file size?",
        a: "No. Only a page attribute is rewritten; text stays selectable and images keep their original data.",
      },
    ],
  },
} as const satisfies ToolSpec;
