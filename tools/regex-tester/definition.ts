import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.regex-tester",
  app: "devtools",
  category: "developer-generators",
  keywords: ["regex", "regular expression", "test", "match", "capture group", "flags", "javascript"],
  name: "Regex Tester",
  description: "Test a JavaScript regular expression and list matches.",
  layout: "stacked",
  input: {
    kind: "fields",
    label: "Pattern and test string",
    fields: [
      {
        channel: "text",
        label: "Regex pattern",
        placeholder: "\\b[A-Z][a-z]+\\b",
        required: true,
      },
      {
        channel: "secondary",
        label: "Test string",
        placeholder: "Ada and Lin build Smart Tools.",
        multiline: true,
      },
    ],
  },
  settings: {
    fields: {
      flags: {
        kind: "text",
        label: "Flags",
        help: "Any combination of d g i m s u v y. The g flag is always applied so every match is listed.",
        default: "g",
        placeholder: "gi",
        maxLength: 8,
      },
    },
  },
  trigger: { mode: "live", debounceMs: 250 },
  capabilities: { copy: true },
  workbenchMark: { text: "RX?", tone: "contrast" },
  labels: {
    empty: "Provide a regex pattern and test string to inspect the matches.",
    ready: "The regex matches are up to date.",
    running: "Testing the regex pattern…",
  },
  content: {
    howToUse: [
      "Type the pattern without the surrounding slashes — `\\b[A-Z][a-z]+\\b`, not `/\\b[A-Z][a-z]+\\b/g`.",
      "Put the text to search in the second field. Results update as you type.",
      "Add flags as needed: `i` for case-insensitive, `m` to make `^` and `$` match per line, `s` to let `.` match a newline. Every match is listed with its index and any named capture groups.",
    ],
    limitations: [
      "This is the JavaScript regular expression engine. It has no atomic groups, no possessive quantifiers, and no recursion, so PCRE, Python, and Go patterns do not always transfer.",
      "Results are capped at 10,000 matches; past that the run is rejected and asks you to narrow the pattern.",
      "Only named groups are reported. Numbered capture groups are not listed separately — name them with `(?<name>…)` to see them.",
      "The `g` flag is always applied whether or not you type it, so a pattern is always evaluated against the whole string rather than stopping at the first match.",
      "`u` and `v` cannot be combined, and a repeated flag is rejected.",
      "There is no execution timeout. A catastrophically backtracking pattern (nested quantifiers over a long string, such as `(a+)+$`) will hang this browser tab until you close it — the 10,000-match cap does not help, because the engine never returns from a single failing match attempt.",
    ],
    faq: [
      {
        q: "Should I include the slashes and flags in the pattern?",
        a: "No. Enter the pattern body only, and put the flags in the Flags field. A leading `/` is taken literally.",
      },
      {
        q: "Why does my pattern hang the page?",
        a: "Catastrophic backtracking. Nested quantifiers over the same characters — `(a+)+`, `(\\s*\\w+)*` — can take exponential time on a non-matching input. Rewrite the pattern to be unambiguous rather than trying a longer subject string.",
      },
      {
        q: "How do I see my capture groups?",
        a: "Name them: `(?<year>\\d{4})-(?<month>\\d{2})`. Named groups appear in the `groups` object of each match; unnamed ones are not reported.",
      },
      {
        q: "Is my pattern or text sent to a server?",
        a: "No. The expression is compiled and run in this browser tab only.",
      },
    ],
    examples: [
      {
        label: "Capitalised words",
        text: "\\b[A-Z][a-z]+\\b",
        secondary: "Ada and Lin build Smart Tools.",
      },
    ],
  },
} as const satisfies ToolSpec;
