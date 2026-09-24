import { NextRequest } from "next/server";
import { afterAll, beforeEach, expect, test, vi } from "vitest";

const state = { session: null, error: null, queries: 0 };
globalThis.__adminSubdomainTest = state;

// routing.ts reads the subdomain registry; keep the real exports but override the map.
vi.mock("@/lib/config/subdomains.ts", async (importOriginal) => ({
  ...(await importOriginal()),
  SUBDOMAINS: {
    admin: { routePrefix: "/admin", indexable: false },
    billing: { routePrefix: "/billing", indexable: true },
    support: { routePrefix: "/billing/help", indexable: true },
  },
}));
vi.mock("@/lib/auth/index.ts", () => ({
  auth: {
    api: {
      async getSession() {
        const state = globalThis.__adminSubdomainTest;
        state.queries++;
        if (state.error) throw state.error;
        return state.session;
      },
    },
  },
}));

const { appHref, subdomainHref, getSubdomainOrigin, getSubdomainOrigins, internalSubdomainPath } =
  await import("@/lib/routing/subdomains.ts");
const { proxy } = await import("@/proxy.ts");
const previousEnvironment = process.env;
beforeEach(() => {
  process.env = { ...previousEnvironment, APP_URL: "https://example.test" };
  delete process.env.AUTH_COOKIE_PREFIX;
  Object.assign(state, { session: null, error: null, queries: 0 });
});
afterAll(() => {
  process.env = previousEnvironment;
  delete globalThis.__adminSubdomainTest;
});
const request = (path, { host = "admin.example.test", method = "GET", cookie = "", headers = {} } = {}) =>
  new NextRequest(`https://${host}${path}`, { method, headers: { cookie, ...headers } });

test("admin links use clean paths and retain queries, fragments and the default local origin", () => {
  expect(subdomainHref("admin")).toBe("https://admin.example.test/");
  expect(appHref("/admin/users?q=A%26B#roles")).toBe("https://admin.example.test/users?q=A%26B#roles");
  expect(appHref("/admin?tab=tools")).toBe("https://admin.example.test/?tab=tools");
  expect(appHref("/administrator")).toBe("/administrator");
  expect(internalSubdomainPath("admin", "/")).toBe("/admin");
  expect(internalSubdomainPath("admin", "/templates/id/manage")).toBe("/admin/templates/id/manage");
  expect(internalSubdomainPath("admin", "/admin/tools")).toBe("/admin/tools");
  delete process.env.APP_URL;
  expect(getSubdomainOrigin("admin")).toBe("http://admin.localhost:3000");
  expect(appHref("/admin/users?q=Ada")).toBe("http://admin.localhost:3000/users?q=Ada");
});

test("admin origins derive from the product hostname and preserve local ports", () => {
  for (const [appUrl, expected] of [
    ["https://example.test", "https://admin.example.test"],
    ["https://www.example.test", "https://admin.example.test"],
    ["https://example.co.uk:8443/", "https://admin.example.co.uk:8443"],
    ["http://localhost:3000", "http://admin.localhost:3000"],
    ["https://localhost:3443", "https://admin.localhost:3443"],
    ["http://smarttools.localhost:3000", "http://admin.smarttools.localhost:3000"],
    ["https://www.smarttools.localhost:3443", "https://admin.smarttools.localhost:3443"],
    [" https://example.test/ ", "https://admin.example.test"],
  ]) {
    process.env.APP_URL = appUrl;
    expect(getSubdomainOrigin("admin"), appUrl).toBe(expected);
  }
});

test("IPs and Vercel preview domains keep same-host admin routes", async () => {
  for (const appUrl of [
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
    "https://192.168.1.10:3000",
    "https://canopy-preview.vercel.app",
  ]) {
    process.env.APP_URL = appUrl;
    expect(getSubdomainOrigin("admin"), appUrl).toBe(null);
    expect(appHref("/admin/users"), appUrl).toBe("/admin/users");
    const response = await proxy(new NextRequest(`${appUrl}/admin/users`));
    expect(response.headers.get("x-middleware-next"), appUrl).toBe("1");
  }
});

