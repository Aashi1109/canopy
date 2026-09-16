import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.markdown-to-html",
  app: "devtools",
  category: "web-markup-tools",
  keywords: ["markdown", "html", "convert", "md", "render", "commonmark", "gfm"],
  name: "Markdown to HTML",
  description: "Convert Markdown source to HTML.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "Markdown input",
    placeholder: "# Hello\n\n**Smart tools** stay focused.",
  },
  settings: {
    fields: {
      markdownFlavor: {
        kind: "select",
        label: "Markdown flavor",
        help: "Use GitHub extensions or parse standard CommonMark.",
        default: "gfm",
        choices: [
          { label: "GFM", value: "gfm" },
          { label: "CommonMark", value: "commonmark" },
        ],
      },
      sanitizeHtml: {
        kind: "toggle",
        label: "Sanitize HTML",
        help: "Remove raw HTML and unsafe link targets from the generated output.",
        default: false,
      },
      openLinksSafely: {
        kind: "toggle",
        label: "Open links safely",
        help: "Open generated links in a new tab without opener access.",
        default: false,
      },
    },
  },
  trigger: {
    mode: "manual",
    actionLabel: "Convert to HTML",
  },
  capabilities: {
    copy: true,
    download: true,
  },
  workbenchMark: { text: "M>H", tone: "contrast" },
  labels: {
    empty: "Provide Markdown to convert to HTML.",
    ready: "Converted HTML is ready.",
    running: "Converting Markdown to HTML…",
  },
  content: {
    howToUse: [
      "Paste your Markdown — a README, release notes, or a docs page.",
      "Convert. Headings, emphasis, lists, links, tables, and fenced code blocks are all supported.",
      "Copy the HTML fragment into your template. No wrapper document, stylesheet, or script is added.",
    ],
    limitations: [
      "The output is a fragment, not a full page — there is no doctype, head, or styling.",
      "Sanitizing is off by default, so raw HTML passes through unchanged unless you enable Sanitize HTML.",
      "Front matter is not stripped; a YAML block at the top is rendered as content.",
      "Extensions such as footnotes, definition lists, and math are not enabled.",
    ],
    faq: [
      {
        q: "Is the HTML safe to render?",
        a: "Only with Sanitize HTML enabled. By default, raw HTML and unsafe link targets survive the conversion.",
      },
      {
        q: "Which flavour of Markdown is this?",
        a: "CommonMark with GitHub-flavoured extensions such as tables and strikethrough.",
      },
    ],
    examples: [
      {
        label: "Heading and bold text",
        text: "# Hello\n\n**Smart tools** stay focused.",
      },
    ],
  },
} as const satisfies ToolSpec;
