import { ENCODING_EXECUTION_MESSAGES, JWT_EXECUTION_MESSAGES } from "../../lib/devtools/shared/execution-messages.ts";
import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  messages: {
    ...ENCODING_EXECUTION_MESSAGES,
    ...JWT_EXECUTION_MESSAGES,
    "execution.errors.numericDate":
      "JWT {claim} must be a finite NumericDate in seconds within the supported date range.",
    "execution.recovery.numericDate":
      "Check the {claim} claim in the token input. Use a JSON number of seconds since 1970-01-01 UTC, not a date string.",
    "summary.region": "JWT expiration summary",
    "summary.notSpecified": "Not specified",
    "summary.noRestriction": "No restriction specified",
    "summary.localTime": "Local time · {timezone}",
    "summary.checked":
      "Checked {time} using your device clock, with no clock-skew allowance. Run Check expiration again to refresh.",
    "details.status.active.label": "Not expired",
    "details.status.active.title": "Within its time window",
    "details.status.active.description":
      "At the last check, the expiration time was in the future and any not-before restriction had passed.",
    "details.status.expired.label": "Expired",
    "details.status.expired.title": "Token has expired",
    "details.status.expired.description":
      "The expiration time has passed. Obtain a new token through your application''s sign-in or refresh flow.",
    "details.status.not-active.label": "Not active yet",
    "details.status.not-active.title": "Not active yet",
    "details.status.not-active.description":
      "The not-before time is still in the future. The token must not be accepted before that time.",
    "details.status.expiring-soon.label": "Expiring soon",
    "details.status.expiring-soon.title": "Expiration is near",
    "details.status.expiring-soon.description":
      "At the last check, this token had five minutes or less remaining. Use your application''s refresh flow if needed.",
    "details.status.no-expiration.label": "No exp claim",
    "details.status.no-expiration.title": "No expiration specified",
    "details.status.no-expiration.description":
      "This payload has no exp claim, so its expiration cannot be determined. This does not mean the token will remain accepted indefinitely.",
    "workspace.expires_at_b613b9": "Expires at",
    "workspace.not_valid_before_03d76d": "Not valid before",
    "workspace.issued_at_f91a82": "Issued at",
    "workspace.expiration_status_4108ab": "Expiration status",
    "workspace.token_timestamps_1a99b0": "Token timestamps",
    "workspace.utc_7e5f76": "UTC",
    "workspace.signature_not_verified_9d24d5":
      "Signature not verified. Time claims alone do not establish that a token is valid or trusted.",
    "workspace.decoded_payload_76534c": "Decoded payload",
    "workspace.unverified_claims_749f74": "Unverified claims",
    "workspace.copy_payload_json_d88b52": "Copy payload JSON",
  },
  toolId: "devtools.jwt-expiration-checker",
  app: "devtools",
  category: "jwt-api-tools",
  keywords: ["jwt", "expiration", "exp", "nbf", "iat", "token", "claims"],
  name: "JWT Expiration Checker",
  description: "Inspect issued-at, not-before, and expiration claims.",
  resultView: { default: "preview", previewLabel: "Summary" },
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
    empty: "Paste a JWT to inspect its expiration and time claims.",
    ready: "JWT expiration check is ready.",
    running: "Checking JWT expiration…",
  },
  content: {
    howToUse: [
      "Paste the whole token, all three dot-separated parts. It is masked because a JWT is a bearer credential — anyone holding it can act as you until it expires.",
      "Choose Check expiration. The summary explains the time-based status and shows expiration, not-before, and issued-at dates. Raw keeps the original report ready to copy.",
      "The verdict is computed against your device clock. A machine with a skewed clock will disagree with the server that issued the token.",
    ],
    limitations: [
      'The signature is not verified. This tool answers "is it still within its validity window", never "is it genuine" — a token with a forged payload reads the same as a real one.',
      "Only exp, nbf, and iat are inspected. Scopes, audience, and issuer are ignored.",
      "Time claims must be NumericDate numbers: seconds since the Unix epoch. Invalid types and dates outside the supported range are reported as errors.",
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
