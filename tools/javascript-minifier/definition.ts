import { CODE_EXECUTION_MESSAGES, INPUT_EXECUTION_MESSAGES } from "../../lib/devtools/shared/execution-messages.ts";
import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  messages: {
    ...CODE_EXECUTION_MESSAGES,
    ...INPUT_EXECUTION_MESSAGES,
  },
  toolId: "devtools.javascript-minifier",
  app: "devtools",
  category: "web-markup-tools",
  keywords: ["javascript", "minify", "compress", "comments", "whitespace", "js"],
  name: "JavaScript Minifier",
  description: "Remove comments and safe redundant whitespace from JavaScript.",
  layout: "side-by-side",
  outputLanguage: "javascript",
  input: {
    kind: "text",
    language: "javascript",
    label: "JavaScript input",
    placeholder: "// greeting\nfunction greet(name) { return 'Hello ' + name; }",
  },
  settings: {
    fields: {},
  },
  trigger: {
    mode: "manual",
    actionLabel: "Minify JavaScript",
  },
  capabilities: {
    copy: true,
    download: true,
  },
  workbenchMark: { text: "JS-", tone: "contrast" },
  labels: {
    empty: "Paste JavaScript to strip comments and whitespace.",
    ready: "Minified JavaScript is ready.",
    running: "Minifying JavaScript…",
  },
  content: {
    howToUse: [
      "Paste the JavaScript you want shrunk — a small inline snippet or a single-file script.",
      "Minify. Line and block comments are removed, and safe spacing around punctuation is reduced. Strings, template literals, and regular expressions are left byte-for-byte intact.",
      "Test the output before shipping it. This tool compacts source without compiling or optimizing it.",
    ],
    limitations: [
      "JavaScript syntax is parsed, but there is no scope analysis, identifier renaming, or dead-code elimination. Expect less compression than a build-step minifier.",
      "Potentially significant line breaks are retained to preserve automatic semicolon insertion, so output may span multiple lines.",
      "Template contents, including interpolation expressions and any comments inside them, are left unchanged.",
      "Invalid JavaScript, including unterminated strings and comments, is rejected. TypeScript and JSX are not supported.",
    ],
    faq: [
      {
        q: "Should I use this in a build pipeline?",
        a: "No. Use esbuild, terser, or swc there. This tool is for a quick one-off shrink of a snippet you can eyeball afterwards.",
      },
      {
        q: "Why does the result still contain line breaks?",
        a: "Some line breaks affect where JavaScript ends a statement, such as after return or before ++. They are kept instead of risking a change in meaning.",
      },
    ],
    examples: [
      {
        label: "Commented function",
        text: "// greeting\nfunction greet(name) { return 'Hello ' + name; }",
      },
    ],
  },
} as const satisfies ToolSpec;
