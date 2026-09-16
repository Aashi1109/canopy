/**
 * Moved verbatim from the `dns-checker` case in `lib/devtools/format-json.ts`:
 * the same `normalizeDomain`, the same closed record-type allowlist, the same
 * DNS-over-HTTPS endpoint and query parameters, the same ten-second timeout,
 * and the same structured/raw output shapes.
 *
 * `run.ts`, not `run.server.ts`: this is a plain `fetch` to a public resolver
 * with no credential, no secret, and no `node:` API. It runs in the browser
 * today and keeping it there preserves the property that the user's query never
 * passes through our servers.
 *
 * The domain is user-supplied and drives an outbound request, so the two guards
 * that bound it — `normalizeDomain` and the six-entry `ALLOWED_TYPES` set — are
 * carried over unchanged and must not be widened.
 */

import { isRecord } from "../../lib/devtools/shared/json.ts";
import { normalizeDomain } from "../../lib/devtools/shared/url.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import { ToolError, type ToolRun } from "../../lib/tool-framework/run.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

const ALLOWED_TYPES = new Set(["A", "AAAA", "MX", "TXT", "NS", "CNAME"]);
const LOOKUP_TIMEOUT_MS = 10_000;

export const run: ToolRun<Settings> = async (ctx): Promise<ToolResult> => {
  const domain = normalizeDomain(ctx.input.text);
  const recordFilter = ctx.settings.recordFilter ?? "all";
  const types =
    recordFilter === "all"
      ? [
          ...new Set(
            ctx.settings.types
              .split(",")
              .map((type) => type.trim().toUpperCase())
              .filter(Boolean),
          ),
        ]
      : [recordFilter];
  if (!types.length || types.some((type) => !ALLOWED_TYPES.has(type))) {
    throw new ToolError(
      "record-type-unsupported",
      "DNS record types may only include A, AAAA, MX, TXT, NS, and CNAME.",
      "Use a comma-separated list drawn from those six types.",
    );
  }
  const records = await Promise.all(
    types.map(async (type) => {
      let response: Response;
      try {
        const query = new URLSearchParams({
          name: domain,
          type,
          rd: ctx.settings.recursive ? "1" : "0",
        });
        if (ctx.settings.checkDnssec) {
          query.set("do", "1");
          query.set("cd", "0");
        }
        response = await fetch(`https://dns.google/resolve?${query.toString()}`, {
          headers: { accept: "application/dns-json" },
          signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
        });
      } catch {
        throw new ToolError(
          "resolver-unreachable",
          "DNS Checker could not reach the public DNS service.",
          "Check your network connection and try again.",
        );
      }
      if (!response.ok) {
        throw new ToolError(
          "lookup-failed",
          `DNS lookup failed (${response.status}).`,
          "The public resolver rejected the query. Try again in a moment.",
        );
      }
      const data: unknown = await response.json();
      if (!isRecord(data)) {
        throw new ToolError(
          "resolver-invalid-response",
          "DNS service returned an invalid response.",
        );
      }
      return [type, data] as const;
    }),
  );
  ctx.signal.throwIfAborted();

  if (ctx.settings.recordView === "raw") {
    return {
      render: "text",
      text: JSON.stringify(Object.fromEntries(records), null, 2),
      downloadName: "dns-records.json",
    };
  }

  const includeTtl = ctx.settings.includeTtl;
  const rows = records.flatMap(([type, data]) => {
    const answers = Array.isArray(data.Answer) ? data.Answer : [];
    return answers.map((answer: unknown) => {
      if (!isRecord(answer)) return `${type}\t—\tInvalid record`;
      const ttl = includeTtl && typeof answer.TTL === "number" ? String(answer.TTL) : "—";
      const value =
        typeof answer.data === "string" ? answer.data : JSON.stringify(answer.data ?? "");
      return `${type}\t${ttl}\t${value}`;
    });
  });

  return {
    render: "text",
    text: rows.length ? rows.join("\n") : "NO_RECORDS\t—\tNo matching DNS records",
    downloadName: "dns-records.txt",
  };
};

export default run;
