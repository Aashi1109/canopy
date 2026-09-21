import type { ToolSpec } from "../../lib/tool-framework/spec";

/**
 * `maxLength` is the literal 2,000,000 rather than an import of
 * `MAX_JSON_INPUT_CHARS`: this file must load under a plain `fs` walk with no
 * bundler, so it carries type-only imports and nothing else.
 */
export default {
  toolId: "devtools.json-formatter",
  app: "devtools",
  category: "json-tools",
  keywords: ["json", "format", "beautify", "pretty print", "indent", "minify", "validate"],
  name: "JSON Formatter",
  description: "Beautify and format JSON with a chosen indentation.",
  input: {
    kind: "text",
    language: "json",
    label: "JSON input",
    acceptFiles: {
      accept: ".json,application/json,text/json",
      maxBytes: 104_857_600,
      maxEditableBytes: 2_000_000,
    },
    placeholder: '{"name":"CodeUtilityKit","version":2}',
    maxLength: 2_000_000,
  },
  settings: {
    fields: {
      operation: {
        kind: "select",
        label: "Operation",
        help: "Format, minify, or only validate the JSON.",
        default: "format",
        choices: [
          { label: "Format", value: "format" },
          { label: "Minify", value: "minify" },
          { label: "Validate", value: "validate" },
        ],
      },
      indentation: {
        kind: "select",
        label: "Indentation",
        help: "Controls indentation in formatted output.",
        default: "2",
        visibleWhen: { key: "operation", equals: "format" },
        choices: [
          { label: "2 spaces", value: "2" },
          { label: "4 spaces", value: "4" },
          { label: "Tab", value: "tab" },
        ],
      },
    },
  },
  trigger: { mode: "live", debounceMs: 120 },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "J{}", tone: "contrast" },
  labels: {
    empty: "Paste JSON to format it.",
    ready: "Formatted JSON is ready.",
    running: "Formatting JSON…",
  },
  content: {
    howToUse: [
      "Paste minified or badly indented JSON on the left. It reformats as you pause typing, so there is no button to hunt for.",
      "Pick the indentation your project uses. Two spaces is the common default; tabs matter if a linter enforces them.",
      "If the input will not parse, read the reported line and column — that is where the parser gave up, which is usually one character after the real mistake.",
      "Copy or download the formatted JSON once it looks right.",
    ],
    limitations: [
      "Editable text is capped at 2,000,000 characters. JSON files up to 100 MiB are processed in read-only large-file mode.",
      "Parsing is strict JSON. Comments, trailing commas, and single-quoted strings are rejected — use the JSON Viewer's repair pass to recover from those first.",
      "Number lexemes are preserved exactly while formatting or minifying, including integers beyond 2^53 and high-precision decimals.",
      "Formatting rewrites whitespace only. Key order is preserved as parsed, and no keys are sorted, added, or removed.",
    ],
    faq: [
      {
        q: "Is my JSON uploaded anywhere?",
        a: "No. Formatting runs entirely in this browser tab; the document never leaves your machine.",
      },
      {
        q: "Why does the reported error column look one character off?",
        a: "The parser reports where it could no longer continue, which is typically just past the actual problem — a missing comma or an unclosed bracket earlier on the line.",
      },
      {
        q: "Does formatting change my data?",
        a: "Only whitespace changes. Numbers are preserved exactly, including large integers and long decimals. When a tree preview would change a number, the result is shown as exact JSON code instead.",
      },
      {
        q: "Can I go the other way and minify?",
        a: "Yes — the workspace exposes a minify action alongside formatting, using the same parsed value.",
      },
    ],
    examples: [
      {
        label: "Minified object",
        text: '{"name":"CodeUtilityKit","version":2,"active":true}',
      },
    ],
  },
} as const satisfies ToolSpec;
