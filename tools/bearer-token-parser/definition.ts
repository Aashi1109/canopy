import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.bearer-token-parser",
  app: "devtools",
  category: "jwt-api-tools",
  keywords: ["bearer", "token", "authorization header", "jwt", "decode", "oauth"],
  name: "Bearer Token Parser",
  description: "Extract a Bearer token and decode it when it is a JWT.",
  layout: "stacked",
  input: {
    kind: "fields",
    label: "Authorization header or raw token",
    fields: [
      {
        channel: "text",
        label: "Authorization header or raw token",
        placeholder: "Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMjMifQ.",
        required: true,
        multiline: true,
      },
    ],
  },
  settings: {
    fields: {
      inputFormat: {
        kind: "select",
        label: "Input format",
        help: "Detect either form, or require a Bearer header or raw token.",
        default: "auto",
        choices: [
          { label: "Auto-detect", value: "auto" },
          { label: "Authorization header", value: "header" },
          { label: "Raw token", value: "raw" },
        ],
      },
      decodeJwtParts: {
        kind: "toggle",
        label: "Decode JWT parts",
        help: "Decode three-part JWT headers and payloads as JSON.",
        default: true,
      },
      maskRawToken: {
        kind: "toggle",
        label: "Mask raw token",
        help: "Replace the token itself with bullets in visible output.",
        default: false,
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Parse token" },
  capabilities: { copy: true },
  workbenchMark: { text: "BEAR" },
  labels: {
    empty: "Enter an Authorization header or raw bearer token to parse it.",
    ready: "Parsed bearer token details are ready.",
    running: "Parsing bearer token…",
  },
  content: {
    howToUse: [
      "Paste either a whole Authorization header or just the token — the Bearer prefix is stripped for you, case-insensitively.",
      "Parse. If the token is a three-part JWT, you get its decoded header and payload as JSON alongside the token itself.",
      "If it is an opaque token, you get the token and its length, which is usually enough to tell one credential format from another.",
    ],
    limitations: [
      "The signature is decoded but never verified. A decoded payload proves nothing about authenticity — treat every claim as unverified.",
      "Only the JWS compact form is understood. Encrypted (JWE) and non-three-part tokens fall back to the opaque summary.",
      "The token is a live credential. Anything you paste here is shown back to you in full, so do not screenshot or share the result.",
    ],
    faq: [
      {
        q: "Does this validate the signature?",
        a: "No. Decoding a JWT is just Base64URL — it requires no key. Verification must happen server-side with the issuer's key.",
      },
      {
        q: "Is my token sent anywhere?",
        a: "No. Parsing happens entirely in this browser tab, and the token is not persisted between runs.",
      },
      {
        q: "Why does my token come back as opaque?",
        a: "Because it does not have exactly three dot-separated parts. Opaque access tokens from OAuth providers are random strings with no readable structure.",
      },
    ],
    examples: [
      {
        label: "Bearer header with a JWT",
        text: "Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMjMifQ.",
      },
    ],
  },
} as const satisfies ToolSpec;
