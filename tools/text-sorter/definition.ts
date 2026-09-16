import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.text-sorter",
  app: "devtools",
  category: "text-tools",
  keywords: ["sort", "lines", "alphabetical", "order", "ascending", "descending", "list"],
  name: "Text Sorter",
  description: "Sort lines ascending or descending.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "Lines of text",
    placeholder: "Banana\napple\nCherry",
  },
  settings: {
    fields: {
      order: {
        kind: "select",
        label: "Order",
        default: "asc",
        choices: [
          { label: "A → Z", value: "asc" },
          { label: "Z → A", value: "desc" },
        ],
      },
      ci: {
        kind: "toggle",
        label: "Case-insensitive",
        help: "On, `apple` sorts next to `Apple`. Off, uppercase and lowercase are distinct.",
        default: true,
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Sort lines" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "A-Z" },
  labels: {
    empty: "Enter one item per line to sort the list.",
    ready: "Sorted lines are ready.",
    running: "Sorting lines…",
  },
  content: {
    howToUse: [
      "Paste your list, one item per line.",
      "Pick the direction and decide whether case should matter, then sort.",
      "Sorting uses locale-aware comparison, so accented letters land next to their base letter rather than after `z`.",
      "Every input line is kept — blank lines and duplicates are sorted, not removed.",
    ],
    limitations: [
      "This is a lexicographic sort, not a numeric one: `10` sorts before `9`. Pad numbers with leading zeros if you need numeric order.",
      "Blank lines are preserved and sort to the top; duplicates are preserved.",
      "Comparison uses the browser's default locale, so the exact ordering of accented and non-Latin characters can differ between machines.",
      "There is no sort-by-column or sort-by-field — the whole line is the key.",
    ],
    faq: [
      {
        q: "Why is `10` before `9`?",
        a: "Lines are compared as text, character by character, so `1` precedes `9`. Zero-pad to `09` and `10` for numeric order.",
      },
      {
        q: "Does it remove duplicates?",
        a: "No. Use a duplicate-line remover first if you want a unique sorted list.",
      },
      {
        q: "What happens to leading whitespace?",
        a: "It is part of the line and affects the sort. Trim your input first if that is not what you want.",
      },
    ],
    examples: [
      { label: "Mixed case", text: "Banana\napple\nCherry" },
      { label: "Numbers as text", text: "9\n10\n1" },
    ],
  },
} as const satisfies ToolSpec;
