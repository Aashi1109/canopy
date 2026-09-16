import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.html-viewer",
  app: "devtools",
  category: "web-markup-tools",
  keywords: ["html", "preview", "viewer", "render", "sandbox", "email template", "snippet"],
  name: "HTML Viewer",
  description: "Return HTML for display inside a sandboxed preview.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "HTML source",
    placeholder: "<article><h1>Hello</h1><p>Sandboxed preview.</p></article>",
  },
  settings: {
    fields: {
      showOutlines: {
        kind: "toggle",
        label: "Show outlines",
        help: "Add element bounds to the preview and exported HTML.",
        default: false,
      },
    },
  },
  trigger: { mode: "live", debounceMs: 250 },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "DOM", tone: "accent" },
  labels: {
    empty: "Paste HTML to render it in a sandboxed preview.",
    ready: "Preview is up to date.",
    running: "Rendering preview…",
  },
  content: {
    howToUse: [
      "Paste a fragment or a whole document. The preview re-renders as you type.",
      "The markup is rendered inside a fully sandboxed iframe: no scripts run, no forms submit, no navigation happens, and it has no access to this page or to your cookies and storage.",
      "Use it to eyeball a snippet from a CMS field, an email template, or a scraped page before trusting it.",
    ],
    limitations: [
      "The markup is not sanitised — it is contained, not cleaned. Do not treat a clean-looking preview as evidence that the HTML is safe to inject into your own page; your app almost certainly renders it with fewer restrictions than this iframe does.",
      "Because the sandbox blocks everything, scripted content will look wrong: `<script>`, inline event handlers, and anything that needs JavaScript simply do nothing.",
      "Remote resources — external stylesheets, images, fonts, iframes — may not load, so the preview can differ from a real page.",
      "The preview has no page styles of its own beyond the browser defaults, so a fragment that relies on your site's CSS will look unstyled.",
      "Email clients apply their own aggressive rewriting. A preview here is not a substitute for testing in the client you target.",
    ],
    faq: [
      {
        q: "Is it safe to preview HTML I do not trust?",
        a: "Previewing is safe: the iframe carries an empty `sandbox` attribute, which blocks scripts, forms, popups, navigation, and same-origin access. Copying that HTML into an application that renders it without those restrictions is not safe.",
      },
      {
        q: "Why does my JavaScript not run?",
        a: "By design. The sandbox has no `allow-scripts` token, so no script executes. That is what makes untrusted markup safe to look at.",
      },
      {
        q: "Does this strip dangerous tags?",
        a: "No. Your HTML comes back unchanged. If you need sanitised output, run it through a sanitiser such as DOMPurify on the server or in your own app.",
      },
    ],
    examples: [
      {
        label: "Simple article",
        text: "<article><h1>Hello</h1><p>Sandboxed preview.</p></article>",
      },
    ],
  },
} as const satisfies ToolSpec;
