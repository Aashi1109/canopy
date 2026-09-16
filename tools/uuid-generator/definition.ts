import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.uuid-generator",
  app: "devtools",
  category: "hashing-crypto",
  keywords: ["uuid", "guid", "uuid v4", "uuid v7", "identifier", "random id", "primary key"],
  name: "UUID Generator",
  description: "Generate random UUID v4 or time-ordered UUID v7 values.",
  input: { kind: "none" },
  settings: {
    fields: {
      version: {
        kind: "select",
        label: "UUID version",
        help: "v4 is fully random. v7 embeds a millisecond timestamp so values sort by creation time.",
        default: "v4",
        choices: [
          { label: "UUID v4 — random", value: "v4" },
          { label: "UUID v7 — time-ordered", value: "v7" },
        ],
      },
      count: {
        kind: "number",
        label: "How many",
        default: 5,
        min: 1,
        max: 100,
      },
      hyphens: {
        kind: "toggle",
        label: "Hyphens",
        help: "Off produces the 32-character compact form.",
        default: true,
      },
      upper: {
        kind: "toggle",
        label: "Uppercase",
        help: "RFC 4122 specifies lowercase output; uppercase is for systems that expect it.",
        default: false,
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Generate" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "UUID", tone: "accent" },
  labels: {
    empty: "Choose a version and generate.",
    ready: "UUIDs are ready.",
    running: "Generating UUIDs…",
  },
  content: {
    howToUse: [
      "Pick v4 for an identifier that reveals nothing, or v7 when you want database rows to insert in roughly chronological order.",
      "Set how many you need — up to 100 per run — and toggle hyphens or uppercase to match the format your system expects.",
      "Generate and copy. Values are produced with the browser's cryptographic random number generator and never leave this tab.",
    ],
    limitations: [
      "A UUID v7 embeds a Unix millisecond timestamp in its first six bytes, so it leaks roughly when it was created. Do not use v7 where that matters — use v4.",
      "Neither version is a secret. A UUID is an identifier, not a token: do not use one as a password-reset link, an API key, or a bearer credential.",
      "v7 values generated within the same millisecond are ordered only by their random tail, so they are time-ordered between milliseconds, not strictly monotonic within one.",
      "Uppercase output is not canonical — RFC 4122 requires lowercase on output, though readers must accept both.",
      "Removing the hyphens produces a 32-character string that most UUID parsers still accept, but some strict ones do not.",
    ],
    faq: [
      {
        q: "v4 or v7?",
        a: "v7 if the value is a database primary key — time ordering keeps B-tree inserts local instead of scattering them. v4 anywhere the creation time must not be inferable.",
      },
      {
        q: "Can two of these collide?",
        a: "Not in practice. A v4 has 122 random bits; you would need to generate about a billion per second for 85 years to reach a 50% chance of one collision.",
      },
      {
        q: "Are these generated on a server?",
        a: "No. They come from the Web Crypto API in this browser tab and are never transmitted.",
      },
      {
        q: "Is v7 a real standard?",
        a: "Yes — RFC 9562 (2024) standardised versions 6, 7, and 8. v7 is the recommended time-ordered format.",
      },
    ],
  },
} as const satisfies ToolSpec;
