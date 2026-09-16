import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.sitemap-generator",
  app: "devtools",
  category: "developer-generators",
  keywords: ["sitemap", "xml", "seo", "urlset", "crawl", "urls", "generator"],
  name: "Sitemap Generator",
  description: "Generate an XML sitemap from one URL per line.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "URLs",
    placeholder: "https://example.com/\nhttps://example.com/about",
  },
  settings: {
    fields: {},
  },
  trigger: {
    mode: "manual",
    actionLabel: "Generate sitemap",
  },
  capabilities: {
    copy: true,
    download: true,
  },
  workbenchMark: { text: "MAP" },
  labels: {
    empty: "Provide one absolute URL per line to generate a sitemap.",
    ready: "XML sitemap is ready.",
    running: "Generating XML sitemap…",
  },
  content: {
    howToUse: [
      "Paste one absolute URL per line. Blank lines are ignored and exact duplicates are collapsed.",
      "Generate. Every URL is validated as an absolute http or https address and normalised before it is written, and each loc value is XML-escaped.",
      "Download sitemap.xml, put it at your site root, and reference it from robots.txt with a Sitemap: line.",
    ],
    limitations: [
      "One sitemap holds at most 50,000 URLs, per the sitemaps.org protocol. Larger sites need several files plus a sitemap index, which this tool does not build.",
      "Only loc is emitted. lastmod, changefreq, and priority are omitted — lastmod is the only one crawlers still weigh, and a wrong value is worse than none.",
      "Relative URLs and non-http(s) schemes are rejected rather than skipped.",
      "URLs are normalised by the URL parser, so a missing trailing slash on a bare host becomes one and IDN hosts are punycoded.",
      "The 50MB uncompressed size limit is not checked.",
    ],
    faq: [
      {
        q: "Where do I put the file?",
        a: "At your site root, then add a Sitemap: line to robots.txt. A sitemap can only list URLs at or below its own directory.",
      },
      {
        q: "Should I add lastmod?",
        a: "Only if it is accurate. Crawlers discount a lastmod that always says today, so an omitted value is better than a fabricated one.",
      },
      {
        q: "What about more than 50,000 URLs?",
        a: "Split them across several sitemaps and publish a sitemap index that points at each one.",
      },
    ],
    examples: [
      {
        label: "Two pages",
        text: "https://example.com/\nhttps://example.com/about",
      },
    ],
  },
} as const satisfies ToolSpec;
