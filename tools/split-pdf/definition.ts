import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "media.split-pdf",
  app: "media",
  category: "pdf-organization",
  keywords: ["pdf", "split", "divide", "separate", "pages", "ranges", "interval"],
  name: "Split PDF",
  description: "Split a PDF by page, interval, or range.",
  layout: "stacked",
  optionsPanel: { defaultCollapsed: false },
  input: {
    kind: "files",
    label: "Add a PDF to split",
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
      mode: {
        kind: "select",
        label: "Split mode",
        help: "How the document is cut up: one file per page, fixed-size chunks, or explicit ranges.",
        default: "every-page",
        choices: [
          { label: "Every page", value: "every-page" },
          { label: "Every N pages", value: "interval" },
          { label: "Custom ranges", value: "ranges" },
        ],
      },
      interval: {
        kind: "number",
        label: "Pages per file",
        help: "Each output file takes this many pages; the last file keeps whatever is left over.",
        default: 1,
        min: 1,
        visibleWhen: { key: "mode", equals: "interval" },
      },
      ranges: {
        kind: "text",
        label: "Ranges",
        help: "One output file per range, separated by semicolons — 1-3;4-6 gives two files. Inside a range use commas and hyphens, such as 1,3,5-9.",
        default: "1",
        placeholder: "1-3;4-6",
        visibleWhen: { key: "mode", equals: "ranges" },
      },
      bundleAsZip: {
        kind: "toggle",
        label: "Bundle as ZIP",
        help: "Add a ZIP archive while keeping the individual PDF downloads.",
        default: true,
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Split PDF" },
  capabilities: { cancel: true, download: true, progress: true },
  workbenchMark: { text: "P|P", tone: "contrast" },
  labels: {
    empty: "Drop one PDF (up to 50 MiB) to split by page, interval, or range.",
    ready: "Your split PDFs are ready to download.",
    running: "Splitting PDF…",
  },
  content: {
    howToUse: [
      "Add a single PDF. It is read in your browser and its page count is detected for you.",
      "Choose Every page to burst the document into one file per page — handy for scanned batches where each sheet is its own record.",
      "Choose Every N pages and set the count when the document has a regular structure, such as a two-page invoice repeated many times.",
      "Choose Custom ranges and enter one range per output file separated by semicolons — 1-3;4-6 produces two PDFs — then run the split and download the parts.",
    ],
    limitations: [
      "The source document is capped at 500 pages; anything longer is rejected before splitting starts.",
      "Ranges must stay inside the document and may not repeat a page within the same range; either mistake stops the run with an error.",
      "Every-page mode on a long document produces one file per page, so a 300-page PDF becomes 300 outputs.",
      "Encrypted or password-protected PDFs are rejected; remove the password first.",
      "Pages are copied structurally, so links and form fields pointing at pages outside their own part end up dangling.",
    ],
    faq: [
      {
        q: "What separates one output file from the next in ranges mode?",
        a: "The semicolon. Commas and hyphens build up the pages inside a single output, so 1-3,7;8-9 gives one file with pages 1, 2, 3, 7 and a second with pages 8 and 9.",
      },
      {
        q: "Can a page appear in more than one output?",
        a: "Across separate ranges, yes — 1-5;3-8 is fine. Repeating a page inside a single range is an error.",
      },
      {
        q: "How are the output files named?",
        a: "The source filename with a -part-01, -part-02 suffix, numbered in the order the ranges were given.",
      },
    ],
  },
} as const satisfies ToolSpec;
