import type { ToolSpec } from "../../lib/tool-framework/spec";

/**
 * `slug` is declared because `slugFromName("Domain Age & WHOIS Checker")` is
 * `domain-age-and-whois-checker`, which does not match the folder name. The
 * folder name is the live indexed URL and must not move.
 */
export default {
  toolId: "devtools.domain-age-checker",
  slug: "domain-age-checker",
  app: "devtools",
  category: "seo-domain-tools",
  keywords: ["domain age", "whois", "rdap", "registration", "expiry", "registrar", "nameserver", "domain"],
  name: "Domain Age & WHOIS Checker",
  description: "Query public RDAP data for domain registration details.",
  layout: "stacked",
  input: {
    kind: "fields",
    label: "Domain",
    fields: [
      {
        channel: "text",
        label: "Domain name",
        placeholder: "example.com",
        required: true,
        multiline: false,
        maxLength: 253,
      },
    ],
  },
  settings: {
    fields: {
      showRegistrationDate: {
        kind: "toggle",
        label: "Show registration date",
        help: "Includes the registry's creation date in the result.",
        default: true,
      },
      showExpiryDate: {
        kind: "toggle",
        label: "Show expiry date",
        help: "Includes the registry's renewal deadline in the result.",
        default: true,
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Check domain age" },
  capabilities: { network: true },
  workbenchMark: { text: "AGE" },
  labels: {
    empty: "Enter a public domain to look up its RDAP registration record.",
    ready: "RDAP registration record is ready.",
    running: "Looking up domain registration…",
  },
  content: {
    howToUse: [
      "Enter a domain. A full URL works too — the hostname is extracted, lowercased, and a leading www. is dropped before the query.",
      "Run the check. The domain is looked up against the public RDAP bootstrap service, which forwards it to the registry responsible for that TLD.",
      "Read the returned JSON: enabled date fields come straight from the registry, alongside its status codes and delegated nameservers.",
      "Compare enabled date fields against the age and renewal timing you expected — a lapsed expiry is the usual cause of a domain going dark.",
    ],
    limitations: [
      "This calls a third-party service — the public RDAP bootstrap at rdap.org, which routes the lookup on to the registry for the domain's TLD. The domain you enter is sent to them, and availability, accuracy, and rate limits are theirs, not ours.",
      "RDAP coverage is not universal. Many ccTLDs publish no RDAP endpoint at all, and a lookup for one of those fails rather than falling back to legacy WHOIS.",
      "Registries redact contact details under privacy rules, so registrant names, emails, and phone numbers are usually absent. Dates, status codes, and nameservers are the reliable fields.",
      "Dates are reported exactly as the registry publishes them, including its own timezone convention. A registry that never populated an event simply returns nothing for it.",
      "Each lookup times out after ten seconds. A slow or unreachable service reports a failure rather than hanging.",
    ],
    faq: [
      {
        q: "Why did my .co.uk (or other ccTLD) lookup fail?",
        a: "That registry likely publishes no RDAP endpoint. RDAP is mandatory for gTLDs such as .com and .net but optional for country-code TLDs, and this tool does not fall back to legacy WHOIS.",
      },
      {
        q: "Where are the registrant name and email?",
        a: "Redacted by the registry. Since GDPR, contact data is withheld from public RDAP responses for most domains, so the useful fields here are the dates, the status codes, and the nameservers.",
      },
      {
        q: "What does a status like clientTransferProhibited mean?",
        a: "It is a registry status code, usually a lock set by the registrar to prevent unauthorized transfers. It is normal on an active domain and is not an error.",
      },
      {
        q: "The registration date looks newer than I expected — was the domain re-registered?",
        a: "Possibly. A domain that expired and was dropped gets a fresh registration date when someone else picks it up, so the date reflects the current registration, not the first one ever made.",
      },
    ],
    examples: [{ label: "Public domain", text: "example.com" }],
  },
} as const satisfies ToolSpec;
