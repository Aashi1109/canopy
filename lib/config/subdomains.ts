type SubdomainSettings = {
  /** Existing Next.js route folder, hidden from the subdomain's browser URLs. */
  routePrefix: `/${string}`;
  /** False blocks crawling. True allows it and requires this scope's own robots/sitemap routes. */
  indexable: boolean;
};

/** Each key becomes <key>.<APP_URL hostname>. Register only subdomains owned by this app. */
export const SUBDOMAINS = {
  admin: { routePrefix: "/admin", indexable: false },
} as const satisfies Record<string, SubdomainSettings>;

export type SubdomainName = keyof typeof SUBDOMAINS;

/** App-wide routes keep their original paths on every subdomain. These paths are reserved. */
export const SHARED_SUBDOMAIN_PATHS = [
  "/api",
  "/_next",
  "/auth",
  "/account",
  "/assets",
  "/tool-icons",
  "/media/vendor",
  "/media/licenses",
];

export const SHARED_SUBDOMAIN_FILES = ["/logo.svg", "/logo-dark.svg", "/favicon.ico"];
