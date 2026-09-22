import { auth } from "@/lib/auth/index.ts";
import config from "@/lib/config/config.ts";
import { getLocalSessionStartUrl, usesLocalSubdomainSessions } from "@/lib/auth/localSession.ts";
import { getSubdomainForHost, subdomainHref } from "@/lib/routing/subdomains.ts";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DEFAULT_AUTH_ERROR } from "./_lib/security";
import { resolveConfiguredReturnTo } from "./_lib/returnTo";
import { AuthPanel } from "./AuthPanel";
import type { AuthMode } from "./AuthPanel";
import { AuthScreen } from "./components/AuthChrome";
import { AdminSignInScreen } from "./components/AdminSignInScreen";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const authProjectPaths = {
  paperwork: "/paperwork",
  devtools: "/devtools",
  media: "/media",
} as const;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveMode(value: string | undefined): AuthMode {
  if (value === "sign-up" || value === "forgot") return value;
  return "sign-in";
}

function isAdminDestination(returnTo: string): boolean {
  const destination = new URL(returnTo, config.appUrl);
  const adminRoot = new URL(subdomainHref("admin"), config.appUrl);
  return (
    destination.origin === adminRoot.origin &&
    (adminRoot.pathname === "/" ||
      destination.pathname === adminRoot.pathname ||
      destination.pathname.startsWith(`${adminRoot.pathname}/`))
  );
}

export default async function AuthPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const requestHeaders = await headers();
  const subdomain = getSubdomainForHost(requestHeaders.get("host") ?? "");
  const isAdminHost = subdomain?.name === "admin";
  const isLocalSubdomain = usesLocalSubdomainSessions() && Boolean(subdomain);
  const validatedReturnTo = resolveConfiguredReturnTo(first(params.returnTo));
  const returnTo = isAdminHost && validatedReturnTo === "/" ? subdomainHref("admin") : validatedReturnTo;
  const session = await auth.api.getSession({
    headers: requestHeaders,
    query: { disableCookieCache: true },
  });
  if (session) {
    if (session.user.status !== "active") redirect("/account/suspended");
    redirect(returnTo);
  }
  const initialError = first(params.error) ? DEFAULT_AUTH_ERROR : undefined;

  if (isLocalSubdomain && first(params.localChecked) !== "1") {
    redirect(getLocalSessionStartUrl(returnTo));
  }

  if (isAdminHost || isAdminDestination(returnTo)) {
    return (
      <AdminSignInScreen
        returnTo={returnTo}
        publicSiteUrl={config.appUrl}
        initialError={initialError}
        googleSignInUrl={isLocalSubdomain ? getLocalSessionStartUrl(returnTo, "google") : undefined}
      />
    );
  }

  return (
    <AuthScreen projects={authProjectPaths}>
      <AuthPanel
        initialError={initialError}
        initialMode={resolveMode(first(params.mode))}
        publicOrigin={new URL(config.appUrl).origin}
        returnTo={returnTo}
      />
    </AuthScreen>
  );
}
