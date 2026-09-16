import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.curl-to-fetch",
  app: "devtools",
  category: "jwt-api-tools",
  keywords: ["curl", "fetch", "javascript", "http", "convert", "api", "request"],
  name: "cURL to Fetch",
  description: "Convert a common cURL request to browser fetch code.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "cURL command",
    placeholder:
      "curl https://api.example.com/items -H 'Content-Type: application/json' -d '{\"name\":\"SmartTools\"}'",
  },
  settings: {
    fields: {
      responseHandling: {
        kind: "select",
        label: "Response handling",
        help: "Parse successful JSON responses or keep the raw response.",
        default: "throw-json",
        choices: [
          { label: "Throw on error + parse JSON", value: "throw-json" },
          { label: "Keep raw response", value: "raw" },
        ],
      },
      executionStyle: {
        kind: "select",
        label: "Execution style",
        help: "Use top-level await or wrap the request in an async function.",
        default: "top-level-await",
        choices: [
          { label: "Top-level await", value: "top-level-await" },
          { label: "Async function", value: "async-function" },
        ],
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Convert to fetch" },
  capabilities: { copy: true },
  workbenchMark: { text: "FET" },
  labels: {
    empty: "Paste a cURL command to generate Fetch code.",
    ready: "Fetch request code is ready.",
    running: "Generating Fetch code…",
  },
  content: {
    howToUse: [
      "Paste a curl command — the 'Copy as cURL' output from your browser's network panel works well.",
      "Convert. Choose a status check with JSON parsing or keep the raw response, using top-level await or an async wrapper.",
      "Read the generated code before running it. If the original command carried a credential in a header or via `-u`, that credential is now sitting in your source — move it to an environment variable.",
      "JSON handling assumes a JSON response. Keep the raw response when you need text, blobs, streaming, or custom error policy.",
    ],
    limitations: [
      "A practical subset of curl is supported: `-X`/`--request`, `-H`/`--header`, `-d`/`--data`/`--data-raw`/`--data-binary`, and `-u`/`--user`. Every other flag is ignored silently — including `-F` (multipart), `--compressed`, `-k`, `-o`, and cookie flags.",
      "The URL must be absolute and http or https. A relative path or another scheme is rejected.",
      "`-u user:pass` becomes a Base64 `Authorization: Basic` header, which is encoding, not encryption — the credential is plainly readable in the generated code.",
      "Multiple `-d` flags are not concatenated the way curl concatenates them; only the last one survives.",
      "`credentials`, `mode`, and `redirect` are not set, so fetch's defaults apply. Cross-origin behaviour may differ from curl's.",
    ],
    faq: [
      {
        q: "Why did my `-F` upload disappear?",
        a: "Multipart form flags are not supported. Build a `FormData` object by hand and pass it as the body.",
      },
      {
        q: "Why did the method become POST when I never asked for it?",
        a: "That is curl's own rule: supplying a body with `-d` implies POST unless `-X` says otherwise. The conversion keeps that behaviour.",
      },
      {
        q: "Is it safe to paste a command containing my API key?",
        a: "The conversion runs entirely in this browser tab and nothing is uploaded. The key does end up in the generated snippet, so do not commit that snippet as-is.",
      },
    ],
    examples: [
      {
        label: "POST with a JSON body",
        text: "curl -X POST https://api.example.com/users -H 'Content-Type: application/json' -d '{\"name\":\"Ada\"}'",
      },
      {
        label: "Simple GET",
        text: "curl https://api.example.com/health",
      },
    ],
  },
} as const satisfies ToolSpec;
