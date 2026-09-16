import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.duplicate-line-remover",
  app: "devtools",
  category: "text-tools",
  keywords: ["duplicate", "dedupe", "unique lines", "remove duplicates", "uniq", "list"],
  name: "Duplicate Line Remover",
  description: "Remove repeated lines while preserving order.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "Text input",
    placeholder: "Alpha\nBeta\nAlpha",
  },
  settings: {
    fields: {
      ci: {
        kind: "toggle",
        label: "Case-insensitive",
        help: "Treat Alpha and alpha as the same line.",
        default: false,
      },
      trim: {
        kind: "toggle",
        label: "Trim lines",
        help: "Strip leading and trailing whitespace before comparing — and in the output.",
        default: true,
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Remove duplicates" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "LN-" },
  labels: {
    empty: "Paste one item per line to remove repeated lines.",
    ready: "Deduplicated lines are ready.",
    running: "Removing repeated lines…",
  },
  content: {
    howToUse: [
      "Paste your list, one entry per line. The first occurrence of each line is kept and the rest are dropped, so the original order survives.",
      "Leave 'Trim lines' on when entries were copied out of a spreadsheet or a log and may carry stray indentation.",
      "Turn on 'Case-insensitive' when `Alpha` and `alpha` should count as the same entry.",
    ],
    limitations: [
      "Comparison is exact on the whole line. Two entries differing by a trailing comma, a quote, or an internal double space are different lines.",
      "'Trim lines' also changes the output: kept lines are emitted trimmed, not in their original indentation.",
      "Case folding uses the browser's locale rules, so a few locale-specific pairs (Turkish dotted/dotless i) fold differently than you may expect.",
      "Line endings are normalised to `\\n`, and a blank line is an entry like any other — the first blank is kept, later ones are dropped.",
      "This does not sort. Use the Text Sorter if you want the result ordered.",
    ],
    faq: [
      {
        q: "Which duplicate is kept?",
        a: "The first one. Order is preserved, so the result reads like the original list with later repeats deleted.",
      },
      {
        q: "How many duplicates were removed?",
        a: "The tool does not report a count. Compare the line count of the input and output with the Character Counter if you need it.",
      },
      {
        q: "Can I remove duplicate words instead of lines?",
        a: "Yes — that is a different tool, Duplicate Word Remover.",
      },
    ],
    examples: [{ label: "Mixed-case list", text: "Alpha\nBeta\nalpha\nGamma" }],
  },
} as const satisfies ToolSpec;
