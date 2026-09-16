/**
 * Moved verbatim from the `domain-age-checker` case in
 * `lib/devtools/format-json.ts`: the same `normalizeDomain`, the same RDAP
 * bootstrap endpoint with the same `encodeURIComponent` on the path segment,
 * the same accept header, the same ten-second timeout, the same event lookups,
 * and the same JSON output shape and key order.
 *
 * `run.ts`, not `run.server.ts`: this is a plain `fetch` to a public RDAP
 * service with no credential, no secret, and no `node:` API. It runs in the
 * browser today and keeping it there preserves the property that the user's
 * queried domain never passes through our servers.
 *
 * The domain is user-supplied and drives an outbound request, so the guard that
 * bounds it — `normalizeDomain`, which rejects anything that is not a
 * dot-bearing `[a-z0-9.-]` hostname — is carried over unchanged and must not be
 * widened. The normalized hostname is the only thing interpolated into the URL,
 * and it is percent-encoded on the way in.
 */

import { isRecord } from "../../lib/devtools/shared/json.ts";
import { normalizeDomain } from "../../lib/devtools/shared/url.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import { ToolError, type ToolRun } from "../../lib/tool-framework/run.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

const LOOKUP_TIMEOUT_MS = 10_000;

export const run: ToolRun<Settings> = async (ctx): Promise<ToolResult> => {
  const domain = normalizeDomain(ctx.input.text);

  let response: Response;
  try {
    response = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { accept: "application/rdap+json, application/json" },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
  } catch {
    throw new ToolError(
      "rdap-unreachable",
      "Domain Age Checker could not reach the public RDAP service.",
      "Check your network connection and try again.",
    );
  }
  if (!response.ok) {
    throw new ToolError(
      "lookup-failed",
      `RDAP lookup failed (${response.status}).`,
      "Many country-code TLDs publish no RDAP endpoint. Try a gTLD such as .com.",
    );
  }
  const data: unknown = await response.json();
  if (!isRecord(data)) {
    throw new ToolError("rdap-invalid-response", "RDAP service returned an invalid response.");
  }
  ctx.signal.throwIfAborted();

  const events = Array.isArray(data.events) ? data.events.filter(isRecord) : [];
  const event = (action: string): unknown =>
    events.find((candidate) => candidate.eventAction === action)?.eventDate ?? null;

  return {
    render: "text",
    text: JSON.stringify(
      {
        domain: data.ldhName ?? domain,
        ...((ctx.settings.showRegistrationDate ?? true)
          ? { registered: event("registration") }
          : {}),
        ...((ctx.settings.showExpiryDate ?? true) ? { expires: event("expiration") } : {}),
        updated: event("last changed"),
        status: data.status ?? [],
        nameservers: Array.isArray(data.nameservers)
          ? data.nameservers.flatMap((server: unknown) =>
              isRecord(server) && typeof server.ldhName === "string" ? [server.ldhName] : [],
            )
          : [],
      },
      null,
      2,
    ),
  };
};

export default run;
