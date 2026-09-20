import { ToolError } from "../../lib/tool-framework/run.ts";

/** Browser-safe input validation; DNS and public-IP checks stay on the server. */
export function parseWebsiteUrl(value: string): URL {
  try {
    const input = value.trim();
    if (value.length > 2048 || !input) throw new Error();
    const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(input);
    const url = new URL(hasScheme ? input : `https://${input.replace(/^\/\//, "")}`);
    const hostname = url.hostname.replace(/\.$/, "").toLowerCase();
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.port ||
      hostname.length > 253 ||
      (!hostname.startsWith("[") &&
        !/^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(hostname)) ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion)$/.test(hostname)
    ) {
      throw new Error();
    }
    url.hash = "";
    if (url.href.length > 2048) throw new Error();
    return url;
  } catch {
    throw new ToolError(
      "invalid-url",
      "Enter a valid public website URL or domain, such as slack.com. Credentials and custom ports are not supported.",
    );
  }
}
