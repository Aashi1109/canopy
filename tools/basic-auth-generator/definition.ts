import { ENCODING_EXECUTION_MESSAGES, INPUT_EXECUTION_MESSAGES } from "../../lib/devtools/shared/execution-messages.ts";
import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  messages: {
    ...ENCODING_EXECUTION_MESSAGES,
    ...INPUT_EXECUTION_MESSAGES,
    "execution.errors.invalid-username": "Username cannot contain a colon (:).",
    "execution.recovery.invalid-username": "Use a username without a colon.",
    "execution.errors.invalid-credentials": "Username and password cannot contain control characters.",
    "execution.recovery.invalid-credentials": "Remove line breaks, tabs, and other control characters, then try again.",
    "workspace.base64_is_reversible_ac9bab": "Base64 is reversible. Treat this output as a password and use HTTPS.",
    "workspace.formatHelp.header": "Copy this complete Authorization header into your HTTP client.",
    "workspace.formatHelp.value": "Use this value for a header named Authorization. The Basic prefix is included.",
    "workspace.formatHelp.base64":
      "This is the encoded username:password token. Add Basic followed by a space when using it as an Authorization header value.",
    "workspace.formatHelp.curl":
      "Replace https://example.com/api with your HTTPS endpoint, then run the command in your terminal.",
    "workspace.formatHelp.fetch":
      "Replace https://example.com/api with your HTTPS endpoint. Browser requests to another origin require the server to allow CORS.",
  },
  toolId: "devtools.basic-auth-generator",
  app: "devtools",
  category: "jwt-api-tools",
  keywords: ["basic auth", "authorization header", "http", "credentials", "base64", "curl"],
  name: "Basic Auth Generator",
  description: "Generate Basic Auth headers, Base64 tokens, and cURL or JavaScript fetch snippets.",
  layout: "stacked",
  inputSize: { default: 50 },
  input: {
    kind: "fields",
    label: "Username and password",
    fields: [
      {
        channel: "text",
        label: "Username",
        placeholder: "ada@example.com",
        required: true,
      },
      {
        channel: "secondary",
        label: "Password or API secret (optional)",
        placeholder: "correct horse battery staple",
        secret: true,
      },
    ],
  },
  settings: {
    fields: {
      format: {
        kind: "select",
        label: "Output format",
        help: "Choose how you will use the credentials. All formats use UTF-8 and standard Base64.",
        default: "header",
        choices: [
          { label: "Authorization header", value: "header" },
          { label: "Header value", value: "value" },
          { label: "Base64 token", value: "base64" },
          { label: "cURL command", value: "curl" },
          { label: "JavaScript fetch", value: "fetch" },
        ],
        pane: "input",
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Generate Basic Auth" },
  capabilities: { copy: true },
  workbenchMark: { text: "AUTH" },
  labels: {
    empty: "Enter a username and optional password, choose an output format, then generate Basic Auth.",
    ready: "Basic Auth output is ready.",
    running: "Encoding Basic Auth credentials…",
  },
  content: {
    howToUse: [
      "Enter the username. Many API providers want a key id here and leave the password empty — that is valid, and the trailing colon is still required.",
      "Enter the password or API secret. It stays in this browser tab — it is never sent to a server or written to a log.",
      "Choose a full Authorization header, its value, a Base64 token, a cURL command, or JavaScript fetch. Generate, then copy the selected output.",
      "For cURL and fetch, replace https://example.com/api with your HTTPS endpoint. This tool generates the snippet without sending a request.",
    ],
    limitations: [
      "Base64 is an encoding, not encryption. Anyone who sees the header can recover the credentials, so Basic auth is only safe over HTTPS.",
      "Usernames cannot contain a colon. Neither username nor password may contain control characters. Colons in passwords are allowed.",
      "Credentials are encoded as UTF-8. Servers that expect Latin-1 may reject non-ASCII characters.",
    ],
    faq: [
      {
        q: "Is the generated header safe to paste into a shared document?",
        a: "No. It is your password in a trivially reversible form. Treat the header exactly as you would treat the raw credential.",
      },
      {
        q: "Can I leave the password empty?",
        a: "Yes. Token-style APIs often use the key as the username and an empty password; the encoded value still contains the trailing colon, which is what the server expects.",
      },
    ],
    examples: [{ label: "Username and password", text: "Ada", secondary: "secret" }],
  },
} as const satisfies ToolSpec;
