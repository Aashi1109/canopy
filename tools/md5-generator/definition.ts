import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.md5-generator",
  app: "devtools",
  category: "hashing-crypto",
  keywords: ["md5", "hash", "checksum", "digest", "legacy", "fingerprint", "etag"],
  name: "MD5 Generator",
  description: "Generate a legacy MD5 digest for compatibility checks.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "Text input",
    placeholder: "hello world",
  },
  settings: { fields: {} },
  trigger: { mode: "manual", actionLabel: "Generate MD5" },
  capabilities: { copy: true },
  workbenchMark: { text: "MD5", tone: "contrast" },
  labels: {
    empty: "Enter the text you want to hash with MD5.",
    ready: "MD5 digest is ready.",
    running: "Generating MD5 digest…",
  },
  content: {
    howToUse: [
      "Paste the exact bytes you need a digest for. A trailing newline changes the result, so copy the value verbatim.",
      "Generate, then compare the 32-character lowercase hex digest with the one you were given.",
      "Use this for what MD5 is still good for: matching a checksum published by a legacy system, an ETag, or a cache key.",
      "For anything where an attacker could choose the input — passwords, signatures, integrity of downloaded files — use SHA-256 or HMAC instead.",
    ],
    limitations: [
      "MD5 is cryptographically broken. Collisions can be produced on a laptop, so a matching digest does not prove two inputs are the same when an attacker controls either one.",
      "It is a plain digest, not a password hash. Never store passwords with it — use bcrypt, scrypt, or Argon2.",
      "Input is treated as UTF-8 text. Binary payloads and files cannot be hashed here.",
      "Output is always lowercase hex; there is no Base64 or uppercase option.",
    ],
    faq: [
      {
        q: "Is MD5 safe to use?",
        a: "Not as a security primitive. It remains fine as a non-adversarial checksum — verifying an accidental corruption, matching a legacy fingerprint, or building a cache key.",
      },
      {
        q: "What should I use instead?",
        a: "SHA-256 for a general digest, HMAC-SHA256 when a shared secret is involved, and bcrypt or Argon2 for passwords.",
      },
      {
        q: "Why does my digest not match?",
        a: "Almost always a byte difference in the input — a trailing newline, CRLF versus LF line endings, or a different text encoding.",
      },
    ],
    examples: [
      { label: "Classic test vector", text: "abc" },
      { label: "Short phrase", text: "hello world" },
    ],
  },
} as const satisfies ToolSpec;
