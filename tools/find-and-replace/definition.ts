import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.find-and-replace",
  app: "devtools",
  category: "text-tools",
  keywords: ["find", "replace", "search", "substitute", "regex", "bulk edit", "text"],
  name: "Find and Replace",
  description: "Replace literal text or regular-expression matches.",
  layout: "side-by-side",
  input: {
    kind: "text",
    label: "Source text",
    surface: "card",
    placeholder: "Deploy the staging API, then verify the staging URL.",
  },
  settings: {
    fields: {
      find: { kind: "text", label: "Find", pane: "input", default: "staging" },
      replace: { kind: "text", label: "Replace with", pane: "input", default: "production" },
      regex: {
        kind: "toggle",
        label: "Regex",
        help: "Read the find field as a regular expression instead of literal text.",
        default: false,
      },
      ci: { kind: "toggle", label: "Ignore case", default: false },
    },
  },
  trigger: { mode: "manual", actionLabel: "Replace" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "RPLC" },
  labels: {
    result: "Replaced text",
    empty: "Paste the text you want to search and replace.",
    ready: "Replaced text is ready.",
    running: "Replacing matching text…",
  },
  content: {
    howToUse: [
      "Paste the text you want to edit. Matching words are highlighted directly in the source.",
      "Enter what to find and what to replace it with. Each match shows an inline old-to-new preview before you apply the replacement.",
      "Turn on Regex to treat the find field as a regular expression — then $1, $2 and $& work in the replacement.",
      "Turn on Ignore case to match regardless of capitalisation. The replacement is inserted exactly as typed, so it does not follow the original casing.",
    ],
    limitations: [
      "Replacement is global and unconditional. Inline previews show every match, but individual matches cannot be excluded.",
      "In literal mode the find text is escaped, so regex metacharacters such as . and * match themselves.",
      "Regex mode uses Unicode mode, which rejects some lenient legacy patterns — an unescaped stray backslash is an error rather than a literal.",
    ],
    faq: [
      {
        q: "How do I use a capture group in the replacement?",
        a: "Turn on Regex and reference groups as $1, $2, and so on. $& inserts the whole match, and $$ inserts a literal dollar sign.",
      },
      {
        q: "Why does my pattern fail with an error?",
        a: "Regex mode compiles with the u flag. Escapes that are tolerated without it — such as \\- outside a character class — are invalid here. Remove the redundant backslash.",
      },
      {
        q: "Does Ignore case preserve the original capitalisation?",
        a: "No. It only affects matching. The replacement text is inserted verbatim.",
      },
    ],
    examples: [
      {
        label: "Replace an environment name",
        text: "Deploy the staging API, then verify the staging URL.",
      },
    ],
  },
} as const satisfies ToolSpec;
