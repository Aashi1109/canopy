import { INPUT_EXECUTION_MESSAGES, JSON_EXECUTION_MESSAGES } from "../../lib/devtools/shared/execution-messages.ts";
import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  messages: {
    ...INPUT_EXECUTION_MESSAGES,
    ...JSON_EXECUTION_MESSAGES,
    "execution.errors.path-required": "Enter a JSON path.",
    "execution.recovery.path-required":
      "Choose a suggested key, enter a path such as users[0].name, or use $ for the whole document.",
    "execution.errors.path-unsupported": "JSONPath contains unsupported syntax.",
    "execution.recovery.path-unsupported":
      "Use .key, [0], [''key''], and * only — filters and recursive descent are not supported.",
    "execution.errors.path-no-match": "JSONPath did not match any value.",
    "execution.recovery.path-no-match": "Check each segment against the document — one of them selects nothing.",
    "workspace.jsonpath_b049fd": "JSONPath",
    "workspace.fix_the_json_fcfea9": "Fix the JSON to see suggestions. The $ root prefix is optional.",
    "workspace.suggestions_come_from_e5e304": "Suggestions come from your JSON. The $ root prefix is optional.",
  },
  toolId: "devtools.json-path-tester",
  app: "devtools",
  category: "json-tools",
  keywords: ["json", "jsonpath", "query", "path", "selector", "wildcard", "extract"],
  name: "JSON Path Tester",
  description: "Resolve dot, bracket, index, and wildcard JSON paths.",
  layout: "side-by-side",
  outputLanguage: "json",
  input: {
    kind: "text",
    language: "json",
    label: "JSON input",
    surface: "card",
    placeholder: '{"store":{"book":[{"title":"Codex"}]}}',
  },
  settings: {
    fields: {
      repairMode: {
        kind: "select",
        label: "Auto-fix broken JSON",
        help: "Repairs trailing commas, comments, and single quotes before the path is evaluated.",
        default: "remove",
        choices: [
          { label: "Remove broken parts", value: "remove" },
          { label: "Set broken values to null", value: "null" },
          { label: "Off (strict)", value: "off" },
        ],
      },
      path: {
        kind: "text",
        label: "JSONPath",
        pane: "input",
        help: "Suggestions come from your JSON. The $ root prefix is optional.",
        default: "store.book[0].title",
        placeholder: "users[0].name",
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Evaluate path" },
  capabilities: { copy: true },
  workbenchMark: { text: "$.", tone: "contrast" },
  labels: {
    empty: "Paste JSON and enter a path to evaluate.",
    ready: "JSONPath result is ready.",
    running: "Evaluating JSONPath…",
  },
  content: {
    howToUse: [
      "Paste the document you want to query, then type a path or choose a suggestion. The `$` root prefix is optional.",
      "Step into objects with `.key` or `['key']`, into arrays with `[0]`, and fan out across every child with `*`.",
      "Evaluate. A path that matches one value returns that value; a path that matches several returns them as an array.",
      "Build the path one segment at a time when a query returns nothing — the error tells you the path did not match, not which segment failed.",
    ],
    limitations: [
      "This is a practical subset of JSONPath, not the full grammar: recursive descent (`..`), filter expressions (`?()`), slices (`[1:3]`), and unions (`[0,2]`) are all rejected as unsupported syntax.",
      "A path that matches nothing is an error rather than an empty result.",
      "A single match and a one-element multi-match are indistinguishable in the output — both print the bare value.",
      "Use bracket notation such as `['first name']` for keys containing spaces or punctuation; suggestions insert the correct notation.",
    ],
    faq: [
      {
        q: "Do I need to start my path with $?",
        a: "No. $ means the root of the JSON document, but this tool accepts paths with or without it. For example, users[0].name and $.users[0].name return the same value. Use $ alone to select the whole document.",
      },
      {
        q: "Why does my `$..author` path fail?",
        a: "Recursive descent is not supported. Walk the levels explicitly, or use `*` to fan out one level at a time.",
      },
      {
        q: "How do I select every element of an array?",
        a: "Use `[*]`, for example `$.store.book[*].title`.",
      },
      {
        q: "Why is 'did not match any value' an error?",
        a: "It is nearly always a typo in the path rather than an intentional empty query, so it is surfaced loudly.",
      },
    ],
    examples: [
      {
        label: "Index into an array",
        text: '{"store":{"book":[{"title":"Codex"}]}}',
      },
      {
        label: "Wildcard fan-out",
        text: '{"users":[{"name":"Ada"},{"name":"Lin"}]}',
      },
    ],
  },
} as const satisfies ToolSpec;
