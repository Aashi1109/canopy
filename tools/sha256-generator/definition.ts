import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.sha256-generator",
  app: "devtools",
  category: "hashing-crypto",
  keywords: ["sha256", "hash", "digest", "checksum", "sha-2", "hex"],
  name: "SHA256 Generator",
  description: "Generate a SHA-256 digest.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "Text input",
    placeholder: "abc",
  },
  settings: {
    fields: {},
  },
  trigger: {
    mode: "manual",
    actionLabel: "Generate SHA-256",
  },
  capabilities: {
    copy: true,
  },
  workbenchMark: { text: "S256", tone: "accent" },
  labels: {
    empty: "Enter the text you want to hash with SHA-256.",
    ready: "SHA-256 digest is ready.",
    running: "Generating SHA-256 digest…",
  },
  content: {
    howToUse: [
      "Paste the exact text to hash. A trailing newline changes the digest, so copy the payload verbatim rather than retyping it.",
      "Generate. The output is the lowercase hex SHA-256 digest of the UTF-8 bytes of your input, computed locally with the Web Crypto API.",
      "Compare it with the expected value character by character, or paste both into the hash comparison tool.",
    ],
    limitations: [
      "Input is treated as UTF-8 text. Binary files cannot be hashed here — use the checksum tool for those.",
      "SHA-256 is a fast hash. It is right for integrity checks and content addressing, and wrong for storing passwords, which need a slow KDF such as bcrypt, scrypt, or Argon2.",
      "The digest is unkeyed, so anyone can recompute it. Use HMAC when the point is to prove the message came from you.",
      "Output is always lowercase hex; providers expecting Base64 need it converted.",
    ],
    faq: [
      {
        q: "Does my text leave the browser?",
        a: "No. Hashing runs locally through crypto.subtle.digest and nothing is uploaded or logged.",
      },
      {
        q: "Why does my digest not match?",
        a: "Almost always a byte difference: a trailing newline, CRLF instead of LF, or a different text encoding.",
      },
      {
        q: "Can I hash a password with this?",
        a: "No. A fast hash is brute-forceable at billions of guesses per second. Use bcrypt, scrypt, or Argon2.",
      },
    ],
    examples: [
      {
        label: "Known test vector",
        text: "abc",
      },
    ],
  },
} as const satisfies ToolSpec;
