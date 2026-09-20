import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.open-graph-preview",
  app: "devtools",
  category: "developer-generators",
  keywords: ["open graph", "og tags", "social card", "preview", "meta tags", "twitter card", "link preview"],
  name: "Open Graph Preview",
  description: "Preview a website’s social sharing cards and inspect its Open Graph metadata.",
  input: {
    kind: "fields",
    label: "Website URL",
    fields: [
      { channel: "text", label: "Website URL", placeholder: "https://example.com", required: true, maxLength: 2048 },
    ],
  },
  settings: { fields: {} },
  trigger: { mode: "manual", actionLabel: "Scan URL" },
  capabilities: { network: true, cancel: true, copy: true, download: true },
  workbenchMark: { text: "OG", tone: "accent" },
  labels: {
    result: "Social previews",
    empty: "Enter a public website URL to inspect its sharing metadata.",
    ready: "Social previews and metadata checks are ready.",
    running: "Fetching the page and its sharing image…",
  },
  content: {
    howToUse: [
      "Enter a public website URL or domain such as slack.com, then select Scan URL. Domains without a protocol use HTTPS.",
      "Switch between Facebook, X, LinkedIn, WhatsApp, and Discord to preview the fetched title, description, and image.",
      "Review the metadata inspector for missing tags and image issues. The HTML tags tab lets you copy or download the metadata found on the page.",
      "After updating your website, select Rescan to fetch it again.",
    ],
    limitations: [
      "Previews approximate each platform’s layout. Platforms may crop images differently or continue displaying cached metadata.",
      "The scanner reads the HTML returned by the website without running JavaScript. Login-only pages and sites that block automated requests cannot be inspected.",
      "Only public HTTP and HTTPS addresses on their standard ports are supported. Scans follow up to five redirects and limit page and image sizes.",
      "Your submitted URL and any sharing image URLs are fetched by our server. The destination websites receive those requests; browser cookies and login credentials are not forwarded.",
    ],
    faq: [
      {
        q: "Do I need to enter a title or description?",
        a: "No. The scanner extracts existing Open Graph and Twitter tags from your page, with the HTML title and meta description as fallbacks.",
      },
      {
        q: "Does this tool generate new meta tags?",
        a: "It inspects tags already on your website. Use Meta Tag Generator to create tags for a new page.",
      },
      {
        q: "Why does a platform still show my old preview?",
        a: "Social platforms cache their own previews. Rescanning here checks the current page but does not clear another platform’s cache.",
      },
      {
        q: "Why is the sharing image unavailable?",
        a: "The image may be missing, blocked, too large, or an unsupported format. The inspector keeps the original image URL and explains fetch failures.",
      },
    ],
    examples: [{ label: "Inspect Slack", text: "https://slack.com" }],
  },
} as const satisfies ToolSpec;
