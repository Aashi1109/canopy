import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  messages: {
    "errors.targetRequired": "Enter a domain or HTTP(S) URL.",
    "errors.targetTooLong": "Domain or URL must be {limit, number} characters or fewer.",
    "errors.targetInvalid": "Enter a valid domain or HTTP(S) URL.",
    "errors.publicDomainRequired": "Enter a valid public domain.",
    "errors.upstreamUnreachable": "Domain Rating Checker could not reach Ahrefs. Try again.",
    "errors.upstreamRejected": "Ahrefs rejected the request. Check the API key configuration.",
    "errors.upstreamRateLimited": "Ahrefs rate limit reached. Try again later.",
    "errors.upstreamFailed": "Ahrefs lookup failed ({status}).",
    "errors.upstreamInvalid": "Ahrefs returned an invalid response.",
    "workspace.domain_rating_by_e9910f": "Domain Rating by Ahrefs",
    "workspace.license_c011d6": "License",
    "workspace.out_of_100_8a6be0": "out of 100",
    "workspace.backlink_strength_f1978c": "Backlink strength",
    "workspace.ahrefs_measures_the_1768cd":
      "Ahrefs measures the strength of links from other websites to this domain. Higher scores mean a stronger backlink profile.",
    "workspace.the_scale_is_e0ac57":
      "The scale is logarithmic: gaining points gets harder as the score rises. Compare similar websites; this score does not measure traffic or guarantee search rankings.",
    "workspace.note_from_ahrefs_eb9a4f": "Note from Ahrefs",
    "workspace.public_domain_8c3ff6": "Public domain",
    "workspace.cancel_19766e": "Cancel",
    "workspace.checking_domain_89c2b4": "Checking domain…",
    "workspace.domain_rating_a0f6a4": "Domain rating",
    "workspace.ratingSummary": "Domain rating summary",
    "workspace.enterDomain": "Enter a domain or HTTP(S) URL.",
    "workspace.checkRating": "Check domain rating",
  },
  toolId: "devtools.domain-rating-checker",
  app: "devtools",
  category: "seo-domain-tools",
  keywords: ["domain rating", "dr", "ahrefs", "backlinks", "authority", "seo", "domain"],
  name: "Domain Rating Checker",
  description: "Look up the Ahrefs Domain Rating (DR) for a domain.",
  layout: "stacked",
  input: {
    kind: "fields",
    label: "Domain",
    fields: [
      {
        channel: "text",
        label: "Public domain",
        placeholder: "example.com",
        required: true,
        multiline: false,
        maxLength: 2048,
      },
    ],
  },
  settings: { fields: {} },
  trigger: { mode: "manual", actionLabel: "Check domain rating" },
  capabilities: { network: true, copy: true, download: true },
  resultView: { default: "preview" },
  workbenchMark: { text: "DR" },
  labels: {
    empty: "Enter a public domain to look up its Ahrefs Domain Rating.",
    ready: "Ahrefs Domain Rating is ready.",
    running: "Looking up Domain Rating…",
  },
  content: {
    howToUse: [
      "Enter a public domain such as example.com. A full https:// URL works too — only its hostname is used.",
      "Run the check. The lookup happens on the server so the request is made once, from one place, with the configured credentials.",
      "Read the Domain Rating alongside the licence line. Ahrefs requires that attribution to be shown wherever the number is displayed.",
    ],
    limitations: [
      "This tool calls a third-party API (the Ahrefs free Domain Rating endpoint). The domain you enter is sent to Ahrefs, and the result, its availability, and its rate limits are entirely theirs.",
      "Only registrable public domains are accepted. IP addresses, localhost, single-label hostnames, and non-HTTP(S) schemes are rejected before any request is made.",
      "Paths, query strings, and credentials in a URL are ignored — the rating is per host, never per page.",
      "Domain Rating is Ahrefs' own metric on a 0–100 scale. It is not a Google signal and does not predict ranking on its own.",
    ],
    faq: [
      {
        q: "Why was my input rejected before anything was fetched?",
        a: "The domain has to be a valid public hostname: at most 253 characters, at least two labels, each label at most 63 characters of letters, digits and hyphens, and not an IP address. Anything else fails validation locally.",
      },
      {
        q: "Does a subdomain get its own rating?",
        a: "Ahrefs returns the rating for the host you send, so blog.example.com and example.com can differ.",
      },
      {
        q: "Why do I sometimes see a warning line?",
        a: "The free endpoint returns a warning field of its own — for example when the data is stale or approximate. It is passed through as Ahrefs sent it.",
      },
    ],
    examples: [{ label: "Check a well-known domain", text: "example.com" }],
  },
} as const satisfies ToolSpec;
