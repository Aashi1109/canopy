import type { ToolSpec } from "../../lib/tool-framework/spec";

/**
 * Values stay in the existing settings contract for saved-link compatibility.
 * The tool workspace presents campaign values as direct inputs and leaves
 * only processing preferences in the settings panel.
 */
export default {
  toolId: "devtools.utm-builder",
  sharing: { version: 1 },
  app: "devtools",
  category: "jwt-api-tools",
  keywords: ["utm", "campaign", "url builder", "analytics", "tracking", "google analytics", "marketing"],
  name: "UTM Builder",
  description: "Build a URL with UTM campaign parameters.",
  layout: "side-by-side",
  inputSize: { default: 55, min: 35 },
  input: { kind: "none" },
  settings: {
    fields: {
      url: {
        kind: "text",
        label: "Destination URL",
        help: "Must be an absolute http or https URL. Any existing query string is kept unless you replace it below.",
        default: "https://example.com",
        pane: "input",
        span: "full",
      },
      source: {
        kind: "text",
        label: "Campaign source",
        help: "Referrer, e.g. google or newsletter.",
        default: "newsletter",
        pane: "input",
      },
      medium: {
        kind: "text",
        label: "Campaign medium",
        help: "Channel, e.g. email, social, or cpc.",
        default: "email",
        pane: "input",
      },
      campaign: {
        kind: "text",
        label: "Campaign name",
        placeholder: "e.g. spring_launch",
        default: "launch",
        pane: "input",
        span: "full",
      },
      term: {
        kind: "text",
        label: "Campaign term (optional)",
        placeholder: "Paid-search keyword",
        default: "",
        pane: "input",
      },
      content: {
        kind: "text",
        label: "Campaign content (optional)",
        placeholder: "Link or creative, e.g. hero_cta",
        default: "",
        pane: "input",
      },
      parameters: {
        kind: "rows",
        label: "Additional parameters",
        help: "Use full keys, e.g. utm_id or utm_source_platform.",
        default: [],
        keyLabel: "Parameter key",
        valueLabel: "Parameter value",
        pane: "input",
        span: "full",
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
      "Use Add parameter for extra UTM or custom tracking keys. Enter the full key and value; remove any row you no longer need.",
      "Choose lowercase normalization if your reports are being split by capitalisation, then build and copy the tagged URL.",
    ],
    limitations: [
      "Additional parameters are included in the URL, but your analytics platform determines which keys appear in reports.",
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
