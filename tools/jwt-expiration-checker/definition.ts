import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.jwt-expiration-checker",
  app: "devtools",
  category: "jwt-api-tools",
  keywords: ["jwt", "expiration", "exp", "nbf", "iat", "token", "claims"],
  name: "JWT Expiration Checker",
  description: "Inspect issued-at, not-before, and expiration claims.",
  layout: "stacked",
  input: {
    kind: "fields",
    label: "JWT token",
    fields: [
      {
        channel: "text",
        label: "JWT token",
        placeholder: "eyJhbGciOiJub25lIn0.eyJleHAiOjQxMDI0NDQ4MDB9.",
        required: true,
        secret: true,
        multiline: true,
      },
    ],
  },
  settings: {
    fields: {
      useLocalTime: {
        kind: "toggle",
        label: "Use local time",
        help: "Show timestamps in your device's local time.",
        default: false,
      },
      decodePayload: {
        kind: "toggle",
        label: "Decode payload",
        help: "Include the decoded, unverified claims payload.",
        default: false,
      },
      warnBeforeExpiry: {
        kind: "toggle",
        label: "Warn before expiry",
        help: "Mark active tokens that expire within five minutes.",
        default: false,
      },
    },
  },
  trigger: {
    mode: "manual",
    actionLabel: "Check expiration",
  },
  capabilities: {
    copy: true,
  },
  workbenchMark: { text: "JEX", tone: "contrast" },
  labels: {
    empty: "Paste a JWT to check its validity window.",
    ready: "JWT validity window is ready.",
    running: "Checking JWT expiration…",
  },
  content: {
    howToUse: [
      "Paste the whole token, all three dot-separated parts. It is masked because a JWT is a bearer credential — anyone holding it can act as you until it expires.",
      "Check. The result reports whether the token is Active, Expired, or Not active yet, plus the exp and iat timestamps in UTC.",
      "The verdict is computed against your device clock. A machine with a skewed clock will disagree with the server that issued the token.",
    ],
    limitations: [
      'The signature is not verified. This tool answers "is it still within its validity window", never "is it genuine" — a token with a forged payload reads the same as a real one.',
      "Only exp, nbf, and iat are inspected. Scopes, audience, and issuer are ignored.",
      "Claims must be numeric NumericDate seconds, per the JWT spec. A string date is reported as not specified.",
      "Nothing is uploaded, but the token still lands in this tab's memory — do not paste a production token on a shared machine.",
    ],
    faq: [
      {
        q: "Does this verify the signature?",
        a: "No. Decoding is not verification. Always verify server-side with the issuer's key before trusting any claim.",
      },
      {
        q: "Why does it say Active when the server rejects the token?",
        a: "The validity window is only one reason a token is rejected. Signature, audience, issuer, scope, and revocation are all checked server-side and none of them are visible here.",
      },
      {
        q: "Does my token leave the browser?",
        a: "No. Decoding is local and the token is never uploaded or logged.",
      },
    ],
    examples: [
      {
        label: "Token expiring in 2100",
        text: "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjMiLCJleHAiOjQxMDI0NDQ4MDB9.",
      },
    ],
  },
} as const satisfies ToolSpec;
