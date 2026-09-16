import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.checksum-generator",
  app: "devtools",
  category: "hashing-crypto",
  keywords: ["checksum", "md5", "sha1", "sha256", "sha512", "hash", "digest", "verify"],
  name: "Checksum Generator",
  description: "Generate MD5, SHA-1, SHA-256, and SHA-512 text checksums.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "Text input",
    placeholder: "checksum me",
  },
  settings: { fields: {} },
  trigger: { mode: "manual", actionLabel: "Generate checksums" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "SUM" },
  labels: {
    empty: "Enter text to generate MD5, SHA-1, SHA-256, and SHA-512 checksums.",
    ready: "Checksums are ready.",
    running: "Generating checksums…",
  },
  content: {
    howToUse: [
      "Paste the exact text you need checksummed. Whitespace and a trailing newline change every digest, so copy it verbatim.",
      "Run once to get all four digests — MD5, SHA-1, SHA-256, SHA-512 — in lowercase hex.",
      "Compare against a published value by eye on the first and last few characters, or paste both into the Hash Compare tool for a constant-time check.",
    ],
    limitations: [
      "MD5 and SHA-1 are cryptographically broken and are provided only to verify against systems that still publish them. Use SHA-256 or SHA-512 for anything new.",
      "Input is UTF-8 text. Files are not supported, so these digests will not match a file checksum from `sha256sum` unless the file is exactly this text with no trailing newline.",
      "A checksum detects accidental corruption. It does not prove origin — anyone who can change the payload can also publish a matching digest. Use a signature or an HMAC for that.",
      "All four digests are computed on every run; there is no way to request just one.",
      "Output is always lowercase hex, never Base64.",
    ],
    faq: [
      {
        q: "Why does my SHA-256 not match `sha256sum file.txt`?",
        a: "Almost always a trailing newline. Most editors add one at the end of a file; pasting the visible content here omits it, and that changes the digest.",
      },
      {
        q: "Which one should I publish for a download?",
        a: "SHA-256. It is the current default everywhere, and SHA-512 is a reasonable alternative on 64-bit hardware.",
      },
      {
        q: "Is MD5 useless?",
        a: "For security, yes — collisions are trivial to construct. It is still fine as a non-adversarial change detector and for matching against legacy systems that only publish MD5.",
      },
    ],
    examples: [{ label: "Short phrase", text: "checksum me" }],
  },
} as const satisfies ToolSpec;
