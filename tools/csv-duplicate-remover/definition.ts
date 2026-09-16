import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.csv-duplicate-remover",
  app: "devtools",
  // `slugFromName("CSV Duplicate Row Remover")` is "csv-duplicate-row-remover",
  // which is not the folder name. The folder name is the live indexed URL and
  // is frozen at first insert, so it is declared explicitly here.
  slug: "csv-duplicate-remover",
  category: "csv-data-tools",
  keywords: ["csv", "duplicate", "dedupe", "unique", "rows", "distinct", "clean"],
  name: "CSV Duplicate Row Remover",
  description: "Remove repeated CSV data rows.",
  input: {
    kind: "text",
    label: "CSV input",
    placeholder: "name,role\nAda,Admin\nAda,Admin",
  },
  settings: {
    fields: {
      delimiter: {
        kind: "select",
        label: "Delimiter",
        help: "Used for both reading and writing — the output keeps the same delimiter.",
        default: ",",
        choices: [
          { label: "Comma", value: "," },
          { label: "Semicolon", value: ";" },
          { label: "Tab", value: "\t" },
          { label: "Pipe", value: "|" },
        ],
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Remove duplicates" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "ROW-" },
  labels: {
    empty: "Paste CSV with a header row to remove duplicate rows.",
    ready: "Deduplicated CSV is ready.",
    running: "Removing duplicate rows…",
  },
  content: {
    howToUse: [
      "Paste the CSV. The first row is always kept as the header and is never treated as a duplicate.",
      "Set the delimiter to match your file, then remove duplicates.",
      "A row is a duplicate only when every field matches an earlier row exactly. The first occurrence is kept and the order of the surviving rows is unchanged.",
      "If duplicates survive, check for stray whitespace or differing case — run the CSV Formatter first to trim cells, then dedupe.",
    ],
    limitations: [
      "Matching is exact and case-sensitive across the whole row. `Ada` and ` ada ` are different rows.",
      "You cannot dedupe on a subset of columns — the comparison always uses every field.",
      "Every row must have the same field count as the header; a ragged file is rejected.",
      "Blank rows are dropped as part of parsing.",
    ],
    faq: [
      {
        q: "Which copy of a duplicate is kept?",
        a: "The first one, in the order it appears. Later copies are removed.",
      },
      {
        q: "Can I dedupe by a single key column?",
        a: "Not here — the whole row is the key. Extract the columns you care about first if you need key-based deduplication.",
      },
      {
        q: "Is the header row ever removed?",
        a: "No. It is split off before deduplication and always written back first.",
      },
    ],
    examples: [
      { label: "Repeated row", text: "name,age\nAda,36\nLin,29\nAda,36" },
      { label: "No duplicates", text: "id,value\n1,a\n2,b" },
    ],
  },
} as const satisfies ToolSpec;
