import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { NextRequest } from "next/server.js";

const routingUrl = new URL("../lib/routing/subdomains.ts", import.meta.url).href;
const registryUrl = new URL("../lib/config/subdomains.ts", import.meta.url).href;
const proxyUrl = new URL("../proxy.ts", import.meta.url).href;
const state = { session: null, error: null, queries: 0 };
globalThis.__adminSubdomainTest = state;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL === routingUrl && specifier === "../config/subdomains.ts") {
      return {
        shortCircuit: true,
        url: `data:text/javascript,${encodeURIComponent(`
          export * from "${registryUrl}";
          export const SUBDOMAINS = {
            admin: { routePrefix: "/admin", indexable: false },
            billing: { routePrefix: "/billing", indexable: true },
            support: { routePrefix: "/billing/help", indexable: true },
          };
        `)}`,
      };
    }
    if (context.parentURL === proxyUrl && specifier === "./lib/auth/index.ts") {
      return {
        shortCircuit: true,
        url: `data:text/javascript,${encodeURIComponent(`export const auth = {api: {async getSession() {
          const state = globalThis.__adminSubdomainTest;
          state.queries++;
          if (state.error) throw state.error;
          return state.session;
        }}};`)}`,
      };
    }
    return next(specifier === "next/server" ? "next/server.js" : specifier, context);
  },
});
const { appHref, subdomainHref, getSubdomainOrigin, getSubdomainOrigins, internalSubdomainPath } = await import(
  routingUrl
);
const { proxy } = await import(proxyUrl);
hooks.deregister();
const previousEnvironment = process.env;
test.beforeEach(() => {
  process.env = { ...previousEnvironment, APP_URL: "https://example.test" };
  delete process.env.AUTH_COOKIE_PREFIX;
  Object.assign(state, { session: null, error: null, queries: 0 });
});
test.after(() => {
  process.env = previousEnvironment;
  delete globalThis.__adminSubdomainTest;
});
const request = (path, { host = "admin.example.test", method = "GET", cookie = "", headers = {} } = {}) =>
  new NextRequest(`https://${host}${path}`, { method, headers: { cookie, ...headers } });

test("admin links use clean paths and retain queries, fragments and the default local origin", () => {
  assert.equal(subdomainHref("admin"), "https://admin.example.test/");
  assert.equal(appHref("/admin/users?q=A%26B#roles"), "https://admin.example.test/users?q=A%26B#roles");
  assert.equal(appHref("/admin?tab=tools"), "https://admin.example.test/?tab=tools");
  assert.equal(appHref("/administrator"), "/administrator");
  assert.equal(internalSubdomainPath("admin", "/"), "/admin");
  assert.equal(internalSubdomainPath("admin", "/templates/id/manage"), "/admin/templates/id/manage");
  assert.equal(internalSubdomainPath("admin", "/admin/tools"), "/admin/tools");
  delete process.env.APP_URL;
  assert.equal(getSubdomainOrigin("admin"), "http://admin.localhost:3000");
  assert.equal(appHref("/admin/users?q=Ada"), "http://admin.localhost:3000/users?q=Ada");
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
    assert.equal(getSubdomainOrigin("admin"), expected, appUrl);
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
    assert.equal(getSubdomainOrigin("admin"), null, appUrl);
    assert.equal(appHref("/admin/users"), "/admin/users", appUrl);
    const response = await proxy(new NextRequest(`${appUrl}/admin/users`));
    assert.equal(response.headers.get("x-middleware-next"), "1", appUrl);
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
    assert.throws(() => getSubdomainOrigin("admin"), /APP_URL/, value);
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
      assert.equal(response.headers.get("x-middleware-rewrite"), `https://admin.example.test${target}`);
      assert.equal(response.headers.get("location"), null);
      assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    }
  }
  assert.equal(state.queries, 0);
});

test("legacy admin URLs redirect to the exact configured host without losing query parameters", async () => {
  for (const host of ["example.test", "admin.example.test", "preview.vercel.app"]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await proxy(request("/admin/users?role=editor&page=2", { host, method }));
      assert.equal(response.status, 308);
      assert.equal(response.headers.get("location"), "https://admin.example.test/users?role=editor&page=2");
    }
  }
  assert.equal(
    (await proxy(request("/admin", { host: "example.test" }))).headers.get("location"),
    "https://admin.example.test/",
  );
  const mutation = await proxy(request("/admin/users", { host: "example.test", method: "POST" }));
  assert.equal(mutation.status, 404, "never forward a mutation body to another origin");
});

test("public pages and unrelated or spoofed hosts never become the admin workspace", async () => {
  for (const host of ["example.test", "admin.example.test.evil.test", "preview.vercel.app"]) {
    const response = await proxy(request("/users", { host, headers: { "x-forwarded-host": "admin.example.test" } }));
    assert.equal(response.headers.get("x-middleware-next"), "1");
    assert.equal(response.headers.get("x-middleware-rewrite"), null);
  }
});

