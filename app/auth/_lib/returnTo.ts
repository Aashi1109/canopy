import config from "@/lib/config/config.ts";
import { resolveReturnTo } from "./security.ts";

export function resolveConfiguredReturnTo(value: string | null | undefined): string {
  const returnTo = resolveReturnTo(value, {
    baseURL: config.appUrl,
    fallback: "/",
  });
  try {
    const destination = new URL(returnTo, config.appUrl);
    if (destination.origin !== new URL(config.appUrl).origin) return "/";
    // A post-auth destination must not send the session back to the auth form.
    const pathname = decodeURIComponent(destination.pathname).replace(/\/+$/, "");
    return pathname === "/auth" ? "/" : returnTo;
  } catch {
    return "/";
  }
}
