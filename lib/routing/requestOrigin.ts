import publicConfig from "../config/public.ts";
import { getSubdomainForHost } from "./subdomains.ts";

/** Validate the browser origin against the public host, even when Next rewrites request.url. */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  const requestUrl = new URL(request.url);
  const host = (request.headers.get("host") ?? requestUrl.host).toLowerCase();
  const appUrl = new URL(publicConfig.appUrl);
  if (host === appUrl.host) return origin === appUrl.origin;

  const subdomain = getSubdomainForHost(host);
  if (subdomain) return origin === subdomain.origin;

  // Preserve same-origin preview URLs; never trust forwarded headers or a mismatched Host.
  return host === requestUrl.host && origin === requestUrl.origin;
}