test("product URL configuration accepts valid origins only", () => {
  for (const value of [
    "https://user:pass@example.test",
    "https://example.test/tools",
    "https://example.test?q=1",
    "https://example.test#x",
    "javascript:alert(1)",
    "https://*.example.test",
    "not-a-url",
    "http://example.test",
    "",
  ]) {
    process.env.APP_URL = value;
    expect(() => getSubdomainOrigin("admin"), value).toThrow(/APP_URL/);
  }
});

test("clean admin pages and Server Action requests rewrite to their existing routes", async () => {
  for (const [path, target] of [
    ["/", "/admin"],
    ["/users?q=A%26B&page=2", "/admin/users?q=A%26B&page=2"],
    ["/blog/post-1/history", "/admin/blog/post-1/history"],
    ["/tools/media.resize", "/admin/tools/media.resize"],
  ]) {
    for (const method of ["GET", "HEAD", "POST"]) {
      const response = await proxy(request(path, { method }));
      expect(response.headers.get("x-middleware-rewrite")).toBe(`https://admin.example.test${target}`);
      expect(response.headers.get("location")).toBe(null);
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    }
  }
  expect(state.queries).toBe(0);
});

test("legacy admin URLs redirect to the exact configured host without losing query parameters", async () => {
  for (const host of ["example.test", "admin.example.test", "preview.vercel.app"]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await proxy(request("/admin/users?role=editor&page=2", { host, method }));
      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe("https://admin.example.test/users?role=editor&page=2");
    }
  }
  expect((await proxy(request("/admin", { host: "example.test" }))).headers.get("location")).toBe(
    "https://admin.example.test/",
  );
  const mutation = await proxy(request("/admin/users", { host: "example.test", method: "POST" }));
  expect(mutation.status, "never forward a mutation body to another origin").toBe(404);
});

