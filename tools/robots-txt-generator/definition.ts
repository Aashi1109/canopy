import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.robots-txt-generator",
  app: "devtools",
  category: "developer-generators",
  keywords: ["robots.txt", "seo", "crawler", "disallow", "sitemap", "crawl delay", "user-agent"],
  name: "Robots.txt Generator",
  description: "Generate robots.txt directives and an optional sitemap line.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "Disallow paths",
    placeholder: "/admin\n/private",
  },
  settings: {
    fields: {
      userAgent: {
        kind: "select",
        label: "User-agent",
        help: "Chooses which crawler receives this rule group.",
        default: "*",
        choices: [
          { label: "* · All crawlers", value: "*" },
          { label: "Googlebot", value: "Googlebot" },
          { label: "Bingbot", value: "Bingbot" },
          { label: "DuckDuckBot", value: "DuckDuckBot" },
        ],
        pane: "main",
      },
      newDirective: {
        kind: "select",
        label: "New directive",
        help: "Applies Allow or Disallow to the path input.",
        default: "disallow",
        choices: [
          { label: "Disallow", value: "disallow" },
          { label: "Allow", value: "allow" },
        ],
        pane: "main",
      },
      allowPaths: {
        kind: "textarea",
        label: "Allow paths",
        help: "Adds one explicit Allow rule per root-relative path.",
        default: "",
        rows: 4,
        pane: "main",
      },
      allowAll: {
        kind: "toggle",
        label: "Allow all",
        help: "Emits an empty Disallow, which permits everything. Any paths you entered are ignored.",
        default: false,
      },
      sitemap: {
        kind: "text",
        label: "Sitemap URL",
        help: "Must be an absolute http or https URL. Leave blank to omit the line.",
        default: "https://example.com/sitemap.xml",
        placeholder: "https://example.com/sitemap.xml",
        pane: "main",
      },
      crawlDelay: {
        kind: "number",
        label: "Crawl delay",
        help: "Seconds between requests. 0 omits the line. Googlebot ignores this directive.",
        default: 0,
        min: 0,
        max: 86400,
        suffix: "s",
        pane: "main",
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Generate robots.txt" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "BOT", tone: "accent" },
  labels: {
    empty: "Enter the paths you want blocked, or switch on Allow all.",
    ready: "robots.txt is ready.",
    running: "Generating robots.txt…",
  },
  content: {
    howToUse: [
      "List one path per line, each starting with `/`. Paths are relative to the site root — `/admin`, not `https://example.com/admin`.",
      "Switch on Allow all when you want an explicitly permissive file; your path list is then ignored and a bare `Disallow:` is emitted.",
      "Add your sitemap URL as an absolute http or https address. It is validated, so a typo is reported rather than silently written out.",
      "Download the file and place it at the site root — `https://yourdomain.com/robots.txt`. Anywhere else and no crawler will read it.",
    ],
    limitations: [
      "Only one user-agent group is produced. Additional crawler groups and wildcard patterns (`*`, `$`) must be added by hand.",
      "`Crawl-delay` is not part of the original specification. Google ignores it entirely; Bing and Yandex honour it.",
      "robots.txt controls crawling, not indexing. A blocked URL can still appear in search results if other pages link to it — use a `noindex` meta tag or an HTTP header to keep a page out of the index.",
      "It is a public file and a request, not an access control. Listing `/admin` tells everyone the path exists and does not stop anyone from visiting it. Never use it to hide something sensitive.",
      "Paths are written verbatim with no percent-encoding, so a path containing spaces or non-ASCII characters needs encoding first.",
    ],
    faq: [
      {
        q: "Does blocking a URL remove it from Google?",
        a: "No. Blocking prevents crawling, which can actually keep a URL in the index without a snippet. To remove a page, allow crawling and serve `noindex`.",
      },
      {
        q: "Can I use this to protect a private page?",
        a: "No. robots.txt is publicly readable and purely advisory. Use authentication.",
      },
      {
        q: "Why does my crawl delay have no effect on Google?",
        a: "Googlebot ignores `Crawl-delay`. Set the crawl rate in Search Console instead.",
      },
      {
        q: "Where does the file go?",
        a: "At the root of the host: `https://yourdomain.com/robots.txt`. It does not apply to subdomains, which each need their own.",
      },
    ],
    examples: [
      { label: "Block two paths", text: "/admin\n/private" },
      { label: "Block a query-heavy area", text: "/search\n/cart\n/checkout" },
    ],
  },
} as const satisfies ToolSpec;
