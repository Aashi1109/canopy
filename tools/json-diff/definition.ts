import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.json-diff",
  app: "devtools",
  category: "json-tools",
  keywords: ["json", "diff", "compare", "difference", "changes", "patch", "path"],
  name: "JSON Diff",
  description: "Compare two JSON values by path.",
  layout: "side-by-side",
  input: {
    kind: "fields",
    label: "JSON documents to compare",
    fields: [
      {
        channel: "text",
        label: "JSON A",
        placeholder: '{"name":"Ada","active":true}',
        required: true,
        multiline: true,
      },
      {
        channel: "secondary",
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
      'Compare, then read each line as a path. `~ $.user.name: "a" → "b"` says that one leaf changed and nothing else under it did.',
      "An empty result is reported as `No differences.` — that is a genuine match, not a failed run.",
    ],
    limitations: [
      "Object keys are compared by name, so a reordered object shows no differences. Arrays are compared by index, so inserting one element at the front reports every later element as changed.",
      "The output is a path listing, not an RFC 6902 patch, and cannot be applied programmatically.",
      "Values are compared with `Object.is`, so `0` and `-0` differ while `NaN` matches `NaN`.",
      "Very large documents produce one line per differing leaf, which can be longer than the inputs.",
    ],
    faq: [
      {
        q: "What do the symbols mean?",
        a: "`+` is added in B, `-` is removed from B, and `~` is a changed value shown as old → new.",
      },
      {
        q: "Why does reordering an array show so many changes?",
        a: "Arrays are matched by position, not by content. Sort both sides consistently before comparing if order is not meaningful.",
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
