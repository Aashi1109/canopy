import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.hash-compare",
  app: "devtools",
  category: "hashing-crypto",
  keywords: ["hash", "compare", "checksum", "constant time", "digest", "verify", "timing safe"],
  name: "Hash Compare",
  description: "Compare two hashes without early exit.",
  layout: "side-by-side",
  input: {
    kind: "fields",
    label: "Two hashes to compare",
    fields: [
      {
        channel: "text",
        label: "First hash",
        placeholder: "5d41402abc4b2a76b9719d911017c592",
        required: true,
        secret: true,
        multiline: true,
      },
      {
        channel: "secondary",
        label: "Second hash",
        placeholder: "5d41402abc4b2a76b9719d911017c592",
        required: true,
        secret: true,
        multiline: true,
      },
    ],
  },
  settings: { fields: {} },
  trigger: { mode: "manual", actionLabel: "Compare hashes" },
  capabilities: { copy: true },
  workbenchMark: { text: "==", tone: "contrast" },
  labels: {
    empty: "Enter two hashes to compare them without early exit.",
    ready: "Hash comparison is complete.",
    running: "Comparing hashes…",
  },
  content: {
    howToUse: [
      "Paste the hash, digest, or signature you computed into the first field.",
      "Paste the value you are checking it against into the second.",
      "Compare. Both sides are trimmed and lowercased first, so a copy-paste that picked up whitespace or a different hex case still compares equal.",
    ],
    limitations: [
      "Comparison is case-insensitive, which is right for hex digests but wrong for anything where case is significant — Base64 signatures included.",
      "Leading and trailing whitespace is stripped from both sides before comparing.",
      "This only tells you whether two strings are equal. It does not compute a hash, and it does not tell you which algorithm produced either value.",
    ],
    faq: [
      {
        q: "Why not just paste them into a diff?",
        a: "A naive comparison stops at the first differing character, and the time it takes leaks how much of a secret you guessed correctly. This comparison always scans both values in full.",
      },
      {
        q: "Can I compare Base64 signatures here?",
        a: "Not safely — the inputs are lowercased, so two Base64 values differing only in case would wrongly report a match. Convert to hex first.",
      },
    ],
    examples: [
      {
        label: "Two identical SHA-256 digests",
        text: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        secondary: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      },
    ],
  },
} as const satisfies ToolSpec;
