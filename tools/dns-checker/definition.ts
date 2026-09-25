import type { ToolSpec } from "../../lib/tool-framework/spec";

export const DNS_RECORD_TYPES = ["A", "AAAA", "MX", "TXT", "NS", "CNAME"] as const;

/**
 * `slug` is declared because `slugFromName("DNS & Email Records Checker")` is
 * `dns-and-email-records-checker`, which does not match the folder name. The
 * folder name is the live indexed URL and must not move.
 */
export default {
  toolId: "devtools.dns-checker",
  slug: "dns-checker",
  app: "devtools",
  category: "seo-domain-tools",
  keywords: ["dns", "mx", "txt", "spf", "nameserver", "cname", "lookup", "dig"],
  name: "DNS & Email Records Checker",
  description: "Query public DNS-over-HTTPS records.",
  layout: "side-by-side",
  resultView: { default: "preview", previewLabel: "Preview" },
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
      types: {
        kind: "text",
        label: "Record types",
        help: "Select one or more record types to look up.",
        default: DNS_RECORD_TYPES.join(","),
        pane: "input",
      },
      recordView: {
        kind: "select",
        label: "Raw output format",
        help: "Choose what Raw, Copy, and Download contain. Preview always shows readable records.",
        default: "records",
        choices: [
          { label: "Records (tab-separated)", value: "records" },
          { label: "Resolver response (JSON)", value: "raw" },
        ],
      },
      recursive: {
        kind: "toggle",
        label: "Use recursive lookup",
        help: "On by default. Turning it off asks the resolver to answer only from its own cache.",
        default: true,
      },
      includeTtl: {
        kind: "toggle",
        label: "Include TTL",
        help: "Shows each record's remaining cache lifetime in seconds.",
        default: true,
      },
      checkDnssec: {
        kind: "toggle",
        label: "Check DNSSEC",
        help: "Asks the resolver to validate signatures rather than returning unverified data.",
        default: false,
      },
    },
  },
  trigger: { mode: "manual", actionLabel: "Check DNS" },
  capabilities: { copy: true, download: true, network: true },
  workbenchMark: { text: "DNS" },
  labels: {
    result: "DNS records",
    empty: "Enter a public domain to look up its DNS records.",
    ready: "DNS lookup results are ready.",
    running: "Looking up public DNS records…",
  },
  content: {
    howToUse: [
      "Enter a domain. A full URL works too — the hostname is extracted, lowercased, and a leading www. is dropped before the query.",
      "Choose the record types you care about: A and AAAA for where the site points, MX and TXT for mail delivery and SPF/DKIM/DMARC, NS for delegation, CNAME for aliases.",
      "Click Check DNS or press Enter in the domain field. Selected types are queried in parallel, and each answer returns its type, TTL, and value.",
      "Read the Preview for labeled records and lookup status. Use Raw for exact output, and choose Resolver response (JSON) in settings to inspect the resolver's full response.",
    ],
    limitations: [
      "Queries go to a public DNS-over-HTTPS resolver, so you see what that resolver sees. Split-horizon DNS, internal zones, and freshly changed records may differ from your own view.",
      "Only A, AAAA, MX, TXT, NS, and CNAME are permitted. Any other type is rejected rather than forwarded — the domain you type drives an outbound request, so the query surface is deliberately fixed.",
      "TTL is the resolver's remaining cache time, not the value published in your zone file. A low TTL here often just means the record was queried recently.",
      "Each lookup times out after ten seconds. A slow or unreachable resolver reports a failure rather than hanging.",
      "The DNSSEC option asks the resolver to validate; it does not perform independent chain-of-trust verification in your browser.",
    ],
    faq: [
      {
        q: "Why do the results differ from `dig` on my machine?",
        a: "Your local resolver, your ISP, and the public resolver used here can all hold different cached copies. Right after a change, a difference between them is normal and resolves as TTLs expire.",
      },
      {
        q: "How do I check my SPF or DMARC record?",
        a: "Query TXT. SPF appears as a value starting with v=spf1 on the domain itself; DMARC lives on the _dmarc subdomain, so query that name directly.",
      },
      {
        q: "My MX lookup is empty — is mail broken?",
        a: "Not necessarily. Check the parent domain: mail for a subdomain is usually delivered via the parent's MX records.",
      },
      {
        q: "Does the domain I type get logged?",
        a: "The lookup is a request to a public DNS resolver, which sees the queried name like any DNS query does. Nothing is stored by this tool.",
      },
    ],
    examples: [{ label: "Public domain", text: "example.com" }],
  },
} as const satisfies ToolSpec;
