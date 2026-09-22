import config from "@/lib/config/config.ts";
import { appHref, getSubdomainOrigins } from "@/lib/routing/subdomains.ts";
import { resolveReturnTo } from "./security.ts";

export function resolveConfiguredReturnTo(value: string | null | undefined): string {
  const appOrigin = new URL(config.appUrl).origin;
  const subdomainOrigins = getSubdomainOrigins();
  const returnTo = resolveReturnTo(value, {
    baseURL: config.appUrl,
    trustedOrigins: subdomainOrigins.join(","),
    fallback: "/",
  });
  try {
    const destination = new URL(returnTo, config.appUrl);
    if (destination.origin !== appOrigin && !subdomainOrigins.includes(destination.origin)) return "/";
    const path = `${destination.pathname}${destination.search}${destination.hash}`;
    const canonicalHref = appHref(path);
    const resolvedReturnTo = canonicalHref === path ? returnTo : canonicalHref;
    // A post-auth destination must not send the session back to the auth form.
    const pathname = decodeURIComponent(new URL(resolvedReturnTo, config.appUrl).pathname).replace(/\/+$/, "");
    if (pathname === "/auth") return "/";
    return resolvedReturnTo;
  } catch {
    return "/";
  }
}
