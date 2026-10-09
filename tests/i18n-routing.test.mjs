import { NextRequest } from "next/server";
import { afterAll, beforeEach, expect, test, vi } from "vitest";
import { direction, isLocale, localizeHref, locales } from "@/lib/i18n/config.ts";

const account = vi.hoisted(() => ({ session: null }));
vi.mock("@/lib/auth/index.ts", () => ({
  auth: { api: { getSession: async () => account.session } },
}));
const { proxy } = await import("@/proxy.ts");
const previousEnvironment = process.env;
beforeEach(() => {
  process.env = { ...previousEnvironment, APP_URL: "https://example.test" };
  delete process.env.AUTH_COOKIE_PREFIX;
  account.session = null;
});
afterAll(() => {
  process.env = previousEnvironment;
});

function request(path, options = {}) {
  const { origin = "https://example.test", ...init } = options;
  return new NextRequest(`${origin}${path}`, { ...init, headers: { host: new URL(origin).host, ...init.headers } });
}

test("English public URLs rewrite internally without language negotiation or locale cookies", async () => {
  for (const path of [
    "/",
    "/devtools",
    "/media/image-resize?quality=80",
    "/paperwork",
    "/blog",
    "/privacy",
    "/contact",
    "/offline",
  ]) {
    const response = await proxy(
      request(path, {
        headers: { "accept-language": "ar", cookie: "NEXT_LOCALE=fr" },
      }),
    );
    expect(response.headers.get("x-middleware-rewrite")).toBe(`https://example.test/en${path === "/" ? "" : path}`);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("link")).toBeNull();
  }
});

test("explicit supported prefixes resolve without changing stable slugs or publishing blanket alternates", async () => {
  for (const locale of locales.filter((value) => value !== "en")) {
    const response = await proxy(request(`/${locale}/devtools/json-formatter?q=x%26y`));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-request-x-next-intl-locale")).toBe(locale);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("link")).toBeNull();
  }
  const english = await proxy(request("/en/devtools/json-formatter?q=x%26y"));
  expect(english.status).toBe(307);
  expect(english.headers.get("location")).toBe("https://example.test/devtools/json-formatter?q=x%26y");
});

test("public routes work on local and hosted preview origins without introducing another hostname", async () => {
  for (const origin of [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://canopy.vercel.app",
    "https://canopy.example.workers.dev",
  ]) {
    process.env.APP_URL = origin;
    const response = await proxy(
      request("/en/media", {
        origin,
        headers: { "x-forwarded-host": "evil.test", "x-forwarded-proto": "http" },
      }),
    );
    expect(response.headers.get("location")).toBe(`${origin}/media`);
  }
});

test.each([
  ["https://container:3000", "https://example.test"],
  ["https://container:3000", "https://canopy.example.workers.dev"],
  ["https://container:3000", "https://example.test:8443"],
  ["http://container:3000", "http://localhost:8787"],
  ["http://localhost:3000", "http://localhost:3000"],
  ["https://[::1]:3000", "https://[::1]"],
])("locale redirects replace the internal origin %s with the public host from %s", async (internal, publicOrigin) => {
  process.env.APP_URL = publicOrigin;
  const response = await proxy(
    request("/en/devtools?input=x%26y", {
      origin: internal,
      headers: {
        host: new URL(publicOrigin).host,
        "x-forwarded-host": "evil.test:9999",
        "x-forwarded-port": "9999",
      },
    }),
  );
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe(`${publicOrigin}/devtools?input=x%26y`);
});

test("account, APIs, metadata and browser assets are never locale rewritten", async () => {
  for (const path of [
    "/auth/sign-in",
    "/account/suspended",
    "/api/tools",
    "/robots.txt",
    "/sitemap.xml",
    "/manifest.webmanifest",
    "/blog/feed.xml",
    "/media/vendor/qpdf.js",
    "/media/licenses/qpdf.txt",
    "/tool-icons/tool.svg",
    "/sw.js",
  ]) {
    const response = await proxy(request(path));
    expect(response.headers.get("x-middleware-next"), path).toBe("1");
    expect(response.headers.get("x-middleware-rewrite"), path).toBeNull();
  }
  for (const path of ["/fr/auth/sign-in", "/fr/api/tools", "/fr/admin/users", "/xx/devtools"]) {
    const response = await proxy(request(path));
    expect(response.headers.get("x-middleware-rewrite"), path).toBeNull();
    expect(response.headers.get("location"), path).toBeNull();
  }
});

test("public Server Actions keep their method while English is internally rewritten", async () => {
  const response = await proxy(request("/contact", { method: "POST", headers: { "next-action": "action-id" } }));
  expect(response.headers.get("x-middleware-rewrite")).toBe("https://example.test/en/contact");
  expect(response.headers.get("location")).toBeNull();
});

test("suspended account enforcement precedes localization for reads and mutations", async () => {
  account.session = { user: { status: "suspended" } };
  const headers = { cookie: "smarttools.session_token=token" };
  const reading = await proxy(request("/ar/media", { headers }));
  expect(reading.status).toBe(303);
  expect(reading.headers.get("location")).toBe("https://example.test/account/suspended");
  expect(reading.headers.get("x-middleware-rewrite")).toBeNull();
  const mutation = await proxy(request("/fr/contact", { method: "POST", headers }));
  expect(mutation.status).toBe(403);
  expect((await mutation.json()).code).toBe("ACCOUNT_SUSPENDED");
});

test("plain links change only public page locales and preserve query, hash, slugs and private targets", () => {
  expect(localizeHref("/devtools/json-formatter?input=x%26y#result", "hi")).toBe(
    "/hi/devtools/json-formatter?input=x%26y#result",
  );
  expect(localizeHref("/hi/devtools/json-formatter", "fr")).toBe("/fr/devtools/json-formatter");
  expect(localizeHref("/fr/devtools/json-formatter", "en")).toBe("/devtools/json-formatter");
  expect(localizeHref("/", "ar")).toBe("/ar");
  expect(localizeHref("/ar", "en")).toBe("/");
  for (const target of [
    "/api/tools",
    "/auth/sign-in",
    "/admin/tools",
    "/account/suspended",
    "/logo.svg",
    "/media/vendor/qpdf.js",
    "/blog/feed.xml",
    "//example.com/blog",
    "https://example.com/blog",
    "#result",
    "mailto:help@example.com",
  ]) {
    expect(localizeHref(target, "ar"), target).toBe(target);
  }
  expect(isLocale("zh-Hans")).toBe(true);
  expect(isLocale("zh")).toBe(false);
  expect(direction("ar")).toBe("rtl");
  expect(direction("hi")).toBe("ltr");
});
