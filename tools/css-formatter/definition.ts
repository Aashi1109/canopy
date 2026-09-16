import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.css-formatter",
  app: "devtools",
  category: "web-markup-tools",
  keywords: ["css", "format", "beautify", "prettify", "indent", "stylesheet", "unminify"],
  name: "CSS Formatter",
  description: "Apply readable indentation to CSS.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "CSS input",
    placeholder: ".card{color:#2563eb;padding:1rem;}",
  },
  settings: {
    fields: {
      indentWidth: {
        kind: "select",
        label: "Indent width",
        help: "Choose two spaces, four spaces, or tabs for each nesting level.",
        default: "2",
        choices: [
          { label: "2 spaces", value: "2" },
          { label: "4 spaces", value: "4" },
          { label: "Tabs", value: "tab" },
        ],
      },
      printWidth: {
        kind: "select",
        label: "Print width",
        help: "Wrap long declaration values at spaces, or keep today's unwrapped output.",
        default: "unlimited",
        choices: [
          { label: "No wrapping", value: "unlimited" },
          { label: "80 columns", value: "80" },
          { label: "100 columns", value: "100" },
          { label: "120 columns", value: "120" },
        ],
      },
      propertyOrder: {
        kind: "select",
        label: "Property order",
        help: "Keep declaration order or alphabetize properties within each block.",
        default: "preserve",
        choices: [
          { label: "Preserve source", value: "preserve" },
          { label: "Alphabetical", value: "alphabetical" },
        ],
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Format CSS" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "CSS+" },
  labels: {
    empty: "Paste CSS to format its indentation.",
    ready: "Formatted CSS is ready.",
    running: "Formatting CSS…",
  },
  content: {
    howToUse: [
      "Paste minified or badly indented CSS. Blocks are broken onto their own lines using the selected indentation.",
      "Nested at-rules such as `@media` and `@supports` indent their contents, so a compressed stylesheet becomes readable enough to diff.",
      "Format, then copy the result back into your editor.",
    ],
    limitations: [
      "Comments are stripped, not reflowed. If you need them, format a copy.",
      "This is a brace-and-semicolon formatter, not a CSS parser. It does not validate properties, add missing semicolons, or normalise colours and units.",
      "Whitespace inside a declaration is collapsed to single spaces, so `color:#111` stays without a space after the colon — the input's spacing inside a value is preserved rather than canonicalised.",
      "Print-width wrapping only breaks at spaces. Quoted values and lines without a safe break stay unwrapped.",
      "An unterminated string is rejected with 'Source contains an unfinished string.' — quotes are tracked so that braces inside a string are not treated as blocks.",
    ],
    faq: [
      {
        q: "Where did my comments go?",
        a: "They are removed before formatting. That is deliberate — a comment can sit anywhere, including mid-declaration, and reflowing one safely needs a full parser.",
      },
      {
        q: "Can I choose four-space indentation?",
        a: "Yes. Choose two spaces, four spaces, or tabs under Formatting settings.",
      },
      {
        q: "Will it fix broken CSS?",
        a: "No. It reindents whatever you give it. Unbalanced braces produce unbalanced output rather than an error.",
      },
    ],
    examples: [
      {
        label: "Minified rules",
        text: "body{color:#111;background:#fff}a:hover{text-decoration:underline}",
      },
    ],
  },
} as const satisfies ToolSpec;