test("public pages and unrelated or spoofed hosts never become the admin workspace", async () => {
  for (const host of ["example.test", "admin.example.test.evil.test", "preview.vercel.app"]) {
    const response = await proxy(request("/users", { host, headers: { "x-forwarded-host": "admin.example.test" } }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-rewrite")).toBe(null);
  }
});

test("bare localhost routes only exact registered subdomains and preserves their port", async () => {
  process.env.APP_URL = "http://localhost:3000";
  expect(getSubdomainOrigins()).toEqual([
    "http://admin.localhost:3000",
    "http://billing.localhost:3000",
    "http://support.localhost:3000",
  ]);
  expect(subdomainHref("admin", "/users?q=Ada#roles")).toBe("http://admin.localhost:3000/users?q=Ada#roles");
  expect(appHref("/billing/help/article")).toBe("http://support.localhost:3000/article");
  for (const [path, internalPath] of [
    ["/", "/admin"],
    ["/users?q=Ada", "/admin/users?q=Ada"],
  ]) {
    for (const method of ["GET", "HEAD", "POST"]) {
      const response = await proxy(new NextRequest(`http://admin.localhost:3000${path}`, { method }));
      expect(response.headers.get("x-middleware-rewrite")).toBe(`http://admin.localhost:3000${internalPath}`);
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    }
  }
  for (const host of ["localhost:3000", "admin.localhost:3001", "admin.localhost.evil.test:3000"]) {
    const response = await proxy(
      new NextRequest(`http://${host}/users`, {
        headers: { "x-forwarded-host": "admin.localhost:3000" },
      }),
    );
    expect(response.headers.get("x-middleware-next"), host).toBe("1");
    expect(response.headers.get("x-middleware-rewrite"), host).toBe(null);
  }
});

test("bare localhost legacy admin pages redirect to clean admin URLs without forwarding mutation bodies", async () => {
  process.env.APP_URL = "http://localhost:3000";
  for (const host of ["localhost:3000", "admin.localhost:3000"]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await proxy(new NextRequest(`http://${host}/admin/users?role=editor&page=2`, { method }));
      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe("http://admin.localhost:3000/users?role=editor&page=2");
    }
  }
  const root = await proxy(new NextRequest("http://localhost:3000/admin"));
  expect(root.headers.get("location")).toBe("http://admin.localhost:3000/");
  const mutation = await proxy(new NextRequest("http://localhost:3000/admin/users", { method: "POST" }));
  expect(mutation.status).toBe(404);
  for (const path of ["/auth", "/api/auth/get-session", "/logo.svg"]) {
    expect((await proxy(new NextRequest(`http://admin.localhost:3000${path}`))).headers.get("x-middleware-next")).toBe(
      "1",
    );
  }
});

test("routing uses the exact Host when Next.js normalizes its internal request URL", async () => {
  const options = { host: "localhost:3000", headers: { host: "admin.example.test" } };
  const response = await proxy(request("/users", options));
  expect(response.headers.get("x-middleware-rewrite")).toBe("https://localhost:3000/admin/users");
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  state.session = { user: { status: "suspended" } };
  const blocked = await proxy(request("/users", { ...options, cookie: "smarttools.session_token=test" }));
  expect(blocked.headers.get("location")).toBe("https://admin.example.test/account/suspended");
});

test("a configured named localhost admin root reaches the protected admin route for signed-out visitors", async () => {
  process.env.APP_URL = "http://smarttools.localhost:3000";
  const response = await proxy(
    new NextRequest("http://localhost:3000/", { headers: { host: "admin.smarttools.localhost:3000" } }),
  );
  expect(response.headers.get("x-middleware-rewrite")).toBe("http://localhost:3000/admin");
  expect(response.headers.get("x-middleware-next")).toBe(null);
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  expect(state.queries).toBe(0);
});

test("auth, APIs and static assets retain their paths on the admin host", async () => {
  for (const path of [
    "/auth",
    "/auth/profile",
    "/auth/reset-password?token=x",
    "/api/auth/callback/google",
    "/api/admin/templates/id/export",
    "/api/assistant/blog/runs",
    "/account/suspended",
    "/_next/static/chunk.js",
    "/_next/image?url=x",
    "/logo.svg",
    "/logo-dark.svg",
    "/favicon.ico",
    "/assets/media-illustration@4x.png",
    "/media/vendor/qpdf/qpdf.js",
    "/media/licenses/heic-to-NOTICE.txt",
    "/tool-icons/v1/icon.png",
  ]) {
    const response = await proxy(request(path));
    expect(response.headers.get("x-middleware-next"), path).toBe("1");
  }
  for (const path of ["/authentic", "/apiary", "/assets-other", "/media"]) {
    expect((await proxy(request(path))).headers.get("x-middleware-rewrite")).toBe(
      `https://admin.example.test/admin${path}`,
    );
  }
});

test("admin crawl rules block all pages and do not expose the public sitemap", async () => {
  const robots = await proxy(request("/robots.txt"));
  expect(robots.status).toBe(200);
  expect(await robots.text()).toBe("User-agent: *\nDisallow: /\n");
  expect((await proxy(request("/sitemap.xml"))).status).toBe(404);
});

test("shared sessions retain suspension enforcement, recovery and logout on clean admin paths", async () => {
  const cookie = "smarttools.session_token=test";
  state.session = { user: { status: "active" } };
  expect((await proxy(request("/users", { cookie }))).headers.get("x-middleware-rewrite")).toBe(
    "https://admin.example.test/admin/users",
  );
  expect(state.queries).toBe(1);
  state.session.user.status = "suspended";
  const blocked = await proxy(request("/users", { cookie }));
  expect(blocked.status).toBe(303);
  expect(blocked.headers.get("location")).toBe("https://admin.example.test/account/suspended");
  expect((await proxy(request("/users", { cookie, method: "POST" }))).status).toBe(403);
  expect((await proxy(request("/api/admin/templates/id/export", { cookie }))).status).toBe(403);
  expect((await proxy(request("/account/suspended", { cookie }))).headers.get("x-middleware-next")).toBe("1");
  state.error = new Error("Session service unavailable");
  expect((await proxy(request("/users", { cookie }))).status).toBe(503);
  expect(
    (await proxy(request("/api/auth/sign-out", { cookie, method: "POST" }))).headers.get("x-middleware-next"),
  ).toBe("1");
});

test("configured cookie prefixes preserve account checks for plain and secure cookies", async () => {
  process.env.AUTH_COOKIE_PREFIX = "canopy-test";
  state.session = { user: { status: "suspended" } };
  for (const prefix of ["canopy-test", "__Secure-canopy-test"]) {
    const response = await proxy(request("/users", { cookie: `${prefix}.session_token=test` }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://admin.example.test/account/suspended");
  }
  expect(state.queries).toBe(2);
});

test("a second registered subdomain uses the same link helpers and IP fallback", () => {
  expect(getSubdomainOrigins()).toEqual([
    "https://admin.example.test",
    "https://billing.example.test",
    "https://support.example.test",
  ]);
  expect(getSubdomainOrigin("billing")).toBe("https://billing.example.test");
  expect(subdomainHref("billing")).toBe("https://billing.example.test/");
  expect(subdomainHref("billing", "/invoices?q=paid#total")).toBe("https://billing.example.test/invoices?q=paid#total");
  expect(appHref("/billing/invoices?q=paid#total")).toBe("https://billing.example.test/invoices?q=paid#total");
  expect(appHref("/billing?tab=plans")).toBe("https://billing.example.test/?tab=plans");
  expect(appHref("/billing-extra")).toBe("/billing-extra");
  expect(internalSubdomainPath("billing", "/")).toBe("/billing");
  expect(internalSubdomainPath("billing", "/invoices")).toBe("/billing/invoices");
  expect(internalSubdomainPath("billing", "/billing/invoices")).toBe("/billing/invoices");
  process.env.APP_URL = "http://127.0.0.1:3000";
  expect(getSubdomainOrigins()).toEqual([]);
  expect(subdomainHref("billing")).toBe("/billing");
  expect(subdomainHref("billing", "/invoices")).toBe("/billing/invoices");
  expect(subdomainHref("billing", "/auth?returnTo=%2Fbilling")).toBe("/auth?returnTo=%2Fbilling");
  expect(subdomainHref("billing", "/api/auth/get-session")).toBe("/api/auth/get-session");
  expect(subdomainHref("billing", "/logo.svg?v=2")).toBe("/logo.svg?v=2");
});

test("a second registered subdomain gets routing, redirects, shared paths and suspension checks", async () => {
  const host = "billing.example.test";
  for (const method of ["GET", "HEAD", "POST"]) {
    const response = await proxy(request("/invoices?page=2", { host, method }));
    expect(response.headers.get("x-middleware-rewrite")).toBe("https://billing.example.test/billing/invoices?page=2");
    expect(response.headers.get("x-robots-tag")).toBe(null);
  }
  for (const path of ["/auth", "/api/auth/get-session", "/assets/icon.svg", "/logo.svg"]) {
    expect((await proxy(request(path, { host }))).headers.get("x-middleware-next")).toBe("1");
  }
  const legacy = await proxy(request("/billing/invoices?page=2", { host: "example.test" }));
  expect(legacy.status).toBe(308);
  expect(legacy.headers.get("location")).toBe("https://billing.example.test/invoices?page=2");
  expect((await proxy(request("/billing/invoices", { host: "admin.example.test", method: "POST" }))).status).toBe(404);
  expect((await proxy(request("/billing/invoices", { host, method: "POST" }))).headers.get("x-middleware-next")).toBe(
    "1",
  );
  state.session = { user: { status: "suspended" } };
  expect(
    (await proxy(request("/invoices", { host, cookie: "smarttools.session_token=test" }))).headers.get("location"),
  ).toBe("https://billing.example.test/account/suspended");
});

test("indexable subdomains serve their own crawl routes instead of the public site's sitemap", async () => {
  for (const path of ["/robots.txt", "/sitemap.xml"]) {
    const response = await proxy(request(path, { host: "billing.example.test" }));
    expect(response.headers.get("x-robots-tag")).toBe(null);
    expect(response.headers.get("x-middleware-rewrite")).toBe(`https://billing.example.test/billing${path}`);
  }
});

test("subdomain names are independent of route folders and the most specific prefix wins", async () => {
  expect(appHref("/billing/help/article?q=1")).toBe("https://support.example.test/article?q=1");
  expect(subdomainHref("support", "/article")).toBe("https://support.example.test/article");
  expect(internalSubdomainPath("support", "/article")).toBe("/billing/help/article");
  const response = await proxy(request("/article", { host: "support.example.test" }));
  expect(response.headers.get("x-middleware-rewrite")).toBe("https://support.example.test/billing/help/article");
});

test("named subdomain links accept only local paths", () => {
  for (const path of ["https://evil.test/", "//evil.test/", "/\\evil.test/", "users"]) {
    expect(() => subdomainHref("admin", path), path).toThrow(/single slash/);
  }
});
