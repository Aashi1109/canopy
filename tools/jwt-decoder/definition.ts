import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.jwt-decoder",
  app: "devtools",
  category: "encoding-decoding",
  keywords: ["jwt", "json web token", "decode", "claims", "header", "payload", "bearer"],
  name: "JWT Decoder",
  description: "Decode JWT header and payload without verifying the signature.",
  outputLanguage: "json",
  input: {
    kind: "text",
    label: "JWT token",
    placeholder: "eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMjMifQ.",
  },
  settings: { fields: {} },
  trigger: { mode: "manual", actionLabel: "Decode JWT" },
  capabilities: { copy: true },
  workbenchMark: { text: "JWT", tone: "contrast" },
  labels: {
    empty: "Provide a JWT to decode its header and claims.",
    ready: "Decoded JWT details are ready.",
    running: "Decoding JWT…",
  },
  content: {
    howToUse: [
      "Paste the full token — all three dot-separated parts. The trailing dot of an unsigned token is required too.",
      "Decode. You get the header, the payload, the raw signature segment, and a `timestamps` block that converts the numeric `iat`, `nbf`, and `exp` claims to ISO instants.",
      "Read `alg` in the header first. `none` means the token is unsigned and carries no authenticity guarantee at all.",
      "Decoding happens entirely in this browser tab — the token is never sent to a server. Even so, treat any token you paste as compromised and rotate it if it was a live credential.",
    ],
    limitations: [
      "The signature is decoded but never verified. This tool cannot tell you whether a token is authentic, only what it claims.",
      "Expiry is shown as a converted timestamp, not evaluated. An expired token decodes exactly like a valid one.",
      "Only compact-serialization JWS tokens are supported. Encrypted tokens (JWE, five parts) are rejected.",
      "The header and payload must both be Base64URL-encoded JSON objects; a token carrying a non-object payload is rejected.",
    ],
    faq: [
      {
        q: "Does this verify the token?",
        a: "No. Verification needs the issuer's key and must happen server-side. Use this to read claims while debugging, never to make a trust decision.",
      },
      {
        q: "Is my token uploaded?",
        a: "No. Base64 decoding runs locally in this tab. The token is not logged or stored.",
      },
      {
        q: "Why is the signature field empty?",
        a: "The token is unsigned — `alg` is `none` — so the third segment after the final dot is empty.",
      },
      {
        q: "What is the `timestamps` block?",
        a: "A convenience view: any of `iat`, `nbf`, and `exp` that is a number is shown as an ISO 8601 instant so you do not have to convert epoch seconds by hand.",
      },
    ],
    examples: [
      {
        label: "Unsigned token",
        text: "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjMiLCJleHAiOjQxMDI0NDQ4MDB9.",
      },
    ],
  },
} as const satisfies ToolSpec;
