import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.url-query-parser",
  app: "devtools",
  category: "jwt-api-tools",
  keywords: ["url", "query string", "parameters", "parse", "json", "utm", "searchparams"],
  name: "URL Query Parser",
  description: "Parse URL query parameters into JSON.",
  layout: "stacked",
  input: {
    kind: "fields",
    label: "URL or Query String",
    fields: [
      {
        channel: "text",
        label: "URL or query string",
        placeholder: "https://example.com/search?q=smart+tools&tag=web",
        required: true,
        multiline: true,
      },
    ],
  },
  settings: {
    fields: {
      decodeValues: {
        kind: "toggle",
        label: "Decode values",
        help: "Convert percent escapes and plus signs to text.",
        default: true,
      },
      coerceNumbers: {
        kind: "toggle",
        label: "Coerce numbers",
        help: "Return numeric values as JSON numbers.",
        default: false,
      },
      keepEmptyValues: {
        kind: "toggle",
        label: "Keep empty values",
        help: "Preserve parameters whose value is blank.",
        default: true,
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Parse query" },
  capabilities: { copy: true },
  workbenchMark: { text: "?{}" },
  labels: {
    empty: "Enter a URL or query string to inspect its parameters.",
    ready: "Query parameters are ready.",
    running: "Parsing query parameters…",
  },
  content: {
    howToUse: [
      "Paste either a full URL or a bare query string. A leading `?` is optional.",
      "Parse. Each parameter becomes a JSON key. Values are percent-decoded by default, with `+` read as a space.",
      "A key that appears more than once becomes an array of its values in the order they appeared — that is how repeated filters and multi-select parameters arrive.",
      "Use this to check what a redirect, a tracking link, or an OAuth callback actually carried.",
    ],
    limitations: [
      "Only the query string is read. The path, the fragment (`#...`), and any parameters hidden in the fragment are ignored.",
      "Values stay strings unless number coercion is enabled. Booleans and null-like text are never coerced.",
      "Nested conventions are not expanded: `a[b]=1` produces the literal key `a[b]`, and comma-separated values stay one string.",
      "A key repeated once yields a string and repeated twice yields an array, so a consumer has to handle both shapes.",
      "An empty query produces `{}`, which is a valid answer rather than an error.",
    ],
    faq: [
      {
        q: "Do I have to strip the URL down to the query first?",
        a: "No. Paste the whole URL — anything with a scheme or a `?` is parsed as a URL, and everything else is treated as a bare query string.",
      },
      {
        q: "Why is a repeated key an array?",
        a: "Because the query genuinely carried several values for it. Dropping all but one would lose data.",
      },
      {
        q: "Where did my `#section` parameters go?",
        a: "The fragment is never sent to a server and is not part of the query, so it is not parsed. Move those parameters before the `#` if you need them.",
      },
    ],
    examples: [
      {
        label: "Repeated parameter",
        text: "https://example.com/search?q=smart+tools&tag=dev&tag=web",
      },
      { label: "Bare query string", text: "?utm_source=newsletter&utm_medium=email" },
    ],
  },
} as const satisfies ToolSpec;
