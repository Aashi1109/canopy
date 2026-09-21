import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.javascript-formatter",
  app: "devtools",
  category: "web-markup-tools",
  keywords: ["javascript", "format", "beautify", "indent", "pretty print", "minified", "js"],
  name: "JavaScript Formatter",
  description: "Apply readable indentation to JavaScript source.",
  layout: "side-by-side",
  outputLanguage: "javascript",
  input: {
    kind: "text",
    language: "javascript",
    label: "JavaScript input",
    placeholder: "function greet(name){return 'Hello ' + name;}",
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
    },
  },
  trigger: { mode: "manual", actionLabel: "Format JavaScript" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "JS{}", tone: "contrast" },
  labels: {
    empty: "Paste JavaScript to indent it.",
    ready: "Formatted JavaScript is ready.",
    running: "Formatting JavaScript…",
  },
  content: {
    howToUse: [
      "Paste minified or badly indented JavaScript — a one-line bundle chunk is the typical case.",
      "Format. Braces open a new two-space level, semicolons end a line, and runs of whitespace collapse to a single space.",
      "Use it to make an unfamiliar snippet readable enough to understand. For code you own, run Prettier or your editor's formatter instead — this is a reading aid, not a build step.",
      "String and template literals are tracked and left untouched, so a `;` or `{` inside a string does not trigger a line break.",
    ],
    limitations: [
      "This is a character-level pass, not a parser. It has no idea what an expression is, so it cannot reflow long lines, align arguments, or normalize quotes.",
      "Regex literals are not recognised. A regular expression containing a brace or a quote character can confuse the string tracking and mangle the output.",
      "Comments are not treated specially — a `//` comment containing a brace will be reindented incorrectly.",
      "Line breaks are driven by `{`, `}`, and `;` only, so `if (a) b(); else c();` stays on one line and a `for(;;)` header is split across three.",
      "Unterminated strings are reported as an error rather than passed through.",
    ],
    faq: [
      {
        q: "Is this a replacement for Prettier?",
        a: "No. It has no parser and makes no formatting decisions beyond indentation. Use it to read someone else's minified code; use Prettier on your own.",
      },
      {
        q: "Why did my regex get mangled?",
        a: "Regex literals are not detected, so a `/.../ ` containing braces or quotes is misread as ordinary code. Reformat that section by hand.",
      },
      {
        q: "Does it change what the code does?",
        a: "It only inserts and removes whitespace, so ordinary code behaves identically. The regex and comment caveats above are the exceptions to check.",
      },
    ],
    examples: [
      {
        label: "Minified function",
        text: "function greet(name){if(name){return `Hello ${name}`;}return 'Hello';}",
      },
      { label: "One-line object", text: "const a={b:1,c:{d:2}};" },
    ],
  },
} as const satisfies ToolSpec;
