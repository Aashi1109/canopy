import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.password-generator",
  app: "devtools",
  category: "text-tools",
  keywords: ["password", "generator", "random", "secure", "passphrase", "crypto"],
  name: "Password Generator",
  description: "Generate passwords with cryptographically secure randomness.",
  input: { kind: "none" },
  settings: {
    fields: {
      length: {
        kind: "number",
        label: "Password length",
        help: "8–128 characters",
        default: 16,
        min: 8,
        max: 128,
      },
      count: {
        kind: "number",
        label: "How many",
        help: "Generate 1–100 passwords",
        default: 4,
        min: 1,
        max: 100,
      },
      upper: {
        kind: "toggle",
        label: "Uppercase A–Z",
        help: "Include capital letters",
        default: true,
        span: "full",
      },
      lower: {
        kind: "toggle",
        label: "Lowercase a–z",
        help: "Include lowercase letters",
        default: true,
        span: "full",
      },
      numbers: {
        kind: "toggle",
        label: "Numbers 0–9",
        help: "Include numeric characters",
        default: true,
        span: "full",
      },
      symbols: {
        kind: "toggle",
        label: "Symbols !@#$",
        help: "Include special characters",
        default: true,
        span: "full",
      },
      excludeAmbiguous: {
        kind: "toggle",
        label: "Exclude ambiguous characters",
        help: "Avoid 0, O, I, and l",
        default: false,
        span: "full",
      },
    },
  },
  trigger: {
    mode: "manual",
    actionLabel: "Generate passwords",
  },
  optionsPanel: {
    layout: "grid",
    note: "At least one character set must remain enabled.",
    title: "Password rules",
  },
  capabilities: {
    copy: true,
    download: true,
  },
  workbenchMark: { text: "PWD", tone: "contrast" },
  labels: {
    empty: "Choose a length and character set, then generate.",
    ready: "Passwords generated.",
    running: "Generating passwords…",
  },
  content: {
    howToUse: [
      "Set the length. Length buys far more strength than exotic characters: 16 random characters is already beyond brute force.",
      "Toggle the character groups you need. Some systems reject symbols, so turn them off rather than fighting a rejected password.",
      "Generate a batch, pick one, and store it in a password manager. Values are produced with the Web Crypto API in this tab and are never sent anywhere.",
    ],
    limitations: [
      "Nothing is remembered. Reloading the page loses every generated value, so save the one you keep before navigating away.",
      "Each character is drawn independently, so a password is not guaranteed to contain every enabled group. Regenerate if a site demands one of each.",
      "The symbol set is a conservative ASCII selection; sites requiring characters outside it will need a manual edit.",
      "At least one character group must stay enabled.",
    ],
    faq: [
      {
        q: "Is this randomness good enough?",
        a: "Yes. It uses the platform CSPRNG through crypto.getRandomValues, with rejection sampling so no character is more likely than another.",
      },
      {
        q: "Does the password leave my browser?",
        a: "No. Generation is local and nothing is logged or transmitted.",
      },
      {
        q: "How long should a password be?",
        a: "16 characters for general use, 20 or more for anything protecting other credentials.",
      },
    ],
  },
} as const satisfies ToolSpec;
