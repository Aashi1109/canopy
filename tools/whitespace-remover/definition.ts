import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.whitespace-remover",
  app: "devtools",
  category: "text-tools",
  keywords: ["whitespace", "trim", "spaces", "blank lines", "indentation", "clean text"],
  name: "Whitespace Remover",
  description: "Remove selected kinds of whitespace.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "Text input",
    placeholder: "Hello    world\n\nNext line.",
  },
  settings: {
    fields: {
      mode: {
        kind: "select",
        label: "Mode",
        help: "Which whitespace to strip. 'Extra spaces' is the safe default; 'All whitespace' also removes newlines.",
        default: "extra",
        choices: [
          { label: "Extra spaces", value: "extra" },
          { label: "All whitespace", value: "all" },
          { label: "Leading", value: "leading" },
          { label: "Trailing", value: "trailing" },
          { label: "Blank lines", value: "blank" },
        ],
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Remove whitespace" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "SP-" },
  labels: {
    empty: "Enter text to remove unwanted whitespace.",
    ready: "Cleaned text is ready.",
    running: "Removing whitespace…",
  },
  content: {
    howToUse: [
      "Paste the text, then pick the narrowest mode that solves your problem.",
      "'Extra spaces' collapses runs of spaces and tabs to one and trims each line — the usual choice for text pasted out of a PDF or an email.",
      "'Leading' and 'Trailing' strip only one side of every line; 'Blank lines' removes empty lines; 'All whitespace' removes every space, tab, and newline and leaves one unbroken string.",
    ],
    limitations: [
      "'All whitespace' also removes newlines, so it destroys the line structure. It is for building a single token, not for tidying prose.",
      "'Extra spaces' collapses only spaces and tabs; it does not collapse repeated blank lines.",
      "'Leading' and 'Trailing' match any whitespace, newlines included, so on a run of blank lines they can join lines together.",
      "Zero-width and non-breaking characters that look like spaces are matched by the Unicode-aware modes ('All') but not by the space-and-tab collapse in 'Extra spaces'.",
      "The tool never re-wraps or re-indents; it only removes.",
    ],
    faq: [
      {
        q: "Which mode should I use for text copied from a PDF?",
        a: "'Extra spaces'. It collapses the double and triple spaces that PDF extraction inserts while keeping the line breaks.",
      },
      {
        q: "How do I remove indentation but keep the lines?",
        a: "'Leading'. It strips whitespace from the start of every line and leaves the line breaks in place.",
      },
      {
        q: "Does it touch non-breaking spaces?",
        a: "'All whitespace' does, because it matches Unicode whitespace. 'Extra spaces' matches only the ASCII space and tab, so a non-breaking space survives it.",
      },
    ],
    examples: [
      {
        label: "Padded lines",
        text: "  Hello    smart tools  \n\n  Next line.  ",
      },
    ],
  },
} as const satisfies ToolSpec;
