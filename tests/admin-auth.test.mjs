import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { memoryAdapter } from "better-auth/adapters/memory";

const environment = {
  NODE_ENV: "test",
  APP_URL: "https://smarttools.test",
  AUTH_COOKIE_PREFIX: "",
  BETTER_AUTH_SECRET: "admin-origin-test-secret-at-least-32-characters",
  GOOGLE_CLIENT_ID: "test-google-client",
  GOOGLE_CLIENT_SECRET: "test-google-secret",
};
const adminOrigin = "https://admin.smarttools.test";
const originalEnv = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
Object.assign(process.env, environment);
const state = {
  sent: [],
  session: null,
  denied: false,
  adapter: memoryAdapter({ authUser: [], authSession: [], authAccount: [], authVerification: [] }),
};
globalThis.__adminAuthTest = state;
const authUrl = new URL("../lib/auth/auth.ts", import.meta.url).href;
const returnToUrl = new URL("../app/auth/_lib/returnTo.ts", import.meta.url).href;
const accessUrl = new URL("../lib/admin/access.ts", import.meta.url).href;
const routingUrl = new URL("../lib/routing/subdomains.ts", import.meta.url).href;
const subdomainConfigUrl = new URL("../lib/config/subdomains.ts", import.meta.url).href;
const secondSubdomainQuery = "?second-subdomain";
const mocks = {
  "../authorization/index.ts": "export const assertCanDeleteUser = () => {};",
  "../../db/index.ts": `
    export const authAccount = {}, authSession = {}, authUser = {}, authVerification = {}, userRolesTable = {};
    export const and = () => {}, countDistinct = () => {}, eq = () => {};
    export const db = { insert: () => ({ values: () => ({ onConflictDoNothing: async () => {} }) }) };
  `,
  "better-auth/adapters/drizzle": "export const drizzleAdapter = () => globalThis.__adminAuthTest.adapter;",
  "./cachedUserAdapter.ts": "export const cachedUserAdapter = (adapter) => adapter;",
  "./email.ts": "export const sendAuthEmail = async (message) => globalThis.__adminAuthTest.sent.push(message);",
};
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (
      context.parentURL?.endsWith(secondSubdomainQuery) &&
      ["../routing/subdomains.ts", "@/lib/routing/subdomains.ts"].includes(specifier)
    )
      return { shortCircuit: true, url: routingUrl + secondSubdomainQuery };
    if (context.parentURL === routingUrl + secondSubdomainQuery && specifier === "../config/subdomains.ts") {
      const fixture = `
        export * from ${JSON.stringify(subdomainConfigUrl)};
        export const SUBDOMAINS = {
          admin: { routePrefix: "/admin", indexable: false },
          billing: { routePrefix: "/billing", indexable: false },
        };
      `;
      return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(fixture)}` };
    }
    let source = context.parentURL?.startsWith(authUrl) ? mocks[specifier] : undefined;
    if (context.parentURL === accessUrl) {
      if (specifier === "../auth/session.ts")
        source = "export const getSession = async () => globalThis.__adminAuthTest.session;";
      if (specifier === "next/headers") source = "export const headers = async () => new Headers();";
      if (specifier === "next/navigation")
        source = 'export function redirect(location){throw Object.assign(new Error("REDIRECT"), {location});}';
      if (specifier === "./index.ts")
        source = `
        export class AuthorizationError extends Error {};
        export async function requirePermission() { if (globalThis.__adminAuthTest.denied) throw new AuthorizationError(); }
      `;
    }
    if (source !== undefined) {
      return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` };
    }
    if (context.parentURL?.startsWith(returnToUrl) && specifier.startsWith("@/")) {
      return { shortCircuit: true, url: new URL(`../${specifier.slice(2)}`, import.meta.url).href };
    }
    return next(specifier, context);
  },
});
const { auth } = await import(authUrl);
const { resolveConfiguredReturnTo } = await import(returnToUrl);
const { getActorUserId, requirePagePermission } = await import(accessUrl);
test.after(() => {
  hooks.deregister();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete globalThis.__adminAuthTest;
});

