import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.markdown-previewer",
  app: "devtools",
  category: "web-markup-tools",
  keywords: ["markdown", "preview", "md", "html", "readme", "render", "commonmark"],
  name: "Markdown Previewer",
  description: "Render Markdown for a sandboxed preview.",
  layout: "side-by-side",
  input: {
    kind: "text",
    language: "markdown",
    label: "Markdown document",
    acceptFiles: {
      accept: ".md,.markdown,.txt,text/markdown,text/plain",
      maxBytes: 2_000_000,
      maxEditableBytes: 2_000_000,
    },
    placeholder: "# Preview\n\n- Fast\n- Private",
  },
  settings: {
    fields: {
      syncScroll: {
        kind: "toggle",
        label: "Sync scroll",
        help: "Keep the editor and preview at the same relative position when scrolling either pane.",
        default: true,
      },
      previewMode: {
        kind: "select",
        label: "Preview mode",
        help: "Switches between GitHub extensions and standard CommonMark parsing.",
        default: "gfm",
        choices: [
          { label: "GitHub flavored", value: "gfm" },
          { label: "CommonMark", value: "commonmark" },
        ],
      },
      syntaxHighlighting: {
        kind: "toggle",
        label: "Syntax highlighting",
        help: "Colors nearby code using its language label or automatic detection. Very large blocks remain plain text to keep the preview responsive.",
        default: true,
      },
      safeLinks: {
        kind: "toggle",
        label: "Safe links",
        help: "Adds new-tab and opener protection to exported HTML links. Website links in the preview always open in a separate tab.",
        default: false,
      },
    },
  },
  trigger: { mode: "live", debounceMs: 160 },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "MDV", tone: "accent" },
  labels: {
    result: "Preview",
    empty: "Write Markdown or load an example to preview it.",
    ready: "Rendered preview is current.",
    running: "Rendering Markdown…",
  },
  content: {
    howToUse: [
      "Paste or type Markdown on the left. The preview re-renders as you stop typing — there is no button to press.",
      "Use it to check a README, a changelog entry, or a comment before you commit it, especially the parts that are easy to get wrong: nested lists, tables, and fenced code blocks.",
      "Copy the generated HTML if you need to paste the rendered form into a CMS or an email template.",
      "The preview uses the same body viewer as the SmartTools blog. Other sites may style the exported HTML differently.",
    ],
    limitations: [
      "GitHub-flavoured Markdown is the default; CommonMark mode disables extensions such as tables and strikethrough.",
      "The preview blocks scripts and form submissions. Remote images load from their hosting sites and make network requests.",
      "Use absolute image URLs. Relative links and image paths depend on where the document is published.",
      "Syntax highlighting supports common languages. Add a language after the opening code fence for reliable colors, or use text to keep a block unhighlighted.",
      "Large documents render sections and code colors as you scroll. Copy and download always include the complete document; very large code blocks keep their text without syntax colors.",
    ],
    faq: [
      {
        q: "Is my document uploaded anywhere?",
        a: "The Markdown is rendered locally and is not uploaded. Images referenced in the document are requested from their hosting sites.",
      },
      {
        q: "Is raw HTML inside my Markdown rendered?",
        a: "It is rendered as markup inside a sandbox that blocks scripts and form submissions. Remote images can load from their hosting sites.",
      },
      {
        q: "Why do my tables not look right?",
        a: "GitHub-flavoured tables need a header row and a separator row of dashes, and every row needs the same number of pipe-separated cells.",
      },
      {
        q: "Can I export the HTML?",
        a: "Yes. The rendered HTML is what the copy and download actions produce.",
      },
    ],
    examples: [{ label: "Headings and a list", text: "# Preview\n\n- Fast\n- Private" }],
  },
} as const satisfies ToolSpec;
