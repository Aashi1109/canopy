import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "media.resize-pdf-pages",
  app: "media",
  category: "pdf-organization",
  keywords: ["pdf", "resize", "scale", "page size", "a4", "letter", "margin", "orientation"],
  name: "Resize PDF Pages",
  description: "Resize PDF pages and their contents.",
  input: {
    kind: "files",
    label: "Add a PDF to resize",
    dropzoneDescription: "PDF · 1 file · 50 MiB max · processed on this device",
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
        help: "Which pages to resize. Leave it on all, or list pages such as 1-3,5.",
        default: "all",
      },
      pageSize: {
        kind: "select",
        label: "Page size",
        help: "The target sheet size. Choose Custom to type exact dimensions in PDF points.",
        default: "a4",
        choices: [
          { label: "A4", value: "a4" },
          { label: "US Letter", value: "letter" },
          { label: "US Legal", value: "legal" },
          { label: "Custom", value: "custom" },
        ],
      },
      width: {
        kind: "number",
        label: "Width",
        help: "Custom page width in PDF points. 72 points is one inch, so A4 is 595 by 842.",
        default: 595,
        min: 1,
        suffix: "pt",
        visibleWhen: { key: "pageSize", equals: "custom" },
      },
      height: {
        kind: "number",
        label: "Height",
        help: "Custom page height in PDF points.",
        default: 842,
        min: 1,
        suffix: "pt",
        visibleWhen: { key: "pageSize", equals: "custom" },
      },
      orientation: {
        kind: "select",
        label: "Orientation",
        help: "Portrait keeps the long edge vertical; landscape swaps the target width and height.",
        default: "portrait",
        choices: [
          { label: "Portrait", value: "portrait" },
          { label: "Landscape", value: "landscape" },
        ],
      },
      fit: {
        kind: "select",
        label: "Fit",
        help: "Contain scales the page to fit inside the margins, cover fills them and clips the overflow, stretch distorts to fill exactly.",
        default: "contain",
        choices: [
          { label: "Contain", value: "contain" },
          { label: "Cover", value: "cover" },
          { label: "Stretch", value: "stretch" },
        ],
      },
      margin: {
        kind: "number",
        label: "Margin",
        help: "Blank border in PDF points kept on every side of the resized content.",
        default: 18,
        min: 0,
        suffix: "pt",
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Resize pages" },
  capabilities: { cancel: true, download: true, progress: true },
  workbenchMark: { text: "PSZ", tone: "accent" },
  labels: {
    empty: "Drop one PDF (up to 50 MiB) to resize its pages.",
    ready: "Your resized PDF is ready to download.",
    running: "Resizing PDF pages…",
  },
  content: {
    howToUse: [
      "Add a single PDF and choose which pages to resize — all of them, or just the ones that are the wrong size.",
      "Pick the target sheet: A4, US Letter, US Legal, or Custom with exact width and height in PDF points (72 points to the inch).",
      "Set the orientation and the margin. The margin is a blank border kept on all four sides, and the page content is placed inside what is left.",
      "Choose how the old page is fitted into that area — Contain to keep it whole, Cover to fill the area and clip the overflow, Stretch to distort it exactly — then run and download.",
    ],
    limitations: [
      "The content is scaled, not reflowed. Text does not re-wrap, so a portrait page forced into landscape gets smaller rather than re-laid-out.",
      "Cover clips whatever falls outside the margins, and the clipped content is gone from the output.",
      "Annotation rectangles are shifted and scaled with the page, but interactive widgets can still end up misaligned in strict PDF readers.",
      "The document is capped at 500 pages, and encrypted or password-protected PDFs are rejected.",
    ],
    faq: [
      {
        q: "Why is my content smaller than the new page?",
        a: "The margin. Content is fitted inside the page minus the margin on every side, so a large margin shrinks it. Set the margin to 0 to use the whole sheet.",
      },
      {
        q: "What unit are width, height, and margin in?",
        a: "PDF points — 72 to the inch. A4 is 595 by 842 points, US Letter is 612 by 792.",
      },
      {
        q: "Does resizing make the file smaller?",
        a: "Not meaningfully. The page geometry changes but the same content is stored; use Compress PDF if the goal is a smaller file.",
      },
    ],
  },
} as const satisfies ToolSpec;
