import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.javascript-minifier",
  app: "devtools",
  category: "web-markup-tools",
  keywords: ["javascript", "minify", "compress", "comments", "whitespace", "js"],
  name: "JavaScript Minifier",
  description: "Remove comments and safe redundant whitespace from JavaScript.",
  layout: "stacked",
  input: {
    kind: "text",
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
      "Minify. Line and block comments are removed, runs of whitespace collapse to one space, and spacing around punctuators is dropped. String and template literal contents are left byte-for-byte intact.",
      "Test the output before shipping it. This is a text-level pass, not a compiler.",
    ],
    limitations: [
      "This is not a real minifier. There is no parser, no scope analysis, no identifier renaming, and no dead-code elimination — expect a fraction of the savings a build-step minifier gives you.",
      "Automatic semicolon insertion is not modelled. Source that relies on newlines to terminate statements can break when those newlines collapse.",
      "Regex literals are not distinguished from division, so a regex containing // or /* can be mangled.",
      "An unterminated string or block comment is rejected rather than guessed at.",
    ],
    faq: [
      {
        q: "Should I use this in a build pipeline?",
        a: "No. Use esbuild, terser, or swc there. This tool is for a quick one-off shrink of a snippet you can eyeball afterwards.",
      },
      {
        q: "Why did my code break?",
        a: "Most likely missing semicolons, or a regex literal the scanner read as division. Add explicit semicolons and re-run.",
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
