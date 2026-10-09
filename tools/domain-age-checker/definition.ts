import { INPUT_EXECUTION_MESSAGES, URL_EXECUTION_MESSAGES } from "../../lib/devtools/shared/execution-messages.ts";
import type { ToolSpec } from "../../lib/tool-framework/spec";

/**
 * `slug` is declared because `slugFromName("Domain Age & WHOIS Checker")` is
 * `domain-age-and-whois-checker`, which does not match the folder name. The
 * folder name is the live indexed URL and must not move.
 */
export default {
  messages: {
    ...INPUT_EXECUTION_MESSAGES,
    ...URL_EXECUTION_MESSAGES,
    "errors.input-required": "Domain is required.",
    "errors.invalid-domain": "Enter a valid domain name.",
    "errors.rdapUnreachable": "Domain Age Checker could not reach the public RDAP service.",
    "errors.lookupFailed": "RDAP lookup failed ({status}).",
    "errors.rdapInvalidResponse": "RDAP service returned an invalid response.",
    "errors.enterValue": "Enter a value and try again.",
    "errors.checkNetwork": "Check your network connection and try again.",
    "errors.trySupportedTld": "Many country-code TLDs publish no RDAP endpoint. Try a gTLD such as .com.",
    "workspace.current_registration_age_ce0c0e": "Current registration age: ",
    "workspace.registration_status_3aa459": "Registration status",
    "workspace.nameservers_08c8bf": "Nameservers",
    "workspace.these_servers_tell_390067":
      "These servers tell browsers and email services where to send traffic for this domain.",
    "workspace.not_reported_by_fd7afc": "Not reported by the registry.",
    "workspace.this_record_describes_74f5c9":
      "This record describes domain registration. It does not confirm whether the website is online. Raw contains the original technical details.",
    "workspace.domain_name_421b1e": "Domain name",
    "workspace.cancel_19766e": "Cancel",
    "workspace.checking_domain_89c2b4": "Checking domain…",
    "workspace.domain_registration_3a4fce": "Domain registration",
    "workspace.settings_02f6ea": "SETTINGS",
    "workspace.registrationSummary": "Domain registration summary",
    "workspace.invalidDomain": "Enter a valid domain name.",
    "workspace.domainRequired": "Domain is required.",
    "workspace.checkAge": "Check domain age",
    "workspace.summary.ageYearsDays":
      "{years, plural, one {# year} other {# years}}, {days, plural, one {# day} other {# days}} old",
    "workspace.summary.ageYears": "{years, plural, one {# year old} other {# years old}}",
    "workspace.summary.ageDays": "{days, plural, one {# day old} other {# days old}}",
    "workspace.summary.ageUnderDay": "Less than a day old",
    "workspace.summary.status1": "No restrictions reported",
    "workspace.summary.status2":
      "The registry reports no pending operations or restrictions. This does not confirm that the website is working.",
    "workspace.summary.status3": "Not connected to DNS",
    "workspace.summary.status4":
      "No name servers are linked to this registration. The domain is not set up to direct visitors to a website.",
    "workspace.summary.status5": "Recovery period",
    "workspace.summary.status6":
      "The registration was deleted and may still be recoverable. Contact the registrar promptly about restoring it.",
    "workspace.summary.status7": "Deletion requested",
    "workspace.summary.status8":
      "The registry reports a deletion process. Contact the registrar promptly to check recovery options.",
    "workspace.summary.status9": "Restoration pending",
    "workspace.summary.status10":
      "A request to restore the domain is being processed. Contact the registrar to check whether more information is needed.",
    "workspace.summary.status11": "Registration pending",
    "workspace.summary.status12": "The registry is processing a request to register this domain.",
    "workspace.summary.status13": "Renewal pending",
    "workspace.summary.status14": "The registry is processing a renewal request.",
    "workspace.summary.status15": "Transfer pending",
    "workspace.summary.status16": "A request to move the domain to another registrar is being processed.",
    "workspace.summary.status17": "Changes pending",
    "workspace.summary.status18": "The registry is processing changes to this registration.",
    "workspace.summary.status19": "Registration grace period",
    "workspace.summary.status20":
      "The domain is in a short grace period after registration. Contact the registrar for the applicable terms.",
    "workspace.summary.status21": "Automatic renewal grace period",
    "workspace.summary.status22":
      "The registry automatically renewed the domain and a grace period applies. Confirm renewal and billing with the registrar.",
    "workspace.summary.status23": "Renewal grace period",
    "workspace.summary.status24":
      "The domain is in a grace period after renewal. Contact the registrar for the applicable terms.",
    "workspace.summary.status25": "Transfer grace period",
    "workspace.summary.status26": "The domain is in a grace period after moving to another registrar.",
    "workspace.summary.locked.transfer": "Transfer locked",
    "workspace.summary.locked.delete": "Deletion locked",
    "workspace.summary.locked.update": "Changes locked",
    "workspace.summary.locked.renew": "Renewal blocked",
    "workspace.summary.restriction.registrar.transfer":
      "The registrar has blocked moving this domain to another registrar. Contact your registrar if you need to do this.",
    "workspace.summary.restriction.registrar.delete":
      "The registrar has blocked deleting this registration. Contact your registrar if you need to do this.",
    "workspace.summary.restriction.registrar.update":
      "The registrar has blocked changing this registration. Contact your registrar if you need to do this.",
    "workspace.summary.restriction.registrar.renew":
      "The registrar has blocked renewing this registration. Contact your registrar if you need to do this.",
    "workspace.summary.restriction.registry.transfer":
      "The registry has blocked moving this domain to another registrar. Contact your registrar if you need to do this.",
    "workspace.summary.restriction.registry.delete":
      "The registry has blocked deleting this registration. Contact your registrar if you need to do this.",
    "workspace.summary.restriction.registry.update":
      "The registry has blocked changing this registration. Contact your registrar if you need to do this.",
    "workspace.summary.restriction.registry.renew":
      "The registry has blocked renewing this registration. Contact your registrar if you need to do this.",
    "workspace.summary.dnsSuspended": "DNS suspended",
    "workspace.summary.dnsSuspendedDetail":
      "The domain is on hold and will not resolve through DNS, the system that connects domain names to websites. Contact the registrar for help.",
    "workspace.summary.additionalStatus":
      "The registry reported an additional status. Ask the registrar what it means; its exact value is available in Raw.",
    "workspace.summary.ageUnavailable": "Age unavailable",
    "workspace.summary.ageUnreported": "The registry did not provide a usable registration date.",
    "workspace.summary.unreadable": "The registration record could not be read. Try the lookup again.",
    "workspace.summary.hiddenDate":
      "The registration date is hidden. Turn on Show registration date to see the domain age.",
    "workspace.summary.futureDate":
      "The registry reports a registration date in the future. Check the record with the registrar.",
    "workspace.summary.registered": "Registered",
    "workspace.summary.expires": "Reported expiry",
    "workspace.summary.updated": "Last record update",
    "workspace.summary.notReported": "Not reported",
    "workspace.summary.dateUnavailable": "Date unavailable",
    "workspace.summary.expired":
      "The reported expiry date has passed. Check renewal or recovery with the registrar; this does not mean the domain is available.",
    "workspace.summary.expiresSoon":
      "The reported expiry is within the next 24 hours. Confirm the renewal deadline with your registrar.",
    "workspace.summary.noStatus": "The registry did not provide domain status information.",
    "workspace.summary.noDomain": "Domain not reported",
    "workspace.summary.ageBasis":
      "Based on the current registration as of {date} UTC. A domain''s age can reset if it is deleted and registered again.",
    "workspace.summary.daysUntilExpiry":
      "{days, plural, one {# complete day} other {# complete days}} until the reported expiry. Confirm the renewal deadline with your registrar.",
    "workspace.registrationAge": "Current registration age: {value}",
  },
  toolId: "devtools.domain-age-checker",
  slug: "domain-age-checker",
  app: "devtools",
  category: "seo-domain-tools",
  keywords: ["domain age", "whois", "rdap", "registration", "expiry", "registrar", "nameserver", "domain"],
  name: "Domain Age & WHOIS Checker",
  description: "Query public RDAP data for domain registration details.",
  layout: "stacked",
  outputLanguage: "json",
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
  capabilities: { network: true, copy: true, download: true },
  workbenchMark: { text: "AGE" },
  labels: {
    empty: "Enter a domain to see when it was registered and when it expires.",
    ready: "Domain registration details are ready.",
    running: "Looking up domain registration…",
  },
  content: {
    howToUse: [
      "Enter a domain. A full URL works too — the hostname is extracted, lowercased, and a leading www. is dropped before the query.",
      "Run the check. The domain is looked up against the public RDAP bootstrap service, which forwards it to the registry responsible for that TLD.",
      "Read the Preview for the domain's current registration age, dates, status explanations, and nameservers. Switch to Raw for the exact JSON record.",
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
