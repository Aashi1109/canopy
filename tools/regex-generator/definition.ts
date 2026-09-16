import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.regex-generator",
  app: "devtools",
  category: "developer-generators",
  keywords: ["regex", "regular expression", "pattern", "validation", "email", "url", "ipv4", "uuid"],
  name: "Regex Generator",
  description: "Generate common regular-expression patterns.",
  input: { kind: "none" },
  settings: {
    fields: {
      preset: {
        kind: "select",
        label: "Pattern preset",
        default: "email",
        choices: [
          { label: "Email", value: "email" },
          { label: "URL", value: "url" },
          { label: "IPv4", value: "ipv4" },
          { label: "UUID", value: "uuid" },
          { label: "Hex color", value: "hex-color" },
          { label: "Strong password", value: "password" },
        ],
        pane: "main",
        span: "full",
      },
      language: {
        kind: "select",
        label: "Language",
        help: "Chooses the literal syntax and escaping, not the pattern itself.",
        default: "javascript",
        choices: [
          { label: "JavaScript", value: "javascript" },
          { label: "Python", value: "python" },
          { label: "PHP", value: "php" },
        ],
        pane: "main",
      },
      flags: {
        kind: "select",
        label: "Flags",
        help: "Finds one or every match, with optional case-insensitive matching.",
        default: "none",
        choices: [
          { label: "None", value: "none" },
          { label: "Global", value: "global" },
          { label: "Ignore case", value: "ignore-case" },
          {
            label: "Global · Ignore case",
            value: "global-ignore-case",
          },
        ],
        pane: "main",
      },
      addNamedGroups: {
        kind: "toggle",
        label: "Add named groups",
        help: "Captures the full match in a group named match.",
        default: false,
      },
      multiline: {
        kind: "toggle",
        label: "Multiline mode",
        help: "Makes line anchors apply to every line.",
        default: false,
      },
      explain: {
        kind: "toggle",
        label: "Explain pattern",
        help: "Adds a short code comment describing the preset.",
        default: false,
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Generate" },
  capabilities: { copy: true },
  workbenchMark: { text: "RX+", tone: "contrast" },
  labels: {
    empty: "Choose a pattern preset and target language.",
    ready: "Pattern is ready.",
    running: "Generating…",
  },
  content: {
    howToUse: [
      "Pick the thing you want to match. The pattern itself is the same for every language.",
      'Pick the target language. That decides the literal wrapper and which delimiter gets escaped: /…/ for JavaScript, r"…" for Python, ~…~ for PHP.',
      "Generate, then paste the literal straight into your code — no further escaping is needed.",
    ],
    limitations: [
      "The patterns are unanchored. Add ^ and $ yourself if you are validating a whole string rather than searching within one.",
      "The email pattern is a pragmatic approximation, not RFC 5322. Every regex short of the full grammar rejects some valid addresses — send a confirmation mail instead of trusting a pattern.",
      "The URL pattern only recognises http and https, and will not match other schemes or bare hostnames.",
      "The UUID pattern accepts versions 1–8 with an RFC 4122 variant nibble, so it rejects the nil UUID and the max UUID.",
    ],
    faq: [
      {
        q: "Why is the JavaScript output full of escaped slashes?",
        a: "Because a raw / would end the literal. The pattern is identical; only the delimiter is escaped for the target syntax.",
      },
      {
        q: "Should I validate emails with a regex?",
        a: "Only for a quick sanity check on shape. The single reliable validation is delivering a message to the address.",
      },
      {
        q: "What does the strong-password pattern enforce?",
        a: "Lookaheads requiring at least one lowercase letter, one uppercase letter, one digit, and one non-alphanumeric character, with a minimum length of 12.",
      },
    ],
    examples: [
      {
        label: "Explained Python UUID pattern",
        text: "",
        settings: {
          preset: "uuid",
          language: "python",
          flags: "ignore-case",
          addNamedGroups: true,
          multiline: false,
          explain: true,
        },
      },
      {
        label: "PHP hex color matcher",
        text: "",
        settings: {
          preset: "hex-color",
          language: "php",
          flags: "global-ignore-case",
          addNamedGroups: false,
          multiline: false,
          explain: false,
        },
      },
    ],
  },
} as const satisfies ToolSpec;
