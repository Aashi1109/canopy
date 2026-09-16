import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.url-query-builder",
  app: "devtools",
  category: "jwt-api-tools",
  keywords: ["url", "query string", "querystring", "parameters", "encode", "builder", "search params"],
  name: "URL Query Builder",
  description: "Append key/value query rows to a base URL.",
  layout: "stacked",
  input: {
    kind: "fields",
    label: "Base URL and query rows",
    fields: [
      {
        channel: "text",
        label: "Base URL",
        placeholder: "https://example.com/search",
        required: true,
      },
      {
        channel: "secondary",
        label: "Query rows",
        placeholder: "q=smart tools\ntag=dev\ntag=web",
        multiline: true,
      },
    ],
  },
  settings: {
    fields: {
      parameters: {
        kind: "rows",
        label: "Query parameters",
        help: "Add key/value pairs alongside any rows entered above.",
        default: [],
        keyLabel: "Parameter key",
        valueLabel: "Value",
        pane: "main",
        span: "full",
      },
      encodeValues: {
        kind: "toggle",
        label: "Encode values",
        help: "Escape reserved characters in appended values.",
        default: true,
      },
      skipEmptyRows: {
        kind: "toggle",
        label: "Skip empty rows",
        help: "Omit parameters whose value is blank.",
        default: false,
      },
      sortParameters: {
        kind: "toggle",
        label: "Sort parameters",
        help: "Order parameters by key for stable output.",
        default: false,
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Build URL" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "?+=" },
  labels: {
    empty: "Provide a base URL and any key=value query rows to build the URL.",
    ready: "The URL is ready to copy or download.",
    running: "Building the URL…",
  },
  content: {
    howToUse: [
      "Put the absolute http or https base URL in the first field. Any query string already on it is kept.",
      "List parameters as `key=value` lines or add key/value rows below. Values are trimmed and encoded by default; turn encoding off only when the destination expects raw values.",
      "Repeat a key on several lines to send it more than once — `tag=dev` and `tag=web` produce `tag=dev&tag=web`.",
    ],
    limitations: [
      "Rows are appended, never replaced. A key already present in the base URL will appear twice.",
      "The split is on the first `=` in the line, so a value may contain `=` but a key may not. A line with no `=`, or one starting with `=`, is rejected.",
      "Encoding follows `URLSearchParams`: a space becomes `+`, not `%20`. Both are valid in a query string, but a server that decodes the query as a path segment will read `+` literally.",
      "Blank lines are skipped. There is no comment syntax — every non-blank line must be a pair.",
      "Only http and https URLs are accepted.",
    ],
    faq: [
      {
        q: "Why is my space encoded as `+` instead of `%20`?",
        a: "That is the `application/x-www-form-urlencoded` rule that `URLSearchParams` follows, and it is correct for a query string. Only switch to `%20` if a specific consumer requires it.",
      },
      {
        q: "How do I replace an existing parameter rather than add to it?",
        a: "Remove it from the base URL first. This tool only appends. The UTM Builder has an explicit replace mode if that is the shape you need.",
      },
      {
        q: "Are my values encoded safely?",
        a: "Yes. Ampersands, equals signs, and Unicode in a value are percent-encoded, so they cannot break out and create extra parameters.",
      },
    ],
    examples: [
      {
        label: "Search with a repeated tag",
        text: "https://example.com/search",
        secondary: "q=smart tools\ntag=dev\ntag=web",
      },
    ],
  },
} as const satisfies ToolSpec;
