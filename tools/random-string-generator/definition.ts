import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.random-string-generator",
  app: "devtools",
  category: "text-tools",
  keywords: ["random", "string", "generator", "token", "hex", "alphanumeric", "id"],
  name: "Random String Generator",
  description: "Generate random strings from a selected character set.",
  input: { kind: "none" },
  settings: {
    fields: {
      length: {
        kind: "number",
        label: "Length",
        default: 24,
        min: 1,
        max: 1024,
      },
      count: {
        kind: "number",
        label: "How many",
        default: 5,
        min: 1,
        max: 100,
      },
      charset: {
        kind: "select",
        label: "Character set",
        default: "alnum",
        choices: [
          {
            label: "Alphanumeric",
            value: "alnum",
          },
          {
            label: "Letters",
            value: "letters",
          },
          {
            label: "Numbers",
            value: "numbers",
          },
          {
            label: "Hex",
            value: "hex",
          },
          {
            label: "All + symbols",
            value: "all",
          },
        ],
      },
    },
  },
  trigger: {
    mode: "manual",
    actionLabel: "Generate",
  },
  capabilities: {
    copy: true,
    download: true,
  },
  workbenchMark: { text: "A?", tone: "accent" },
  labels: {
    empty: "Choose a length and character set, then generate.",
    ready: "Strings generated.",
    running: "Generating strings…",
  },
  content: {
    howToUse: [
      "Set the length and how many strings you want in one batch.",
      "Pick the character set. Hex is the safe choice for anything that will end up in a URL, a filename, or a database key; alphanumeric packs more entropy per character.",
      "Generate and copy. Values come from the Web Crypto API in this tab and are never sent to a server.",
    ],
    limitations: [
      "These are uniformly random strings, not UUIDs or nanoids. Use the dedicated generators when you need those formats.",
      "Nothing is stored — reloading the page loses the batch.",
      'The "All + symbols" set includes characters that need escaping in shells and URLs; prefer hex or alphanumeric for anything embedded in a command or link.',
    ],
    faq: [
      {
        q: "How much entropy do I get?",
        a: "About 5.95 bits per alphanumeric character and 4 bits per hex character. A 24-character alphanumeric string is roughly 142 bits.",
      },
      {
        q: "Are collisions possible?",
        a: "Mathematically yes, practically no at these lengths. Below 16 characters, prefer a checked unique key instead.",
      },
    ],
  },
} as const satisfies ToolSpec;