function request(origin, path, body, extraHeaders = {}) {
  return new Request(`${origin}/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, host: new URL(origin).host, ...extraHeaders },
    body: JSON.stringify(body),
  });
}

test("Google callbacks use the exact main or admin host and ignore forwarded host spoofing", async () => {
  for (const origin of [environment.APP_URL, adminOrigin]) {
    const response = await auth.handler(
      request(origin, "/sign-in/social", { provider: "google", callbackURL: "/", disableRedirect: true }),
    );
    assert.equal(response.status, 200);
    assert.equal(
      new URL((await response.json()).url).searchParams.get("redirect_uri"),
      `${origin}/api/auth/callback/google`,
    );
  }
  const response = await auth.handler(
    request(
      adminOrigin,
      "/sign-in/social",
      { provider: "google", callbackURL: "/" },
      {
        "x-forwarded-host": "evil.test",
        "x-forwarded-proto": "http",
      },
    ),
  );
  assert.equal(response.status, 200);
  assert.equal(
    new URL((await response.json()).url).searchParams.get("redirect_uri"),
    `${adminOrigin}/api/auth/callback/google`,
  );
});

test("admin verification and recovery stay on admin while one session and logout work on both hosts", async () => {
  const origin = adminOrigin;
  const email = "admin-origin@example.test";
  const password = "admin-origin-password-123";
  const signup = await auth.handler(
    request(origin, "/sign-up/email", { name: "Admin", email, password, callbackURL: "/users" }),
  );
  assert.equal(signup.status, 200);
  const verification = new URL(state.sent.shift().actionUrl);
  assert.equal(verification.origin, origin);
  assert.equal(verification.searchParams.get("callbackURL"), "/users");
  const verified = await auth.handler(new Request(verification, { headers: { host: new URL(origin).host } }));
  assert.equal(verified.status, 302);
  assert.equal(verified.headers.get("location"), "/users");

  const signin = await auth.handler(request(origin, "/sign-in/email", { email, password, callbackURL: "/users" }));
  assert.equal(signin.status, 200);
  const cookies = signin.headers.getSetCookie();
  assert.ok(cookies.some((cookie) => cookie.includes("smarttools.session_token=")));
  assert.ok(cookies.every((cookie) => /;\s*domain=smarttools\.test(?:;|$)/i.test(cookie)));
  const cookie = cookies.map((value) => value.split(";")[0]).join("; ");
  for (const sessionOrigin of [environment.APP_URL, origin]) {
    const session = await auth.handler(
      new Request(`${sessionOrigin}/api/auth/get-session`, {
        headers: { host: new URL(sessionOrigin).host, cookie },
      }),
    );
    assert.equal((await session.json()).user.email, email);
  }

  const recovery = await auth.handler(
    request(origin, "/request-password-reset", {
      email,
      redirectTo: "/auth/reset-password?returnTo=%2Fusers",
    }),
  );
  assert.equal(recovery.status, 200);
  const recoveryUrl = new URL(state.sent.shift().actionUrl);
  assert.equal(recoveryUrl.origin, origin);
  assert.equal(recoveryUrl.searchParams.get("callbackURL"), "/auth/reset-password?returnTo=%2Fusers");

  const logout = await auth.handler(request(environment.APP_URL, "/sign-out", {}, { cookie }));
  assert.equal(logout.status, 200);
  for (const sessionOrigin of [environment.APP_URL, origin]) {
    const session = await auth.handler(
      new Request(`${sessionOrigin}/api/auth/get-session`, {
        headers: { host: new URL(sessionOrigin).host, cookie },
      }),
    );
    assert.equal(await session.json(), null);
  }
});

test("a configured cookie prefix supports shared login and logout from either host", async (t) => {
  const previousPrefix = process.env.AUTH_COOKIE_PREFIX;
  t.after(() => {
    if (previousPrefix === undefined) delete process.env.AUTH_COOKIE_PREFIX;
    else process.env.AUTH_COOKIE_PREFIX = previousPrefix;
  });
  process.env.AUTH_COOKIE_PREFIX = "  canopy-auth  ";
  const { auth: customAuth } = await import(`${authUrl}?custom-cookie-prefix`);
  const origins = [environment.APP_URL, adminOrigin];
  const email = "custom-prefix@example.test";
  const password = "custom-prefix-password-123";
  const signup = await customAuth.handler(
    request(environment.APP_URL, "/sign-up/email", { name: "Custom Prefix", email, password }),
  );
  assert.equal(signup.status, 200);
  const verification = new URL(state.sent.pop().actionUrl);
  const verified = await customAuth.handler(
    new Request(verification, { headers: { host: new URL(environment.APP_URL).host } }),
  );
  assert.equal(verified.status, 302);

  for (const loginOrigin of origins) {
    const signin = await customAuth.handler(
      request(loginOrigin, "/sign-in/email", {
        email,
        password,
        callbackURL: "/",
      }),
    );
    assert.equal(signin.status, 200);
    const cookies = signin.headers.getSetCookie();
    assert.ok(cookies.some((cookie) => cookie.startsWith("canopy-auth.session_token=")));
    assert.ok(cookies.every((cookie) => cookie.startsWith("canopy-auth.")));
    assert.ok(cookies.every((cookie) => /;\s*domain=smarttools\.test(?:;|$)/i.test(cookie)));
    const cookie = cookies.map((value) => value.split(";")[0]).join("; ");
    for (const sessionOrigin of origins) {
      const session = await customAuth.handler(
        new Request(`${sessionOrigin}/api/auth/get-session`, {
          headers: { host: new URL(sessionOrigin).host, cookie },
        }),
      );
      assert.equal((await session.json()).user.email, email);
    }

    const logoutOrigin = origins.find((origin) => origin !== loginOrigin);
    const logout = await customAuth.handler(request(logoutOrigin, "/sign-out", {}, { cookie }));
    assert.equal(logout.status, 200);
    assert.ok(
      logout.headers
        .getSetCookie()
        .some((cookie) => cookie.startsWith("canopy-auth.session_token=;") && /;\s*Max-Age=0(?:;|$)/i.test(cookie)),
    );
    for (const sessionOrigin of origins) {
      const session = await customAuth.handler(
        new Request(`${sessionOrigin}/api/auth/get-session`, {
          headers: { host: new URL(sessionOrigin).host, cookie },
        }),
      );
      assert.equal(await session.json(), null);
    }
  }
});

test("another registered subdomain receives auth callbacks, shared sessions, and canonical return destinations", async () => {
  const billingOrigin = "https://billing.smarttools.test";
  const { auth: multiSubdomainAuth } = await import(authUrl + secondSubdomainQuery);
  const { resolveConfiguredReturnTo: resolveMultiReturnTo } = await import(returnToUrl + secondSubdomainQuery);
  for (const [input, expected] of [
    ["/billing/invoices?paid=1", `${billingOrigin}/invoices?paid=1`],
    [`${environment.APP_URL}/billing/invoices`, `${billingOrigin}/invoices`],
    [`${billingOrigin}/invoices`, `${billingOrigin}/invoices`],
    ["/admin/users", `${adminOrigin}/users`],
    ["/billing/auth", "/"],
    [`${billingOrigin}/auth`, "/"],
    ["https://billing.smarttools.test.evil.test/invoices", "/"],
    ["https://unregistered.smarttools.test/invoices", "/"],
  ])
    assert.equal(resolveMultiReturnTo(input), expected, input);
  assert.equal(resolveConfiguredReturnTo(`${billingOrigin}/invoices`), "/", "the test registry stays isolated");

  const social = await multiSubdomainAuth.handler(
    request(
      billingOrigin,
      "/sign-in/social",
      {
        provider: "google",
        callbackURL: `${billingOrigin}/invoices`,
      },
      { "x-forwarded-host": "evil.test", "x-forwarded-proto": "http" },
    ),
  );
  assert.equal(social.status, 200);
  assert.equal(
    new URL((await social.json()).url).searchParams.get("redirect_uri"),
    `${billingOrigin}/api/auth/callback/google`,
  );
  const email = "billing-origin@example.test";
  const password = "billing-origin-password-123";
  const signup = await multiSubdomainAuth.handler(
    request(billingOrigin, "/sign-up/email", {
      name: "Billing",
      email,
      password,
      callbackURL: "/invoices",
    }),
  );
  assert.equal(signup.status, 200);
  const verification = new URL(state.sent.pop().actionUrl);
  assert.equal(verification.origin, billingOrigin);
  const verified = await multiSubdomainAuth.handler(
    new Request(verification, {
      headers: { host: new URL(billingOrigin).host },
    }),
  );
  assert.equal(verified.status, 302);
  assert.equal(verified.headers.get("location"), "/invoices");
  const signin = await multiSubdomainAuth.handler(request(billingOrigin, "/sign-in/email", { email, password }));
  assert.equal(signin.status, 200);
  const cookies = signin.headers.getSetCookie();
  assert.ok(cookies.some((cookie) => cookie.startsWith("smarttools.session_token=")));
  assert.ok(cookies.every((cookie) => /;\s*domain=smarttools\.test(?:;|$)/i.test(cookie)));
  const cookie = cookies.map((value) => value.split(";")[0]).join("; ");
  const origins = [environment.APP_URL, adminOrigin, billingOrigin];
  for (const origin of origins) {
    const session = await multiSubdomainAuth.handler(
      new Request(`${origin}/api/auth/get-session`, {
        headers: { host: new URL(origin).host, cookie },
      }),
    );
    assert.equal((await session.json()).user.email, email);
  }
  const untrusted = await multiSubdomainAuth.handler(
    request(
      billingOrigin,
      "/sign-in/social",
      {
        provider: "google",
        callbackURL: "/",
      },
      { cookie, origin: "https://unregistered.smarttools.test" },
    ),
  );
  assert.equal(untrusted.status, 403);
  const logout = await multiSubdomainAuth.handler(request(environment.APP_URL, "/sign-out", {}, { cookie }));
  assert.equal(logout.status, 200);
  for (const origin of origins) {
    const session = await multiSubdomainAuth.handler(
      new Request(`${origin}/api/auth/get-session`, {
        headers: { host: new URL(origin).host, cookie },
      }),
    );
    assert.equal(await session.json(), null);
  }
});

test("production shares secure cookies and logout across hosts with the configured prefix", async (t) => {
  const previousEnvironment = process.env.NODE_ENV;
  const previousPrefix = process.env.AUTH_COOKIE_PREFIX;
  t.after(() => {
    process.env.NODE_ENV = previousEnvironment;
    if (previousPrefix === undefined) delete process.env.AUTH_COOKIE_PREFIX;
    else process.env.AUTH_COOKIE_PREFIX = previousPrefix;
  });
  process.env.NODE_ENV = "production";
  const origins = [environment.APP_URL, adminOrigin];
  for (const configuredPrefix of ["", "canopy-auth"]) {
    process.env.AUTH_COOKIE_PREFIX = configuredPrefix;
    const prefix = configuredPrefix || "smarttools";
    const { auth: productionAuth } = await import(`${authUrl}?production-prefix=${prefix}`);
    for (const loginOrigin of origins) {
      const signin = await productionAuth.handler(
        request(loginOrigin, "/sign-in/email", {
          email: "admin-origin@example.test",
          password: "admin-origin-password-123",
        }),
      );
      assert.equal(signin.status, 200);
      const cookies = signin.headers.getSetCookie();
      assert.ok(cookies.some((cookie) => cookie.startsWith(`__Secure-${prefix}.session_token=`)));
      for (const cookie of cookies) {
        assert.ok(cookie.startsWith(`__Secure-${prefix}.`));
        const attributes = cookie.split(/;\s*/);
        for (const attribute of ["Domain=smarttools.test", "Path=/", "Secure", "HttpOnly", "SameSite=Lax"])
          assert.ok(attributes.includes(attribute), attribute);
      }
      const cookie = cookies.map((value) => value.split(";")[0]).join("; ");
      for (const sessionOrigin of origins) {
        const session = await productionAuth.api.getSession({
          headers: new Headers({ host: new URL(sessionOrigin).host, cookie }),
        });
        assert.equal(session.user.email, "admin-origin@example.test");
      }
      const logoutOrigin = origins.find((origin) => origin !== loginOrigin);
      const logout = await productionAuth.handler(request(logoutOrigin, "/sign-out", {}, { cookie }));
      assert.equal(logout.status, 200);
      assert.ok(
        logout.headers.getSetCookie().some((value) => {
          const attributes = value.split(/;\s*/);
          return (
            value.startsWith(`__Secure-${prefix}.session_token=;`) &&
            attributes.includes("Domain=smarttools.test") &&
            attributes.includes("Max-Age=0")
          );
        }),
      );
      for (const sessionOrigin of origins) {
        const session = await productionAuth.api.getSession({
          headers: new Headers({ host: new URL(sessionOrigin).host, cookie }),
        });
        assert.equal(session, null);
      }
    }
  }
});

test("untrusted callback origins and origin headers remain rejected", async () => {
  for (const [callbackURL, origin] of [
    ["https://evil.test/", adminOrigin],
    ["https://admin.smarttools.test.evil.test/", adminOrigin],
    ["/", "https://evil.test"],
  ]) {
    const response = await auth.handler(
      request(
        adminOrigin,
        "/sign-in/social",
        {
          provider: "google",
          callbackURL,
        },
        { origin, cookie: "smarttools.session_token=csrf-check" },
      ),
    );
    assert.equal(response.status, 403);
  }
});

test("post-auth destinations support clean admin paths and preserve the public app", () => {
  for (const [input, expected] of [
    ["/users?search=anna", "/users?search=anna"],
    ["/admin", `${adminOrigin}/`],
    ["/admin/users?search=anna", `${adminOrigin}/users?search=anna`],
    [`${environment.APP_URL}/admin/tools`, `${adminOrigin}/tools`],
    [`${adminOrigin}/users`, `${adminOrigin}/users`],
    [`${adminOrigin}/admin/users`, `${adminOrigin}/users`],
    ["/devtools", "/devtools"],
    [`${environment.APP_URL}/media`, `${environment.APP_URL}/media`],
    ["https://evil.test/", "/"],
    ["//evil.test/", "/"],
    [`${adminOrigin}/auth?mode=forgot`, "/"],
  ])
    assert.equal(resolveConfiguredReturnTo(input), expected, input);
});

test("admin permission guards retain sign-in and denial behavior with clean destinations", async () => {
  for (const operation of [getActorUserId, () => requirePagePermission("users", "read")]) {
    await assert.rejects(operation(), (error) => {
      const destination = new URL(error.location);
      return (
        destination.origin === adminOrigin &&
        destination.pathname === "/auth" &&
        destination.searchParams.get("returnTo") === `${adminOrigin}/`
      );
    });
  }
  state.session = { user: { id: "admin-1" } };
  assert.equal(await getActorUserId(), "admin-1");
  assert.equal(await requirePagePermission("users", "read"), state.session);
  state.denied = true;
  await assert.rejects(requirePagePermission("users", "read"), (error) => error.location === `${adminOrigin}/denied`);
});

test("signed-out visitors to named localhost admin routes are sent to sign-in on the admin host", async (t) => {
  const previousAppUrl = process.env.APP_URL;
  const previousSession = state.session;
  t.after(() => {
    if (previousAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousAppUrl;
    state.session = previousSession;
  });
  process.env.APP_URL = "http://smarttools.localhost:3000";
  state.session = null;
  for (const operation of [getActorUserId, () => requirePagePermission("admin", "enter")]) {
    await assert.rejects(operation(), (error) => {
      const destination = new URL(error.location);
      return (
        destination.origin === "http://admin.smarttools.localhost:3000" &&
        destination.pathname === "/auth" &&
        destination.searchParams.get("returnTo") === "http://admin.smarttools.localhost:3000/"
      );
    });
  }
});

test("invalid application origins are rejected before configuring authentication", async (t) => {
  t.after(() => {
    process.env.APP_URL = environment.APP_URL;
  });
  for (const appUrl of [
    "https://user:password@smarttools.test",
    "https://smarttools.test/path",
    "https://smarttools.test?query=1",
    "https://smarttools.test#fragment",
    "ftp://smarttools.test",
    "http://smarttools.test",
    "invalid",
  ]) {
    process.env.APP_URL = appUrl;
    await assert.rejects(import(`${authUrl}?invalid=${encodeURIComponent(appUrl)}`), /APP_URL/);
  }
});

test("www and named localhost applications derive the admin host and share the parent cookie", async (t) => {
  t.after(() => {
    process.env.APP_URL = environment.APP_URL;
  });
  for (const [appUrl, expectedAdminOrigin, expectedCookieDomain] of [
    ["https://www.smarttools.test", "https://admin.smarttools.test", "smarttools.test"],
    ["http://smarttools.localhost:3000", "http://admin.smarttools.localhost:3000", "smarttools.localhost"],
  ]) {
    process.env.APP_URL = appUrl;
    const { auth: configuredAuth } = await import(`${authUrl}?derived=${encodeURIComponent(appUrl)}`);
    assert.equal(resolveConfiguredReturnTo("/admin/users"), `${expectedAdminOrigin}/users`);
    const response = await configuredAuth.handler(
      request(expectedAdminOrigin, "/sign-in/social", { provider: "google", callbackURL: "/" }),
    );
    assert.equal(response.status, 200);
    assert.equal(
      new URL((await response.json()).url).searchParams.get("redirect_uri"),
      `${expectedAdminOrigin}/api/auth/callback/google`,
    );
    const login = await configuredAuth.handler(
      request(expectedAdminOrigin, "/sign-in/email", {
        email: "admin-origin@example.test",
        password: "admin-origin-password-123",
      }),
    );
    assert.equal(login.status, 200);
    const cookies = login.headers.getSetCookie();
    assert.ok(cookies.some((cookie) => cookie.startsWith("smarttools.session_token=")));
    assert.ok(cookies.every((cookie) => cookie.split(/;\s*/).includes(`Domain=${expectedCookieDomain}`)));
    const cookie = cookies.map((value) => value.split(";")[0]).join("; ");
    for (const sessionOrigin of [appUrl, expectedAdminOrigin]) {
      const session = await configuredAuth.handler(
        new Request(`${sessionOrigin}/api/auth/get-session`, {
          headers: { host: new URL(sessionOrigin).host, cookie },
        }),
      );
      assert.equal((await session.json()).user.email, "admin-origin@example.test");
    }
  }
});

test("IP and Vercel URLs keep same-host cookies and existing admin paths", async (t) => {
  const previousSession = state.session;
  state.session = null;
  t.after(() => {
    process.env.APP_URL = environment.APP_URL;
    state.session = previousSession;
  });
  for (const appUrl of ["http://127.0.0.1:3000", "http://[::1]:3000", "https://canopy-preview.vercel.app"]) {
    process.env.APP_URL = appUrl;
    for (const operation of [getActorUserId, () => requirePagePermission("users", "read")]) {
      await assert.rejects(operation(), (error) => error.location === "/auth?returnTo=%2Fadmin");
    }
    const { auth: singleHostAuth } = await import(`${authUrl}?single-host=${encodeURIComponent(appUrl)}`);
    assert.equal(resolveConfiguredReturnTo("/admin/users"), "/admin/users");
    assert.equal(resolveConfiguredReturnTo(`${adminOrigin}/users`), "/");
    const social = await singleHostAuth.handler(
      request(appUrl, "/sign-in/social", { provider: "google", callbackURL: "/admin" }),
    );
    assert.equal(social.status, 200);
    assert.equal(
      new URL((await social.json()).url).searchParams.get("redirect_uri"),
      `${appUrl}/api/auth/callback/google`,
    );
    const login = await singleHostAuth.handler(
      request(appUrl, "/sign-in/email", {
        email: "admin-origin@example.test",
        password: "admin-origin-password-123",
      }),
    );
    assert.equal(login.status, 200);
    const cookies = login.headers.getSetCookie();
    assert.ok(cookies.some((cookie) => cookie.startsWith("smarttools.session_token=")));
    assert.ok(cookies.every((cookie) => !/;\s*domain=/i.test(cookie)));
    const cookie = cookies.map((value) => value.split(";")[0]).join("; ");
    const sessionRequest = () =>
      new Request(`${appUrl}/api/auth/get-session`, {
        headers: { host: new URL(appUrl).host, cookie },
      });
    assert.equal(
      (await (await singleHostAuth.handler(sessionRequest())).json()).user.email,
      "admin-origin@example.test",
    );
    const logout = await singleHostAuth.handler(request(appUrl, "/sign-out", {}, { cookie }));
    assert.equal(logout.status, 200);
    assert.equal(await (await singleHostAuth.handler(sessionRequest())).json(), null);
  }
});