test("bare localhost routes only exact registered subdomains and preserves their port", async () => {
  process.env.APP_URL = "http://localhost:3000";
  assert.deepEqual(getSubdomainOrigins(), [
    "http://admin.localhost:3000",
    "http://billing.localhost:3000",
    "http://support.localhost:3000",
  ]);
  assert.equal(subdomainHref("admin", "/users?q=Ada#roles"), "http://admin.localhost:3000/users?q=Ada#roles");
  assert.equal(appHref("/billing/help/article"), "http://support.localhost:3000/article");
  for (const [path, internalPath] of [
    ["/", "/admin"],
    ["/users?q=Ada", "/admin/users?q=Ada"],
  ]) {
    for (const method of ["GET", "HEAD", "POST"]) {
      const response = await proxy(new NextRequest(`http://admin.localhost:3000${path}`, { method }));
      assert.equal(response.headers.get("x-middleware-rewrite"), `http://admin.localhost:3000${internalPath}`);
      assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    }
  }
  for (const host of ["localhost:3000", "admin.localhost:3001", "admin.localhost.evil.test:3000"]) {
    const response = await proxy(
      new NextRequest(`http://${host}/users`, {
        headers: { "x-forwarded-host": "admin.localhost:3000" },
      }),
    );
    assert.equal(response.headers.get("x-middleware-next"), "1", host);
    assert.equal(response.headers.get("x-middleware-rewrite"), null, host);
  }
});

test("bare localhost legacy admin pages redirect to clean admin URLs without forwarding mutation bodies", async () => {
  process.env.APP_URL = "http://localhost:3000";
  for (const host of ["localhost:3000", "admin.localhost:3000"]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await proxy(new NextRequest(`http://${host}/admin/users?role=editor&page=2`, { method }));
      assert.equal(response.status, 308);
      assert.equal(response.headers.get("location"), "http://admin.localhost:3000/users?role=editor&page=2");
    }
  }
  const root = await proxy(new NextRequest("http://localhost:3000/admin"));
  assert.equal(root.headers.get("location"), "http://admin.localhost:3000/");
  const mutation = await proxy(new NextRequest("http://localhost:3000/admin/users", { method: "POST" }));
  assert.equal(mutation.status, 404);
  for (const path of ["/auth", "/api/auth/get-session", "/logo.svg"]) {
    assert.equal(
      (await proxy(new NextRequest(`http://admin.localhost:3000${path}`))).headers.get("x-middleware-next"),
      "1",
    );
  }
});

test("routing uses the exact Host when Next.js normalizes its internal request URL", async () => {
  const options = { host: "localhost:3000", headers: { host: "admin.example.test" } };
  const response = await proxy(request("/users", options));
  assert.equal(response.headers.get("x-middleware-rewrite"), "https://localhost:3000/admin/users");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  state.session = { user: { status: "suspended" } };
  const blocked = await proxy(request("/users", { ...options, cookie: "smarttools.session_token=test" }));
  assert.equal(blocked.headers.get("location"), "https://admin.example.test/account/suspended");
});

test("a configured named localhost admin root reaches the protected admin route for signed-out visitors", async () => {
  process.env.APP_URL = "http://smarttools.localhost:3000";
  const response = await proxy(
    new NextRequest("http://localhost:3000/", { headers: { host: "admin.smarttools.localhost:3000" } }),
  );
  assert.equal(response.headers.get("x-middleware-rewrite"), "http://localhost:3000/admin");
  assert.equal(response.headers.get("x-middleware-next"), null);
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(state.queries, 0);
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
    assert.equal(response.headers.get("x-middleware-next"), "1", path);
  }
  for (const path of ["/authentic", "/apiary", "/assets-other", "/media"]) {
    assert.equal(
      (await proxy(request(path))).headers.get("x-middleware-rewrite"),
      `https://admin.example.test/admin${path}`,
    );
  }
});

test("admin crawl rules block all pages and do not expose the public sitemap", async () => {
  const robots = await proxy(request("/robots.txt"));
  assert.equal(robots.status, 200);
  assert.equal(await robots.text(), "User-agent: *\nDisallow: /\n");
  assert.equal((await proxy(request("/sitemap.xml"))).status, 404);
});

test("shared sessions retain suspension enforcement, recovery and logout on clean admin paths", async () => {
  const cookie = "smarttools.session_token=test";
  state.session = { user: { status: "active" } };
  assert.equal(
    (await proxy(request("/users", { cookie }))).headers.get("x-middleware-rewrite"),
    "https://admin.example.test/admin/users",
  );
  assert.equal(state.queries, 1);
  state.session.user.status = "suspended";
  const blocked = await proxy(request("/users", { cookie }));
  assert.equal(blocked.status, 303);
  assert.equal(blocked.headers.get("location"), "https://admin.example.test/account/suspended");
  assert.equal((await proxy(request("/users", { cookie, method: "POST" }))).status, 403);
  assert.equal((await proxy(request("/api/admin/templates/id/export", { cookie }))).status, 403);
  assert.equal((await proxy(request("/account/suspended", { cookie }))).headers.get("x-middleware-next"), "1");
  state.error = new Error("Session service unavailable");
  assert.equal((await proxy(request("/users", { cookie }))).status, 503);
  assert.equal(
    (await proxy(request("/api/auth/sign-out", { cookie, method: "POST" }))).headers.get("x-middleware-next"),
    "1",
  );
});

