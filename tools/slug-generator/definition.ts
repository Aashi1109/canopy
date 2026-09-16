import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  toolId: "devtools.slug-generator",
  app: "devtools",
  category: "text-tools",
  keywords: ["slug", "url", "permalink", "seo", "kebab case", "handle", "sanitize"],
  name: "Slug Generator",
  description: "Create lowercase URL-safe slugs.",
  layout: "stacked",
  input: {
    kind: "text",
    label: "Titles to slugify",
    placeholder: "Hello, Smart Tools!\nCafé Menu 2026",
  },
  settings: { fields: {} },
  trigger: { mode: "manual", actionLabel: "Generate slugs" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "SLG" },
  labels: {
    empty: "Enter one or more titles to create URL-safe slugs.",
    ready: "URL-safe slugs are ready.",
    running: "Generating slugs…",
  },
  content: {
    howToUse: [
      "Paste a title, or one title per line to slugify a whole batch at once.",
      "Generate. Each line becomes lowercase words joined with hyphens; punctuation is dropped and accents are stripped to their base letters.",
      "Lines that contain no letters or digits produce nothing and are removed, so the output can have fewer lines than the input.",
      "Check the result against your existing URLs before publishing — a slug is part of a permalink and changing it later costs you the link.",
    ],
    limitations: [
      "Accents are removed rather than transliterated: `café` becomes `cafe`. Non-Latin scripts are kept as-is, which is valid in a modern URL but will be percent-encoded by browsers.",
      "There is no de-duplication or length cap. Two identical titles produce two identical slugs, and a long title produces a long slug.",
      "camelCase is split at the case boundary, so `smartTools` becomes `smart-tools`.",
      "Stop words (`a`, `the`, `of`) are kept. Remove them yourself if your convention drops them.",
    ],
    faq: [
      {
        q: "Can I slugify a whole list at once?",
        a: "Yes. One title per line in, one slug per line out.",
      },
      {
        q: "Why did a line disappear?",
        a: "It contained no letters or digits — a line of punctuation or a blank line has no slug, so it is dropped.",
      },
      {
        q: "Are numbers kept?",
        a: "Yes. `Top 10 Tools` becomes `top-10-tools`.",
      },
    ],
    examples: [
      { label: "Title with punctuation", text: "Hello, Smart Tools!" },
      { label: "Several titles", text: "Café Menu 2026\nThe Best of Ada" },
    ],
  },
} as const satisfies ToolSpec;
