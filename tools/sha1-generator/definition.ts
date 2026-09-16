import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.sha1-generator",
  app: "devtools",
  category: "hashing-crypto",
  keywords: ["sha1", "sha-1", "hash", "digest", "checksum", "git", "legacy"],
  name: "SHA1 Generator",
  description: "Generate a legacy SHA-1 digest.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "Text input",
    placeholder: "abc",
  },
  settings: { fields: {} },
  trigger: { mode: "manual", actionLabel: "Generate SHA-1" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "S1", tone: "accent" },
  labels: {
    empty: "Enter the text you want to hash with SHA-1.",
    ready: "SHA-1 digest is ready.",
    running: "Generating SHA-1 digest…",
  },
  content: {
    howToUse: [
      "Paste the exact bytes you need hashed. A trailing newline changes the digest, so copy the value verbatim.",
      "Generate to get the 40-character lowercase hex digest, computed locally with the Web Crypto API.",
      "Use it to match an existing SHA-1 value — a Git object id, a legacy webhook signature, an old file manifest — not to protect anything new.",
    ],
    limitations: [
      "SHA-1 is cryptographically broken. Practical collisions have existed since 2017 (SHATTERED) and chosen-prefix collisions since 2020. Do not use it for signatures, certificates, or integrity against a motivated attacker.",
      "For new work use SHA-256 or SHA-512; for passwords use a password hash such as bcrypt or Argon2, never a raw digest.",
      "Input is treated as UTF-8 text. Files and non-UTF-8 binary cannot be hashed here, so this will not reproduce a file checksum.",
      "Output is always lowercase hex. Providers that expect Base64 need it converted.",
      "Empty input is hashed rather than rejected, and yields the well-known digest of the empty string.",
    ],
    faq: [
      {
        q: "Why does my digest not match the one I was given?",
        a: "Almost always a bytes mismatch: a trailing newline, CRLF versus LF line endings, or leading whitespace. Check those before suspecting the algorithm.",
      },
      {
        q: "Can I reverse a SHA-1 digest?",
        a: "No. It is a one-way function. Short or common inputs can be found in precomputed tables, which is a further reason not to hash secrets with it.",
      },
      {
        q: "Will this match `git hash-object`?",
        a: "No. Git prefixes the content with a header such as `blob <length>\\0` before hashing, so the digest of the raw content differs.",
      },
    ],
    examples: [{ label: "Classic test vector", text: "abc" }],
  },
} as const satisfies ToolSpec;
