import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.hmac-generator",
  app: "devtools",
  category: "hashing-crypto",
  keywords: ["hmac", "signature", "secret key", "sha1", "sha256", "sha512", "webhook", "message authentication"],
  name: "HMAC Generator",
  description: "Generate an HMAC signature using a secret key.",
  layout: "stacked",
  input: {
    kind: "fields",
    label: "Message and secret key",
    fields: [
      {
        channel: "text",
        label: "Message",
        placeholder: '{"event":"order.created","id":"ord_123"}',
        required: true,
        multiline: true,
      },
      {
        channel: "secondary",
        label: "Secret key",
        placeholder: "whsec_example_key",
        required: true,
        secret: true,
      },
    ],
  },
  settings: {
    fields: {
      algo: {
        kind: "select",
        label: "Algorithm",
        help: "Match the algorithm the verifying system expects.",
        default: "sha256",
        choices: [
          { label: "HMAC-SHA1", value: "sha1" },
          { label: "HMAC-SHA256", value: "sha256" },
          { label: "HMAC-SHA512", value: "sha512" },
        ],
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Generate HMAC" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "MAC", tone: "contrast" },
  labels: {
    empty: "Enter a message and secret key to generate an HMAC.",
    ready: "HMAC digest is ready.",
    running: "Generating HMAC…",
  },
  content: {
    howToUse: [
      "Paste the exact message bytes you want to sign. Trailing newlines and whitespace change the digest, so copy the payload verbatim.",
      "Enter the shared secret key. It stays in this browser tab — it is never sent to a server or written to logs.",
      "Pick the algorithm the verifying system expects. HMAC-SHA256 is the default and the right choice unless a provider specifies otherwise.",
      "Generate, then copy the lowercase hex digest and compare it with the signature you received.",
    ],
    limitations: [
      "The message and key are both interpreted as UTF-8 text. Binary payloads and keys that are not valid UTF-8 cannot be entered accurately here.",
      "Output is always lowercase hexadecimal. Providers that expect Base64 signatures need the hex converted first.",
      "HMAC-SHA1 is offered only for compatibility with legacy providers; do not choose it for new integrations.",
      "This tool generates a signature; it does not compare one. Verify a received signature with a constant-time comparison in your own code, never with a plain string equality check.",
    ],
    faq: [
      {
        q: "Does my secret key leave the browser?",
        a: "No. The digest is computed locally with the Web Crypto API. The key is never uploaded, logged, or included in the result.",
      },
      {
        q: "Why does my digest not match the provider's?",
        a: "Almost always a message-bytes mismatch. Check for a trailing newline, a different JSON key order, or a raw body that was re-serialised before signing. The key encoding and algorithm are the next things to check.",
      },
      {
        q: "Which algorithm should I use?",
        a: "HMAC-SHA256 unless the system you integrate with documents otherwise. SHA-512 is also fine; SHA-1 is legacy-only.",
      },
      {
        q: "Can I get the signature as Base64?",
        a: "Not directly. Convert the hex output with a hex-to-Base64 step if your provider expects Base64.",
      },
    ],
    examples: [
      {
        label: "Sign a short message",
        text: "message to sign",
        secondary: "secret",
      },
      {
        label: "Sign a webhook payload",
        text: '{"event":"order.created","id":"ord_123"}',
        secondary: "whsec_example_key",
      },
    ],
  },
} as const satisfies ToolSpec;
