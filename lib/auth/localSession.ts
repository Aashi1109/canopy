import publicConfig from "../config/public.ts";
import { getSubdomainOrigins } from "../routing/subdomains.ts";

/** Browsers keep localhost and its subdomains in separate cookie scopes. */
export function usesLocalSubdomainSessions(): boolean {
  return new URL(publicConfig.appUrl).hostname === "localhost" && getSubdomainOrigins().length > 0;
}

export function getLocalSessionStartUrl(returnTo: string, mode: "check" | "google" = "check"): string {
  return `/api/auth/local-session?${new URLSearchParams({ step: "start", returnTo, mode })}`;
}
