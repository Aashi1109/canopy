import type { ToolSpec } from "../../lib/tool-framework/spec";

/**
 * A pure generator: every value comes from `settings`, so `input.fields` is
 * empty and `run` reads no input channel. That mirrors the pre-migration
 * `generatorTool` shape exactly.
 */
export default {
  toolId: "devtools.utm-builder",
  app: "devtools",
  category: "jwt-api-tools",
  keywords: ["utm", "campaign", "url builder", "analytics", "tracking", "google analytics", "marketing"],
  name: "UTM Builder",
  description: "Build a URL with UTM campaign parameters.",
  input: { kind: "none" },
  settings: {
    fields: {
      url: {
        kind: "text",
        label: "Destination URL",
        help: "Must be an absolute http or https URL. Any existing query string is kept unless you replace it below.",
        default: "https://example.com",
        pane: "main",
        span: "full",
      },
      source: {
        kind: "text",
        label: "Campaign source",
        help: "Where the traffic comes from: newsletter, google, partner-site.",
        default: "newsletter",
        pane: "main",
      },
      medium: {
        kind: "text",
        label: "Campaign medium",
        help: "How it arrives: email, cpc, social, referral.",
        default: "email",
        pane: "main",
      },
      campaign: {
        kind: "text",
        label: "Campaign name",
        help: "The promotion this link belongs to.",
        default: "launch",
        pane: "main",
      },
      term: {
        kind: "text",
        label: "Campaign term",
        help: "Paid-search keyword. Left out of the URL when blank.",
        default: "",
      },
      content: {
        kind: "text",
        label: "Campaign content",
        help: "Distinguishes two links to the same destination in one message. Left out of the URL when blank.",
        default: "",
        pane: "main",
      },
      normalization: {
        kind: "select",
        label: "Value normalization",
        help: "Analytics tools treat Email and email as different campaigns. Lowercasing avoids splitting a report in two.",
        default: "preserve",
        choices: [
          { label: "Preserve entered case", value: "preserve" },
          { label: "Lowercase values", value: "lowercase" },
        ],
      },
      existingQuery: {
        kind: "select",
        label: "Existing query parameters",
        help: "What to do with a query string already on the destination URL.",
        default: "merge",
        choices: [
          { label: "Keep and merge", value: "merge" },
          { label: "Replace existing query", value: "replace" },
        ],
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Build campaign URL" },
  capabilities: { copy: true, download: true },
  workbenchMark: { text: "UTM", tone: "accent" },
  labels: {
    empty: "Complete the destination and required campaign fields.",
    ready: "Campaign URL is ready.",
    running: "Building campaign URL…",
  },
  content: {
    howToUse: [
      "Paste the destination URL with its scheme. A bare domain is rejected — analytics links must be absolute.",
      "Fill in source, medium, and campaign. All three are required; the build fails rather than emitting a half-tagged link that reports as direct traffic.",
      "Add term or content only if you need them. Blank fields are omitted from the URL instead of being written as empty parameters.",
      "Choose lowercase normalization if your reports are being split by capitalisation, then build and copy the tagged URL.",
    ],
    limitations: [
      "Only the five standard UTM parameters are supported. Vendor-specific tags such as gclid or mc_cid must be added by hand.",
      "Values are URL-encoded but not otherwise validated — a typo in a source name produces a valid URL that reports under the wrong name.",
      "Trailing and leading whitespace is trimmed from each value; internal spaces are preserved and percent-encoded.",
      "The tool does not shorten the URL, check that the destination resolves, or verify that your analytics property is receiving the parameters.",
    ],
    faq: [
      {
        q: "What happens to a query string already on the URL?",
        a: "By default it is kept and the UTM parameters are merged in. Switch to Replace existing query to drop it first.",
      },
      {
        q: "Why are source, medium, and campaign mandatory?",
        a: "Most analytics tools discard a partially tagged link and attribute the visit to direct traffic, which is worse than no tag at all.",
      },
      {
        q: "Should I lowercase my values?",
        a: "Yes, if more than one person builds links. Analytics tools are case-sensitive, so Email and email become two separate rows in the same report.",
      },
      {
        q: "Does a UTM-tagged link expose anything private?",
        a: "The parameters are visible in the address bar and in any referrer header, so never put a customer name, email address, or token in one.",
      },
    ],
    examples: [
      {
        label: "Paid social launch",
        text: "",
        settings: {
          url: "https://acme.example/pricing?ref=homepage",
          source: "linkedin",
          medium: "paid_social",
          campaign: "spring_launch",
          content: "hero_cta",
          normalization: "lowercase",
          existingQuery: "merge",
        },
      },
    ],
  },
} as const satisfies ToolSpec;
