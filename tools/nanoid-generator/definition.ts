import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.nanoid-generator",
  app: "devtools",
  // `slugFromName("Nano ID Generator")` is "nano-id-generator", which is not
  // the folder name. The folder name is the live indexed URL and is frozen at
  // first insert, so it is declared explicitly here.
  slug: "nanoid-generator",
  category: "hashing-crypto",
  keywords: ["nanoid", "id", "identifier", "random", "url safe", "uuid alternative", "primary key"],
  name: "Nano ID Generator",
  description: "Generate URL-safe random identifiers.",
  // A pure generator: the output depends only on the settings and the secure
  // random source, so no input channel is read.
  input: { kind: "none" },
  settings: {
    fields: {
      count: {
        kind: "number",
        label: "How many",
        help: "One identifier per line.",
        default: 5,
        min: 1,
        max: 100,
      },
      size: {
        kind: "number",
        label: "Size",
        help: "Characters per identifier. 21 gives roughly the same collision resistance as a UUID v4.",
        default: 21,
        min: 1,
        max: 256,
        suffix: "chars",
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Generate" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "NANO", tone: "accent" },
  labels: {
    empty: "Choose a count and size, then generate.",
    ready: "Identifiers are ready.",
    running: "Generating identifiers…",
  },
  content: {
    howToUse: [
      "Set how many identifiers you need and how long each should be, then generate. You get one per line.",
      "Leave the size at 21 unless you have a reason to change it — that is the Nano ID default and is comparable to a UUID v4 in collision resistance.",
      "Shorten only when the ID is scoped to a small set (a short link within one account, say) and you have a uniqueness check behind it.",
      "Every character comes from the platform's cryptographically secure random source, so these are safe to use as unguessable identifiers.",
    ],
    limitations: [
      "The alphabet is fixed: `A-Z`, `a-z`, `0-9`, `_`, and `-`. It cannot be narrowed to avoid look-alike characters such as `l`, `1`, `I`, `O`, and `0`.",
      "Identifiers carry no timestamp and no ordering, so they do not sort chronologically and are not index-friendly the way ULIDs or UUID v7 are.",
      "Uniqueness is probabilistic, not guaranteed. Short sizes collide much sooner than you would expect — keep a unique constraint in the database.",
      "Generation is not deduplicated within a single run, so a very small size can produce a repeat in the same batch.",
    ],
    faq: [
      {
        q: "How long should an ID be?",
        a: "21 characters is the safe default. Below about 12 the collision probability becomes real for anything with meaningful volume.",
      },
      {
        q: "Is this random enough for security?",
        a: "Yes — it uses the Web Crypto random source with rejection sampling, so there is no modulo bias. Do not use it as a password or a signing key, though.",
      },
      {
        q: "Why `_` and `-` in the alphabet?",
        a: "They keep the IDs URL-safe without percent-encoding, which is the point of the Nano ID alphabet.",
      },
      {
        q: "How does this compare to a UUID?",
        a: "Shorter and URL-safe for equivalent entropy, but with no version, no variant bits, and no built-in timestamp.",
      },
    ],
    examples: [],
  },
} as const satisfies ToolSpec;
