import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.html-formatter",
  app: "devtools",
  category: "web-markup-tools",
  keywords: ["html", "format", "beautify", "indent", "pretty print", "markup"],
  name: "HTML Formatter",
  description: "Apply readable indentation to HTML.",
  layout: "side-by-side",
  outputLanguage: "html",
  input: {
    kind: "text",
    language: "html",
    label: "HTML input",
    placeholder: "<main><h1>Hello</h1><p>Smart tools</p></main>",
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
        help: "Wrap long start tags at the selected column, or keep today's unwrapped output.",
        default: "unlimited",
        choices: [
          { label: "No wrapping", value: "unlimited" },
          { label: "80 columns", value: "80" },
          { label: "100 columns", value: "100" },
          { label: "120 columns", value: "120" },
        ],
      },
      attributeWrapping: {
        kind: "select",
        label: "Attribute wrapping",
        help: "Wrap by print width, preserve input wrapping, or place one attribute per line.",
        default: "auto",
        choices: [
          { label: "Auto", value: "auto" },
          { label: "Preserve input", value: "preserve" },
          { label: "One per line", value: "one-per-line" },
        ],
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Format HTML" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "</>", tone: "contrast" },
  labels: {
    empty: "Paste HTML to indent it.",
    ready: "Formatted HTML is ready.",
    running: "Formatting HTML…",
  },
  content: {
    howToUse: [
      "Paste minified or badly indented HTML — a rendered page source, an email template, a fragment from a build output.",
      "Format. Each tag, comment, doctype, and text run goes on its own line using the selected indentation.",
      "Read the structure, find the unclosed tag, then copy the result back into your editor.",
    ],
    limitations: [
      "This is an indenter, not a parser. It does not validate the markup, repair mismatched tags, or rewrite attribute values.",
      "Whitespace between tags is collapsed before indenting, which changes rendering wherever whitespace was significant — inline elements, <pre>, and <textarea> in particular.",
      "Script and style bodies are treated as opaque text and are not reformatted.",
      "Text content is emitted verbatim. Nothing is escaped or sanitised, so treat formatted untrusted markup as exactly as dangerous as the input.",
    ],
    faq: [
      {
        q: "Will formatting change how my page renders?",
        a: "It can. Whitespace between inline elements is meaningful in HTML, and it is collapsed here. Do not run this over production markup you are not going to re-check.",
      },
      {
        q: "Why is my self-closing tag not indented as a block?",
        a: "Void elements — br, img, input, meta, and the rest — never open a level, and neither does a tag written with a trailing slash.",
      },
    ],
    examples: [
      {
        label: "Minified fragment",
        text: "<main><h1>Hello</h1><p>Smart tools</p></main>",
      },
    ],
  },
} as const satisfies ToolSpec;
