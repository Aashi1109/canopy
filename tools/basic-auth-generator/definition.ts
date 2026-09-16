import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.basic-auth-generator",
  app: "devtools",
  category: "jwt-api-tools",
  keywords: ["basic auth", "authorization header", "http", "credentials", "base64", "curl"],
  name: "Basic Auth Generator",
  description: "Generate an HTTP Basic Authorization header.",
  layout: "stacked",
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
      copyAsHeader: {
        kind: "toggle",
        label: "Copy as header",
        help: "Include the Authorization header name in the generated text.",
        default: true,
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Generate header" },
  capabilities: { copy: true },
  workbenchMark: { text: "AUTH" },
  labels: {
    empty: "Enter a username and optional password to generate a Basic Authorization header.",
    ready: "Basic Authorization header is ready.",
    running: "Encoding Basic Auth credentials…",
  },
  content: {
    howToUse: [
      "Enter the username. Many API providers want a key id here and leave the password empty — that is valid, and the trailing colon is still required.",
      "Enter the password or API secret. It stays in this browser tab — it is never sent to a server or written to a log.",
      "Generate, then paste the whole line into your HTTP client, or into curl as -H 'Authorization: Basic …'.",
    ],
    limitations: [
      "Base64 is an encoding, not encryption. Anyone who sees the header can recover the credentials, so Basic auth is only safe over HTTPS.",
      "A colon inside the username makes the header ambiguous — the server splits on the first colon, so everything after it becomes part of the password.",
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
