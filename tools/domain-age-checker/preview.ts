import { isRecord } from "../../lib/devtools/shared/json.ts";

export type DomainSummary = {
  domain: string;
  age: string;
  ageDetail: string;
  dates: readonly { label: string; value: string; detail?: string }[];
  statuses: readonly { label: string; detail: string }[];
  nameservers: readonly string[];
};

const DAY_MS = 86_400_000;
const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
  hourCycle: "h23",
});

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  // Registry dates include a timezone. Reject ambiguous or normalized invalid dates.
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/i.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, , offsetHour = "0", offsetMinute = "0"] = match;
  const leapYear = Number(year) % 4 === 0 && (Number(year) % 100 !== 0 || Number(year) % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    Number(month) < 1 ||
    Number(month) > 12 ||
    Number(day) < 1 ||
    Number(day) > daysInMonth[Number(month) - 1] ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59 ||
    Number(offsetHour) > 23 ||
    Number(offsetMinute) > 59
  )
    return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatAge(registered: Date, now: number): string {
  const currentYear = new Date(now).getUTCFullYear();
  let years = currentYear - registered.getUTCFullYear();
  const anniversary = new Date(registered);
  anniversary.setUTCFullYear(currentYear);
  // February 29 anniversaries fall on February 28 in non-leap years.
  if (anniversary.getUTCMonth() !== registered.getUTCMonth()) anniversary.setUTCDate(0);
  if (anniversary.getTime() > now) {
    years -= 1;
    anniversary.setUTCFullYear(currentYear - 1, registered.getUTCMonth(), registered.getUTCDate());
    if (anniversary.getUTCMonth() !== registered.getUTCMonth()) anniversary.setUTCDate(0);
  }
  const days = Math.floor((now - anniversary.getTime()) / DAY_MS);
  const parts = [
    years > 0 ? `${years} year${years === 1 ? "" : "s"}` : "",
    days > 0 ? `${days} day${days === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return parts.length ? `${parts.join(", ")} old` : "Less than a day old";
}

const STATUS_EXPLANATIONS: Record<string, DomainSummary["statuses"][number]> = {
  ok: {
    label: "No restrictions reported",
    detail:
      "The registry reports no pending operations or restrictions. This does not confirm that the website is working.",
  },
  active: {
    label: "No restrictions reported",
    detail:
      "The registry reports no pending operations or restrictions. This does not confirm that the website is working.",
  },
  inactive: {
    label: "Not connected to DNS",
    detail:
      "No name servers are linked to this registration. The domain is not set up to direct visitors to a website.",
  },
  redemptionperiod: {
    label: "Recovery period",
    detail:
      "The registration was deleted and may still be recoverable. Contact the registrar promptly about restoring it.",
  },
  pendingdelete: {
    label: "Deletion requested",
    detail: "The registry reports a deletion process. Contact the registrar promptly to check recovery options.",
  },
  pendingrestore: {
    label: "Restoration pending",
    detail:
      "A request to restore the domain is being processed. Contact the registrar to check whether more information is needed.",
  },
  pendingcreate: {
    label: "Registration pending",
    detail: "The registry is processing a request to register this domain.",
  },
  pendingrenew: { label: "Renewal pending", detail: "The registry is processing a renewal request." },
  pendingtransfer: {
    label: "Transfer pending",
    detail: "A request to move the domain to another registrar is being processed.",
  },
  pendingupdate: { label: "Changes pending", detail: "The registry is processing changes to this registration." },
  addperiod: {
    label: "Registration grace period",
    detail: "The domain is in a short grace period after registration. Contact the registrar for the applicable terms.",
  },
  autorenewperiod: {
    label: "Automatic renewal grace period",
    detail:
      "The registry automatically renewed the domain and a grace period applies. Confirm renewal and billing with the registrar.",
  },
  renewperiod: {
    label: "Renewal grace period",
    detail: "The domain is in a grace period after renewal. Contact the registrar for the applicable terms.",
  },
  transferperiod: {
    label: "Transfer grace period",
    detail: "The domain is in a grace period after moving to another registrar.",
  },
};

function explainStatus(status: string): DomainSummary["statuses"][number] {
  const key = status.toLowerCase().replace(/[\s_-]/g, "");
  if (Object.hasOwn(STATUS_EXPLANATIONS, key)) return STATUS_EXPLANATIONS[key];
  const restriction = /^(client|server)(transfer|delete|update|renew)prohibited$/.exec(key);
  if (restriction) {
    const owner = restriction[1] === "client" ? "registrar" : "registry";
    const operation = restriction[2];
    const labels: Record<string, string> = {
      transfer: "Transfer locked",
      delete: "Deletion locked",
      update: "Changes locked",
      renew: "Renewal blocked",
    };
    const actions: Record<string, string> = {
      transfer: "moving this domain to another registrar",
      delete: "deleting this registration",
      update: "changing this registration",
      renew: "renewing this registration",
    };
    return {
      label: labels[operation],
      detail: `The ${owner} has blocked ${actions[operation]}. Contact your registrar if you need to do this.`,
    };
  }
  if (key === "clienthold" || key === "serverhold") {
    return {
      label: "DNS suspended",
      detail:
        "The domain is on hold and will not resolve through DNS, the system that connects domain names to websites. Contact the registrar for help.",
    };
  }
  const readable = status
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
  return {
    label: readable.charAt(0).toUpperCase() + readable.slice(1),
    detail:
      "The registry reported an additional status. Ask the registrar what it means; its exact value is available in Raw.",
  };
}

export function createDomainSummary(rawJson: string, now = Date.now()): DomainSummary {
  let record: Record<string, unknown> = {};
  let readableRecord = false;
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (isRecord(parsed)) {
      record = parsed;
      readableRecord = true;
    }
  } catch {
    /* The preview can still explain an unreadable record. */
  }
  if (!Number.isFinite(new Date(now).getTime())) now = Date.now();

  const registered = parseDate(record.registered);
  let age = "Age unavailable";
  let ageDetail = "The registry did not provide a usable registration date.";
  if (!readableRecord) ageDetail = "The registration record could not be read. Try the lookup again.";
  else if (!Object.hasOwn(record, "registered"))
    ageDetail = "The registration date is hidden. Turn on Show registration date to see the domain age.";
  else if (registered && registered.getTime() > now)
    ageDetail = "The registry reports a registration date in the future. Check the record with the registrar.";
  else if (registered) {
    age = formatAge(registered, now);
    ageDetail = `Based on the current registration as of ${DATE_FORMAT.format(now)} UTC. A domain's age can reset if it is deleted and registered again.`;
  }

  const dates: DomainSummary["dates"][number][] = [];
  for (const [key, label] of [
    ["registered", "Registered"],
    ["expires", "Reported expiry"],
    ["updated", "Last record update"],
  ] as const) {
    if (!Object.hasOwn(record, key)) continue;
    const date = parseDate(record[key]);
    const value = date
      ? `${DATE_FORMAT.format(date)} UTC`
      : record[key] == null || record[key] === ""
        ? "Not reported"
        : "Date unavailable";
    let detail: string | undefined;
    if (date && key === "expires") {
      const remainingDays = Math.floor((date.getTime() - now) / DAY_MS);
      detail =
        date.getTime() <= now
          ? "The reported expiry date has passed. Check renewal or recovery with the registrar; this does not mean the domain is available."
          : remainingDays === 0
            ? "The reported expiry is within the next 24 hours. Confirm the renewal deadline with your registrar."
            : `${remainingDays} complete day${remainingDays === 1 ? "" : "s"} until the reported expiry. Confirm the renewal deadline with your registrar.`;
    }
    dates.push({ label, value, ...(detail ? { detail } : {}) });
  }

  const statusValues = Array.isArray(record.status)
    ? record.status
        .filter((status): status is string => typeof status === "string" && Boolean(status.trim()))
        .map((status) => status.trim())
    : [];
  const uniqueStatuses = [
    ...new Map(statusValues.map((status) => [status.toLowerCase().replace(/[\s_-]/g, ""), status])).values(),
  ];
  const statuses = uniqueStatuses.length
    ? uniqueStatuses.map(explainStatus)
    : [{ label: "Not reported", detail: "The registry did not provide domain status information." }];
  const nameservers = Array.isArray(record.nameservers)
    ? [
        ...new Set(
          record.nameservers
            .filter((name): name is string => typeof name === "string" && Boolean(name.trim()))
            .map((name) => name.trim()),
        ),
      ]
    : [];

  return {
    domain: typeof record.domain === "string" && record.domain.trim() ? record.domain.trim() : "Domain not reported",
    age,
    ageDetail,
    dates,
    statuses,
    nameservers,
  };
}
