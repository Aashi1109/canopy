import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.open-graph-preview",
  app: "devtools",
  category: "developer-generators",
  keywords: ["open graph", "og tags", "social card", "preview", "meta tags", "twitter card", "link preview"],
  name: "Open Graph Preview",
  description: "Generate Open Graph tags and a sandboxable preview card.",
  layout: "stacked",
  input: {
    kind: "fields",
    label: "Title and description",
    fields: [
      {
        channel: "text",
        label: "Title",
        placeholder: "Smart Tools",
        required: true,
        maxLength: 200,
      },
      {
        channel: "secondary",
        label: "Description",
        placeholder: "Fast private utilities for everyday work.",
        required: true,
        maxLength: 400,
        multiline: true,
      },
    ],
  },
  settings: {
    fields: {
      url: {
        kind: "text",
        label: "URL",
        help: "The canonical address of the page. Must be absolute http or https.",
        default: "https://example.com/tools",
      },
      siteName: {
        kind: "text",
        label: "Site name",
        help: "Shown above the title on the card, in place of the bare domain.",
        default: "SmartTools",
      },
      image: {
        kind: "text",
        label: "Image URL",
        help: "Absolute http or https URL. Leave blank to preview the placeholder instead.",
        default: "",
      },
      platform: {
        kind: "select",
        label: "Platform",
        help: "Tags the mockup so you can compare how each network frames the same metadata.",
        default: "facebook",
        choices: [
          { label: "Facebook", value: "facebook" },
          { label: "LinkedIn", value: "linkedin" },
          { label: "X", value: "x" },
        ],
      },
      layout: {
        kind: "select",
        label: "Card layout",
        help: "Landscape is the wide unfurl; compact is the narrower in-feed form.",
        default: "landscape",
        choices: [
          { label: "Landscape", value: "landscape" },
          { label: "Compact", value: "compact" },
        ],
      },
      imageFit: {
        kind: "select",
        label: "Image fit",
        help: "Cover crops to fill the frame; contain letterboxes the whole image.",
        default: "cover",
        choices: [
          { label: "Cover", value: "cover" },
          { label: "Contain", value: "contain" },
        ],
      },
      safeAreaGuides: {
        kind: "toggle",
        label: "Safe area guides",
        help: "Overlay an inset guide for content that should survive cropping.",
        default: false,
      },
      showDestinationHost: {
        kind: "toggle",
        label: "Show destination host",
        help: "Show the destination hostname instead of the site name.",
        default: false,
      },
      showImageMetadata: {
        kind: "toggle",
        label: "Show image metadata",
        help: "Shows the entered image URL and notes that dimensions are not fetched.",
        default: false,
      },
    },
  },
  trigger: { mode: "live", debounceMs: 160 },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "OG", tone: "accent" },
  labels: {
    empty: "Provide a title and description to preview the social card.",
    ready: "The social card preview is ready.",
    running: "Rendering the social card preview…",
  },
  content: {
    howToUse: [
      "Enter the title and description exactly as they will appear in your page's meta tags — not a summary of them. Most networks truncate the title around 60 characters and the description around 155.",
      "Add the canonical URL and site name. Both must be absolute; a bare domain is rejected because crawlers cannot resolve a relative og:url.",
      "Point the image URL at an absolute image address. Leave it blank to see the layout with a placeholder while you decide on artwork.",
      "Switch layout and image fit to check that a wide image is not being cropped through the middle of your logo, then copy the generated tags out of the comment block at the bottom of the output.",
    ],
    limitations: [
      "This is a mockup rendered from what you typed. It does not fetch your page, so it cannot tell you whether the tags are actually deployed or whether a crawler can reach the image.",
      "Only the core og: tags are produced — title, description, url, site_name, and image. Twitter-specific tags, og:type, locale, and video tags are not generated.",
      "Every network styles its cards differently and changes them without notice, so treat the mockup as a proportion check rather than a pixel-accurate render.",
      "Cached previews are not cleared. After you change tags, a network will keep showing the old card until you re-scrape the URL with its own debugging tool.",
    ],
    faq: [
      {
        q: "What image size should I use?",
        a: "1200x630 is the safe landscape default. Keep important content away from the edges, because compact layouts crop it.",
      },
      {
        q: "Why does my card still show the old title after I fixed the tags?",
        a: "Networks cache aggressively. Use the platform's own sharing debugger to force a re-scrape of the URL.",
      },
      {
        q: "Can the image be a relative path?",
        a: "No. og:image must be an absolute URL that is reachable without a login, otherwise the crawler silently drops it.",
      },
      {
        q: "Are my title and description sent anywhere?",
        a: "No. The card is assembled locally in this tab and the values are HTML-escaped before they reach the preview.",
      },
    ],
    examples: [
      {
        label: "Product page card",
        text: "Smart Tools",
        secondary: "Fast private utilities for everyday work.",
      },
    ],
  },
} as const satisfies ToolSpec;
