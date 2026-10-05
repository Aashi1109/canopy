import { DIFF_EXECUTION_MESSAGES } from "../../lib/devtools/shared/execution-messages.ts";
import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.text-diff-checker",
  sharing: { version: 1 },
  app: "devtools",
  category: "text-tools",
  keywords: ["diff", "compare", "text", "changes", "lines", "difference", "review"],
  name: "Text Diff Checker",
  description: "Compare two texts line by line.",
  layout: "side-by-side",
  input: {
    kind: "fields",
    label: "Text Versions",
    fields: [
      {
        channel: "text",
        label: "Original text",
        placeholder: "alpha\nbeta\ngamma",
        required: true,
        multiline: true,
      },
      {
        channel: "secondary",
        label: "Changed text",
        placeholder: "alpha\nbeta updated\ngamma",
        multiline: true,
      },
    ],
  },
  settings: { fields: {} },
  trigger: { mode: "manual", actionLabel: "Compare text" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "+/-", tone: "contrast" },
  labels: {
    empty: "Provide the original and changed text to compare them.",
    ready: "Line-by-line comparison is ready.",
    running: "Comparing text line by line…",
  },
  messages: {
    ...DIFF_EXECUTION_MESSAGES,
    "textDiff.changed":
      "{added, plural, one {# line} other {# lines}} added · {removed, plural, one {# line} other {# lines}} removed",
    "textDiff.identical": "No differences",
    "textDiff.comparison":
      "Comparing changed text against original text. Whitespace is significant; line endings are normalized.",
    "textDiff.original": "Original text",
    "textDiff.changedText": "Changed text",

    "workspace.editText": "Edit text",
  },
  content: {
    howToUse: [
      "Paste the original version in the first field and the changed version in the second.",
      "Click Compare text to see both versions aligned side by side. Removed lines appear on the left with a minus; added lines appear on the right with a plus.",
      "Choose Edit text to return to both editors and compare again. Matching text is reported as No differences, with both versions still visible.",
      "Copy or download the marked-up result to paste into a review comment or a ticket.",
    ],
    limitations: [
      "The comparison is line-based. A one-character edit is reported as the whole line being replaced; there is no word-level or character-level highlighting.",
      "Lines are matched exactly, including leading and trailing whitespace, so a re-indent registers as a change.",
      "The alignment is capped: the product of the two line counts must stay under four million — roughly 2,000 lines against 2,000 lines. Larger inputs are rejected rather than allowed to freeze the tab.",
      "The output is a readable marker format, not a unified diff with hunk headers, so it cannot be fed to `git apply`.",
    ],
    faq: [
      {
        q: "Does my text leave the browser?",
        a: "No. Both versions are compared locally in this tab and are never uploaded.",
      },
      {
        q: "Why is a moved block shown as a delete plus an add?",
        a: "The alignment finds the longest common subsequence, which has no way to express a move. A relocated block appears as a removal at the old position and an addition at the new one.",
      },
      {
        q: "Are CRLF and LF line endings treated the same?",
        a: "Yes. Both inputs are split on CR, LF, or CRLF, so a line-ending difference alone does not register as a change.",
      },
      {
        q: "Can I use this output as a patch file?",
        a: "No. It is a review format, not a unified diff.",
      },
    ],
    examples: [
      {
        label: "One edited line",
        text: "alpha\nbeta\ngamma",
        secondary: "alpha\nbeta updated\ngamma",
      },
    ],
  },
} as const satisfies ToolSpec;
