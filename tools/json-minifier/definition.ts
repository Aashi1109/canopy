import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.json-minifier",
  app: "devtools",
  category: "json-tools",
  keywords: ["json", "minify", "compact", "whitespace", "compress", "payload size"],
  name: "JSON Minifier",
  description: "Remove insignificant whitespace from JSON.",
  outputLanguage: "json",
  input: {
    kind: "text",
    language: "json",
    label: "JSON input",
    acceptFiles: {
      accept: ".json,application/json,text/json",
      maxBytes: 104_857_600,
      maxEditableBytes: 2_000_000,
    },
    placeholder: '{\n  "name": "Ada",\n  "active": true\n}',
  },
  settings: {
    fields: {
      repairMode: {
        kind: "select",
        label: "Auto-fix broken JSON",
        help: "How to handle properties whose value is missing or unparseable.",
        default: "remove",
        choices: [
          { label: "Remove broken parts", value: "remove" },
          { label: "Set broken values to null", value: "null" },
          { label: "Off (strict)", value: "off" },
        ],
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Minify" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "J-", tone: "contrast" },
  labels: {
    empty: "Paste JSON to strip its whitespace.",
    ready: "Minified JSON is ready.",
    running: "Minifying JSON…",
  },
  content: {
    howToUse: [
      "Paste the formatted JSON you want to shrink. Everything runs in this browser tab; nothing is uploaded.",
      "Leave auto-fix on 'Remove broken parts' to salvage a payload that was truncated mid-copy, or switch to 'Off (strict)' when you need the input rejected rather than repaired.",
      "Run the tool and copy the single-line result into your config, fixture, or request body.",
    ],
    limitations: [
      "Minifying re-serialises through JSON.parse, so comments, trailing commas, and any other JSON5 syntax are lost rather than preserved.",
      "Key order is preserved, but duplicate keys collapse to the last occurrence — that is JSON.parse behaviour, not a choice this tool makes.",
      "Numbers are re-emitted in JavaScript's shortest round-trip form, so 1.50 becomes 1.5 and integers beyond 2^53 lose precision.",
      "Editable text is capped at 2,000,000 characters. Strict JSON files up to 100 MiB can be minified in read-only large-file mode; repair remains available for editable input only.",
    ],
    faq: [
      {
        q: "How much smaller will my payload get?",
        a: "Only the whitespace is removed. Pretty-printed JSON typically shrinks 15–30%; already-compact JSON barely changes. Gzip on the wire matters far more.",
      },
      {
        q: "What does auto-fix actually repair?",
        a: "Properties whose value is missing or unparseable. 'Remove broken parts' drops them, 'Set broken values to null' keeps the key with a null value, and 'Off (strict)' fails on anything JSON.parse rejects.",
      },
      {
        q: "Is minified JSON still valid JSON?",
        a: "Yes. Whitespace between tokens is insignificant in JSON, so the minified form parses to exactly the same value.",
      },
    ],
    examples: [
      {
        label: "Pretty-printed object",
        text: '{\n  "name": "Ada",\n  "active": true\n}',
      },
    ],
  },
} as const satisfies ToolSpec;