test("configured cookie prefixes preserve account checks for plain and secure cookies", async () => {
  process.env.AUTH_COOKIE_PREFIX = "canopy-test";
  state.session = { user: { status: "suspended" } };
  for (const prefix of ["canopy-test", "__Secure-canopy-test"]) {
    const response = await proxy(request("/users", { cookie: `${prefix}.session_token=test` }));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "https://admin.example.test/account/suspended");
  }
  assert.equal(state.queries, 2);
});

test("a second registered subdomain uses the same link helpers and IP fallback", () => {
  assert.deepEqual(getSubdomainOrigins(), [
    "https://admin.example.test",
    "https://billing.example.test",
    "https://support.example.test",
  ]);
  assert.equal(getSubdomainOrigin("billing"), "https://billing.example.test");
  assert.equal(subdomainHref("billing"), "https://billing.example.test/");
  assert.equal(
    subdomainHref("billing", "/invoices?q=paid#total"),
    "https://billing.example.test/invoices?q=paid#total",
  );
  assert.equal(appHref("/billing/invoices?q=paid#total"), "https://billing.example.test/invoices?q=paid#total");
  assert.equal(appHref("/billing?tab=plans"), "https://billing.example.test/?tab=plans");
  assert.equal(appHref("/billing-extra"), "/billing-extra");
  assert.equal(internalSubdomainPath("billing", "/"), "/billing");
  assert.equal(internalSubdomainPath("billing", "/invoices"), "/billing/invoices");
  assert.equal(internalSubdomainPath("billing", "/billing/invoices"), "/billing/invoices");
  process.env.APP_URL = "http://127.0.0.1:3000";
  assert.deepEqual(getSubdomainOrigins(), []);
  assert.equal(subdomainHref("billing"), "/billing");
  assert.equal(subdomainHref("billing", "/invoices"), "/billing/invoices");
  assert.equal(subdomainHref("billing", "/auth?returnTo=%2Fbilling"), "/auth?returnTo=%2Fbilling");
  assert.equal(subdomainHref("billing", "/api/auth/get-session"), "/api/auth/get-session");
  assert.equal(subdomainHref("billing", "/logo.svg?v=2"), "/logo.svg?v=2");
});

test("a second registered subdomain gets routing, redirects, shared paths and suspension checks", async () => {
  const host = "billing.example.test";
  for (const method of ["GET", "HEAD", "POST"]) {
    const response = await proxy(request("/invoices?page=2", { host, method }));
    assert.equal(response.headers.get("x-middleware-rewrite"), "https://billing.example.test/billing/invoices?page=2");
    assert.equal(response.headers.get("x-robots-tag"), null);
  }
  for (const path of ["/auth", "/api/auth/get-session", "/assets/icon.svg", "/logo.svg"]) {
    assert.equal((await proxy(request(path, { host }))).headers.get("x-middleware-next"), "1");
  }
  const legacy = await proxy(request("/billing/invoices?page=2", { host: "example.test" }));
  assert.equal(legacy.status, 308);
  assert.equal(legacy.headers.get("location"), "https://billing.example.test/invoices?page=2");
  assert.equal((await proxy(request("/billing/invoices", { host: "admin.example.test", method: "POST" }))).status, 404);
  assert.equal(
    (await proxy(request("/billing/invoices", { host, method: "POST" }))).headers.get("x-middleware-next"),
    "1",
  );
  state.session = { user: { status: "suspended" } };
  assert.equal(
    (await proxy(request("/invoices", { host, cookie: "smarttools.session_token=test" }))).headers.get("location"),
    "https://billing.example.test/account/suspended",
  );
});

test("indexable subdomains serve their own crawl routes instead of the public site's sitemap", async () => {
  for (const path of ["/robots.txt", "/sitemap.xml"]) {
    const response = await proxy(request(path, { host: "billing.example.test" }));
    assert.equal(response.headers.get("x-robots-tag"), null);
    assert.equal(response.headers.get("x-middleware-rewrite"), `https://billing.example.test/billing${path}`);
  }
});

test("subdomain names are independent of route folders and the most specific prefix wins", async () => {
  assert.equal(appHref("/billing/help/article?q=1"), "https://support.example.test/article?q=1");
  assert.equal(subdomainHref("support", "/article"), "https://support.example.test/article");
  assert.equal(internalSubdomainPath("support", "/article"), "/billing/help/article");
  const response = await proxy(request("/article", { host: "support.example.test" }));
  assert.equal(response.headers.get("x-middleware-rewrite"), "https://support.example.test/billing/help/article");
});

test("named subdomain links accept only local paths", () => {
  for (const path of ["https://evil.test/", "//evil.test/", "/\\evil.test/", "users"]) {
    assert.throws(() => subdomainHref("admin", path), /single slash/);
  }
});
