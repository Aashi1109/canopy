// Domain normalization and absolute-URL validation.
// Verbatim extraction from lib/devtools/format-json.ts (region 4).

import { ToolError } from "../../tool-framework/run.ts";

export function normalizeDomain(input: string): string {
  const raw = input.trim().toLowerCase();
  if (!raw) throw new ToolError("input-required", "Domain is required.", "Enter a value and try again.");
  let hostname: string;
  try {
    hostname = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname;
  } catch {
    throw new ToolError("invalid-domain", "Enter a valid domain name.");
  }
  if (!hostname.includes(".") || !/^[a-z\d.-]+$/i.test(hostname)) {
    throw new ToolError("invalid-domain", "Enter a valid domain name.");
  }
  return hostname.replace(/^www\./, "");
}

export function safeUrl(input: string, label: string): URL {
  try {
    const url = new URL(input);
    if (!/^https?:$/.test(url.protocol)) {
      throw new ToolError("invalid-url", `${label} must be an absolute http or https URL.`);
    }
    return url;
  } catch {
    throw new ToolError("invalid-url", `${label} must be an absolute http or https URL.`);
  }
}
