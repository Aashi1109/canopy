import { INPUT_EXECUTION_MESSAGES } from "../../lib/devtools/shared/execution-messages.ts";
import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  messages: {
    ...INPUT_EXECUTION_MESSAGES,
  },
  toolId: "devtools.bcrypt-generator",
  app: "devtools",
  // `slugFromName("Bcrypt Hash Generator")` is "bcrypt-hash-generator", which is
  // not the folder name. The live indexed URL is the folder name and is frozen
  // at first insert, so it is declared explicitly.
  slug: "bcrypt-generator",
  category: "hashing-crypto",
  keywords: ["bcrypt", "hash", "password", "salt", "cost", "rounds"],
  name: "Bcrypt Hash Generator",
  description: "Hash a password or text using bcrypt.",
  layout: "stacked",
  input: {
    kind: "fields",
    label: "Password or text",
    fields: [
      {
        channel: "text",
        label: "Password or text",
        placeholder: "correct horse battery staple",
        required: true,
        secret: true,
      },
    ],
  },
  settings: {
    fields: {
      rounds: {
        kind: "number",
        label: "Cost rounds",
        help: "Work factor. Each extra round doubles the time to hash and to crack.",
        default: 4,
        min: 4,
        max: 14,
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Generate bcrypt hash" },
  capabilities: { copy: true },
  workbenchMark: { text: "BC#" },
  labels: {
    empty: "Enter a password or plain text to generate a bcrypt hash.",
    ready: "Bcrypt hash is ready.",
    running: "Generating bcrypt hash…",
  },
  content: {
    howToUse: [
      "Enter the password or text to hash. It stays in this browser tab — it is never sent to a server or written to a log.",
      "Pick a cost factor. Higher is slower and stronger; this tool caps at 14 so the browser stays responsive.",
      "Generate, then copy the 60-character hash. The salt is embedded in it, so store the whole string and nothing else.",
    ],
    limitations: [
      "The cost range here (4–14) is chosen so hashing completes in a browser. Production systems normally use 12 or higher — benchmark on your own hardware and set it server-side.",
      "A fresh random salt is generated on every run, so hashing the same password twice gives two different hashes. That is correct bcrypt behaviour, not a bug.",
      "Bcrypt truncates input at 72 bytes. A longer passphrase is silently cut, and everything past byte 72 has no effect on the hash.",
      "This is for testing and fixtures. Never generate a real user's production credential in a browser tool.",
    ],
    faq: [
      {
        q: "Why is the hash different every time?",
        a: "Each run uses a new random salt, which is embedded in the output. Verify with a bcrypt comparison, never by comparing two hash strings.",
      },
      {
        q: "What do the leading characters mean?",
        a: "$2b$ is the bcrypt version, the next two digits are the cost, and the following 22 characters are the salt. The rest is the digest.",
      },
      {
        q: "Which cost should I use?",
        a: "Whatever keeps a single hash around 250ms on your production hardware — commonly 12 or 13 today. The low values here exist so the tool stays usable in a browser.",
      },
    ],
    examples: [{ label: "Passphrase", text: "correct horse battery staple" }],
  },
} as const satisfies ToolSpec;
