import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.json-path-tester",
  app: "devtools",
  category: "json-tools",
  keywords: ["json", "jsonpath", "query", "path", "selector", "wildcard", "extract"],
  name: "JSON Path Tester",
  description: "Resolve dot, bracket, index, and wildcard JSON paths.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "JSON input",
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
        help: "Must start with $. Supports .key, [0], ['key'], and the * wildcard.",
        default: "$.store.book[0].title",
        placeholder: "$.store.book[0].title",
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
      "Paste the document you want to query, then write the path starting from `$` — the root.",
      "Step into objects with `.key` or `['key']`, into arrays with `[0]`, and fan out across every child with `*`.",
      "Evaluate. A path that matches one value returns that value; a path that matches several returns them as an array.",
      "Build the path one segment at a time when a query returns nothing — the error tells you the path did not match, not which segment failed.",
    ],
    limitations: [
      "This is a practical subset of JSONPath, not the full grammar: recursive descent (`..`), filter expressions (`?()`), slices (`[1:3]`), and unions (`[0,2]`) are all rejected as unsupported syntax.",
      "A path that matches nothing is an error rather than an empty result.",
      "A single match and a one-element multi-match are indistinguishable in the output — both print the bare value.",
      "Key names inside `.key` segments are limited to word characters, `$`, and `-`. Anything else must use the `['key']` form.",
    ],
    faq: [
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
