import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
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
  capabilities: { network: true },
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
