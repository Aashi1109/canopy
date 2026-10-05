import { INPUT_EXECUTION_MESSAGES } from "../../lib/devtools/shared/execution-messages.ts";
import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  messages: {
    ...INPUT_EXECUTION_MESSAGES,
    "execution.match": "Match",
    "execution.noMatch": "No match",
    "execution.errors.hash-invalid": "Bcrypt hash is invalid.",
    "execution.recovery.hash-invalid": "Paste the whole stored hash, including the $2b$ prefix and cost.",
  },
  toolId: "devtools.bcrypt-compare",
  app: "devtools",
  category: "hashing-crypto",
  keywords: ["bcrypt", "compare", "verify", "password", "hash", "check"],
  name: "Bcrypt Compare",
  description: "Check plain text against a bcrypt hash.",
  layout: "stacked",
  input: {
    kind: "fields",
    label: "Password and bcrypt hash",
    fields: [
      {
        channel: "text",
        label: "Plain-text password",
        placeholder: "password",
        required: true,
        secret: true,
        multiline: true,
      },
      {
        channel: "secondary",
        label: "Bcrypt hash",
        placeholder: "$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.",
        required: true,
        secret: true,
        multiline: true,
      },
    ],
  },
  settings: { fields: {} },
  trigger: { mode: "manual", actionLabel: "Compare" },
  capabilities: { copy: true },
  workbenchMark: { text: "BC?" },
  labels: {
    empty: "Enter a plain-text password and bcrypt hash to compare them.",
    ready: "Bcrypt comparison result is ready.",
    running: "Comparing password with bcrypt hash…",
  },
  content: {
    howToUse: [
      "Enter the plain password. It stays in this browser tab — it is never sent to a server or written to a log.",
      "Paste the stored bcrypt hash, including the $2b$ prefix and cost. The salt is inside the hash, so you do not supply it separately.",
      "Compare. The answer is Match or No match; the verification itself is bcrypt's own constant-time check, so no timing signal is leaked.",
    ],
    limitations: [
      "Only bcrypt hashes are understood ($2a$, $2b$, $2y$). Any other format is rejected as invalid.",
      "Verification costs the same work the hash was created with, so a high-cost hash takes noticeably longer in a browser.",
      "Bcrypt truncates at 72 bytes, so two long passphrases that share their first 72 bytes both verify against the same hash.",
    ],
    faq: [
      {
        q: "Why can I not just compare two hash strings?",
        a: "Every bcrypt hash carries its own random salt, so hashing the same password twice yields different strings. Only a bcrypt comparison is meaningful.",
      },
      {
        q: "Is the comparison timing-safe?",
        a: "Yes. The check is delegated to bcrypt's own comparison, which does not exit early on the first differing byte.",
      },
    ],
    examples: [
      {
        label: "Password against a stored hash",
        text: "password",
        secondary: "$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.",
      },
    ],
  },
} as const satisfies ToolSpec;
