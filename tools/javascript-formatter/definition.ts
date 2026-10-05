import { CODE_EXECUTION_MESSAGES, INPUT_EXECUTION_MESSAGES } from "../../lib/devtools/shared/execution-messages.ts";
import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  messages: {
    ...CODE_EXECUTION_MESSAGES,
    ...INPUT_EXECUTION_MESSAGES,
  },
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
      "Format. Braces open a new indentation level using your setting, and semicolons end a line. Existing line breaks are retained where they can affect JavaScript meaning.",
      "Use it to make an unfamiliar snippet readable enough to understand. For code you own, run Prettier or your editor's formatter instead — this is a reading aid, not a build step.",
      "String and template literals are tracked and left untouched, so a `;` or `{` inside a string does not trigger a line break.",
    ],
    limitations: [
      "JavaScript syntax is parsed to protect strings, templates, regular expressions, and comments. Formatting remains limited to indentation and line breaks; it does not reflow long lines, align arguments, or normalize quotes.",
      "Template contents, including their interpolation expressions, are left unchanged.",
      "Semicolons introduce line breaks even inside a `for(;;)` header. This changes presentation without changing the loop.",
      "Invalid JavaScript, including unterminated strings, is reported as an error. TypeScript and JSX are not supported.",
    ],
    faq: [
      {
        q: "Is this a replacement for Prettier?",
        a: "No. It makes limited formatting decisions around indentation and line breaks. Use it to read someone else's minified code; use Prettier on your own.",
      },
      {
        q: "Are regular expressions preserved?",
        a: "Yes. The parser distinguishes regular expressions from division and preserves their contents, including braces, quotes, and spaces.",
      },
      {
        q: "Does it change what the code does?",
        a: "It preserves literal contents and existing statement boundaries while changing indentation. Review and test formatted code before using it in production.",
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
