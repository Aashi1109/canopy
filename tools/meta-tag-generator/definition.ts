import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.meta-tag-generator",
  app: "devtools",
  category: "developer-generators",
  keywords: ["meta tags", "seo", "open graph", "og", "canonical", "description", "head"],
  name: "Meta Tag Generator",
  description: "Generate common search and social meta tags.",
  input: {
    kind: "fields",
    label: "Page title and description",
    fields: [
      {
        channel: "text",
        label: "Page title",
        placeholder: "Smart Tools for Developers",
        required: true,
      },
      {
        channel: "secondary",
        label: "Meta description",
        placeholder: "Fast, private utilities for everyday development work.",
        required: true,
        multiline: true,
      },
    ],
  },
  settings: {
    fields: {
      keywords: {
        kind: "text",
        label: "Keywords",
        help: "Ignored by every major search engine. Left in for the handful of internal search tools that still read it.",
        default: "developer tools, utilities",
      },
      author: {
        kind: "text",
        label: "Author",
        default: "SmartTools",
      },
      canonical: {
        kind: "text",
        label: "Canonical URL",
        help: "Must be an absolute http or https URL.",
        default: "https://example.com/tools",
        pane: "main",
      },
      image: {
        kind: "text",
        label: "Open Graph image URL",
        help: "Must be absolute. Social crawlers cannot resolve a relative path.",
        default: "https://example.com/og.png",
      },
      locale: {
        kind: "select",
        label: "Content locale",
        help: "Add a locale tag when Open Graph is included.",
        default: "none",
        choices: [
          { label: "Do not emit", value: "none" },
          { label: "English (United States)", value: "en_US" },
          { label: "English (United Kingdom)", value: "en_GB" },
          { label: "French (France)", value: "fr_FR" },
          { label: "German (Germany)", value: "de_DE" },
          { label: "Spanish (Spain)", value: "es_ES" },
        ],
        pane: "main",
      },
      robots: {
        kind: "select",
        label: "Robots directive",
        help: "Set whether crawlers index the page and follow its links.",
        default: "none",
        choices: [
          { label: "Do not emit", value: "none" },
          { label: "Index, follow", value: "index_follow" },
          { label: "No index, follow", value: "noindex_follow" },
          { label: "Index, no follow", value: "index_nofollow" },
          { label: "No index, no follow", value: "noindex_nofollow" },
        ],
        pane: "main",
      },
      includeOpenGraph: {
        kind: "toggle",
        label: "Include Open Graph",
        help: "Include title, description, URL, image, and locale tags.",
        default: true,
      },
      includeTwitterCard: {
        kind: "toggle",
        label: "Include Twitter card",
        help: "Include a summary large image card for Twitter.",
        default: false,
      },
      addViewport: {
        kind: "toggle",
        label: "Add viewport",
        help: "Include a responsive device-width viewport tag.",
        default: false,
      },
    },
  },
  trigger: {
    mode: "manual",
    actionLabel: "Generate meta tags",
  },
  capabilities: {
    copy: true,
    download: true,
  },
  workbenchMark: { text: "META", tone: "accent" },
  labels: {
    empty: "Provide a page title and meta description to generate the tags.",
    ready: "Meta tags are ready to copy or download.",
    running: "Generating the meta tags…",
  },
  content: {
    howToUse: [
      "Enter the page title and meta description. Aim for roughly 60 characters of title and 155 of description before search results truncate them.",
      "Fill in the canonical and Open Graph image URLs if you have them — both must be absolute, and both are validated before anything is emitted.",
      "Generate, then paste the block inside your page's head. Every value is HTML-escaped, so an apostrophe or ampersand in the title cannot break out of its attribute.",
    ],
    limitations: [
      "Title and description are required; the other four fields are optional and their tags are omitted when left blank.",
      "No Twitter card tags, no viewport, and no charset are emitted — those belong to your template, not to this block.",
      "The keywords tag is ignored by every major search engine. It is generated for completeness only.",
      "Length is not enforced. Nothing warns you that a 300-character description will be truncated in results.",
      "Relative canonical and image URLs are rejected, because social crawlers cannot resolve them.",
    ],
    faq: [
      {
        q: "Do I still need the keywords tag?",
        a: "No. Google, Bing, and the rest have ignored it for over a decade. Leave it blank unless an internal search tool reads it.",
      },
      {
        q: "Why was my image URL rejected?",
        a: "It must be an absolute http or https URL. A path such as /og.png cannot be fetched by a crawler that has no page context.",
      },
      {
        q: "Where does this block go?",
        a: "Inside head, and only once per page. A second canonical or og:title tag makes the page ambiguous to crawlers.",
      },
    ],
    examples: [
      {
        label: "Product page",
        text: "Smart Tools",
        secondary: "Fast private utilities for everyday work.",
      },
    ],
  },
} as const satisfies ToolSpec;
