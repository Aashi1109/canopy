import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.json-diff",
  app: "devtools",
  category: "json-tools",
  keywords: ["json", "diff", "compare", "difference", "changes", "patch", "path"],
  name: "JSON Diff",
  description: "Compare two JSON documents side by side and see what changed.",
  layout: "side-by-side",
  input: {
    kind: "fields",
    label: "JSON documents to compare",
    fields: [
      {
        channel: "text",
        language: "json",
        label: "JSON A",
        placeholder: '{"name":"Ada","active":true}',
        required: true,
        multiline: true,
      },
      {
        channel: "secondary",
        language: "json",
        label: "JSON B",
        placeholder: '{"name":"Ada","active":false,"role":"admin"}',
        required: true,
        multiline: true,
      },
    ],
  },
  settings: {
    fields: {
      repairMode: {
        kind: "select",
        label: "Auto-fix broken JSON",
        help: "Applies to both sides. Turn it off when a difference in validity is itself the thing you are looking for.",
        default: "remove",
        choices: [
          { label: "Remove broken parts", value: "remove" },
          { label: "Set broken values to null", value: "null" },
          { label: "Off (strict)", value: "off" },
        ],
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Compare JSON" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "J!=", tone: "contrast" },
  labels: {
    empty: "Paste two JSON values to compare them.",
    ready: "JSON differences are ready.",
    running: "Comparing JSON…",
  },
  content: {
    howToUse: [
      "Paste the baseline into JSON A and the candidate into JSON B. The direction matters: `-` means present only in A, `+` means present only in B.",
      "Leave auto-fix on when either side was copied from a log; switch to strict to make invalid JSON an error instead of a silent repair.",
      "Click Compare JSON to align both documents. Removed lines appear on the left with a minus; added lines appear on the right with a plus.",
      "Matching JSON is reported as No differences, with both documents still visible. Edit either document to compare again.",
    ],
    limitations: [
      "Object keys are sorted for comparison, so formatting and key order do not create changes. Array order remains significant.",
      "The output is a line comparison, not an RFC 6902 patch, and cannot be applied programmatically.",
      "Numbers use JavaScript precision. Negative zero remains distinct from zero.",
      "Very large or deeply nested documents must be compared in smaller sections to keep the browser responsive.",
    ],
    faq: [
      {
        q: "What do the symbols mean?",
        a: "`+` marks a line added in JSON B. `-` marks a line removed from JSON A. A changed value appears as a removed line on the left and an added line on the right.",
      },
      {
        q: "Does formatting or ordering affect the comparison?",
        a: "Whitespace and object key order are ignored. Array order is meaningful, so moving an array item appears as a removal and addition.",
      },
      {
        q: "Is anything uploaded?",
        a: "No. Both documents stay in this browser tab.",
      },
    ],
    examples: [
      {
        label: "Changed and added key",
        text: '{"name":"Ada","active":true}',
        secondary: '{"name":"Ada","active":false,"role":"admin"}',
      },
      {
        label: "Identical values",
        text: '{"id":1}',
        secondary: '{"id":1}',
      },
    ],
  },
} as const satisfies ToolSpec;
