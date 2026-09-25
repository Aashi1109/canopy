import publicConfig from "../config/public.ts";
import {
  SUBDOMAINS,
  SHARED_SUBDOMAIN_PATHS,
  SHARED_SUBDOMAIN_FILES,
  type SubdomainName,
} from "../config/subdomains.ts";

const subdomainNames = Object.keys(SUBDOMAINS) as SubdomainName[];

function subdomainBaseUrl(): URL | null {
  let url: URL;
  try {
    url = new URL(publicConfig.appUrl.trim());
  } catch {
    throw new Error("APP_URL must be an absolute HTTPS origin (HTTP is allowed on localhost).");
  }
  const hostname = url.hostname.replace(/^www\./, "");
  const ipAddress = hostname.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
  const local = hostname === "localhost" || hostname.endsWith(".localhost") || ipAddress;
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.hostname.includes("*")
  ) {
    throw new Error(
      "APP_URL must be an HTTPS origin without credentials, a path, or wildcards (HTTP is allowed on localhost).",
    );
  }
  // IPs cannot host subdomains; hosted preview subdomains are not owned by this app.
  if (
    ipAddress ||
    hostname === "vercel.app" ||
    hostname.endsWith(".vercel.app") ||
    hostname === "workers.dev" ||
    hostname.endsWith(".workers.dev")
  ) {
    return null;
  }
  url.hostname = hostname;
  return url;
}

function matchesRoutePrefix(path: string, prefix: string): boolean {
  return path === prefix || ["/", "?", "#"].some((separator) => path.startsWith(prefix + separator));
}

function resolvedSubdomains() {
  const base = subdomainBaseUrl();
  if (!base) return [];
  return subdomainNames.map((name) => {
    const url = new URL(base);
    url.hostname = `${name}.${base.hostname}`;
    return { name, ...SUBDOMAINS[name], origin: url.origin, host: url.host };
  });
}

export function getSubdomainOrigin(name: SubdomainName): string | null {
  return resolvedSubdomains().find((subdomain) => subdomain.name === name)?.origin ?? null;
}

/** Exact origins shared by authentication and post-login redirect validation. */
export function getSubdomainOrigins(): string[] {
  return resolvedSubdomains().map((subdomain) => subdomain.origin);
}

export function getSubdomainForHost(host: string) {
  return resolvedSubdomains().find((subdomain) => subdomain.host === host.toLowerCase());
}

export function getSubdomainForPath(path: string) {
  // Prefer the most specific route if registered prefixes are nested.
  return resolvedSubdomains()
    .sort((left, right) => right.routePrefix.length - left.routePrefix.length)
    .find((subdomain) => matchesRoutePrefix(path, subdomain.routePrefix));
}

/** Convert an internal app path: /admin/users -> https://admin.example.com/users. */
export function appHref(path: string): string {
  const subdomain = getSubdomainForPath(path);
  if (!subdomain) return path;
  const cleanPath = path.slice(subdomain.routePrefix.length);
  return subdomain.origin + (cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`);
}

/** Build a named subdomain link from a clean path, with same-host fallback for IP and preview URLs. */
export function subdomainHref(name: SubdomainName, path = "/"): string {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    throw new Error("A subdomain link must use a path starting with a single slash.");
  }
  const origin = getSubdomainOrigin(name);
  if (origin) return origin + path;
  if (isSharedSubdomainPath(path.replace(/[?#].*$/, ""))) return path;
  return SUBDOMAINS[name].routePrefix + (path === "/" ? "" : path);
}

/** Recover the internal route identity for layouts that compare usePathname() with app paths. */
export function internalSubdomainPath(name: SubdomainName, pathname: string): string {
  const prefix = SUBDOMAINS[name].routePrefix;
  if (matchesRoutePrefix(pathname, prefix)) return pathname;
  return pathname === "/" ? prefix : prefix + pathname;
}

export function isSharedSubdomainPath(pathname: string): boolean {
  return (
    SHARED_SUBDOMAIN_FILES.includes(pathname) ||
    SHARED_SUBDOMAIN_PATHS.some((path) => matchesRoutePrefix(pathname, path))
  );
}
