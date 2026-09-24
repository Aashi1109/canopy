import { memoryAdapter } from "better-auth/adapters/memory";
import { afterAll, expect, onTestFinished, test, vi } from "vitest";

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

// auth.ts dependencies (apply to every auth.ts?query variant by module id).
vi.mock("@/lib/authorization/index.ts", () => ({ assertCanDeleteUser: () => {} }));
vi.mock("@/db/index.ts", () => ({
  authAccount: {},
  authSession: {},
  authUser: {},
  authVerification: {},
  userRolesTable: {},
  and: () => {},
  countDistinct: () => {},
  eq: () => {},
  db: { insert: () => ({ values: () => ({ onConflictDoNothing: async () => {} }) }) },
}));
vi.mock("better-auth/adapters/drizzle", () => ({ drizzleAdapter: () => globalThis.__adminAuthTest.adapter }));
vi.mock("@/lib/auth/cachedUserAdapter.ts", () => ({ cachedUserAdapter: (adapter) => adapter }));
vi.mock("@/lib/auth/email.ts", () => ({
  sendAuthEmail: async (message) => globalThis.__adminAuthTest.sent.push(message),
}));
// access.ts dependencies.
vi.mock("@/lib/auth/session.ts", () => ({ getSession: async () => globalThis.__adminAuthTest.session }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect(location) {
    throw Object.assign(new Error("REDIRECT"), { location });
  },
}));
vi.mock("@/lib/admin/index.ts", () => {
  class AuthorizationError extends Error {}
  return {
    AuthorizationError,
    requirePermission: async () => {
      if (globalThis.__adminAuthTest.denied) throw new AuthorizationError();
    },
  };
});

const { auth } = await import("@/lib/auth/auth.ts");
const { resolveConfiguredReturnTo } = await import("@/app/auth/_lib/returnTo.ts");
const { getActorUserId, requirePagePermission } = await import("@/lib/admin/access.ts");
afterAll(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete globalThis.__adminAuthTest;
});

// Vite cannot statically analyze a dynamic import with a variable query string,
// so fresh env-bound auth instances come from resetModules + the literal specifier.
async function freshAuth() {
  vi.resetModules();
  return (await import("@/lib/auth/auth.ts")).auth;
}

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
    expect(response.status).toBe(200);
    expect(new URL((await response.json()).url).searchParams.get("redirect_uri")).toBe(
      `${origin}/api/auth/callback/google`,
    );
  }
  const response = await auth.handler(
    request(
      adminOrigin,
      "/sign-in/social",
      { provider: "google", callbackURL: "/" },
      { "x-forwarded-host": "evil.test", "x-forwarded-proto": "http" },
    ),
  );
  expect(response.status).toBe(200);
  expect(new URL((await response.json()).url).searchParams.get("redirect_uri")).toBe(
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
  expect(signup.status).toBe(200);
  const verification = new URL(state.sent.shift().actionUrl);
  expect(verification.origin).toBe(origin);
  expect(verification.searchParams.get("callbackURL")).toBe("/users");
  const verified = await auth.handler(new Request(verification, { headers: { host: new URL(origin).host } }));
  expect(verified.status).toBe(302);
  expect(verified.headers.get("location")).toBe("/users");

  const signin = await auth.handler(request(origin, "/sign-in/email", { email, password, callbackURL: "/users" }));
  expect(signin.status).toBe(200);
  const cookies = signin.headers.getSetCookie();
  expect(cookies.some((cookie) => cookie.includes("smarttools.session_token="))).toBeTruthy();
  expect(cookies.every((cookie) => /;\s*domain=smarttools\.test(?:;|$)/i.test(cookie))).toBeTruthy();
  const cookie = cookies.map((value) => value.split(";")[0]).join("; ");
  for (const sessionOrigin of [environment.APP_URL, origin]) {
    const session = await auth.handler(
      new Request(`${sessionOrigin}/api/auth/get-session`, {
        headers: { host: new URL(sessionOrigin).host, cookie },
      }),
    );
    expect((await session.json()).user.email).toBe(email);
  }

  const recovery = await auth.handler(
    request(origin, "/request-password-reset", {
      email,
      redirectTo: "/auth/reset-password?returnTo=%2Fusers",
    }),
  );
  expect(recovery.status).toBe(200);
  const recoveryUrl = new URL(state.sent.shift().actionUrl);
  expect(recoveryUrl.origin).toBe(origin);
  expect(recoveryUrl.searchParams.get("callbackURL")).toBe("/auth/reset-password?returnTo=%2Fusers");

  const logout = await auth.handler(request(environment.APP_URL, "/sign-out", {}, { cookie }));
  expect(logout.status).toBe(200);
  for (const sessionOrigin of [environment.APP_URL, origin]) {
    const session = await auth.handler(
      new Request(`${sessionOrigin}/api/auth/get-session`, {
        headers: { host: new URL(sessionOrigin).host, cookie },
      }),
    );
    expect(await session.json()).toBe(null);
  }
});

test("a configured cookie prefix supports shared login and logout from either host", async () => {
  const previousPrefix = process.env.AUTH_COOKIE_PREFIX;
  onTestFinished(() => {
    if (previousPrefix === undefined) delete process.env.AUTH_COOKIE_PREFIX;
    else process.env.AUTH_COOKIE_PREFIX = previousPrefix;
  });
  process.env.AUTH_COOKIE_PREFIX = "  canopy-auth  ";
  const { auth: customAuth } = await import("@/lib/auth/auth.ts?custom-cookie-prefix");
  const origins = [environment.APP_URL, adminOrigin];
  const email = "custom-prefix@example.test";
  const password = "custom-prefix-password-123";
  const signup = await customAuth.handler(
    request(environment.APP_URL, "/sign-up/email", { name: "Custom Prefix", email, password }),
  );
  expect(signup.status).toBe(200);
  const verification = new URL(state.sent.pop().actionUrl);
  const verified = await customAuth.handler(
    new Request(verification, { headers: { host: new URL(environment.APP_URL).host } }),
  );
  expect(verified.status).toBe(302);

  for (const loginOrigin of origins) {
    const signin = await customAuth.handler(
      request(loginOrigin, "/sign-in/email", { email, password, callbackURL: "/" }),
    );
    expect(signin.status).toBe(200);
    const cookies = signin.headers.getSetCookie();
    expect(cookies.some((cookie) => cookie.startsWith("canopy-auth.session_token="))).toBeTruthy();
    expect(cookies.every((cookie) => cookie.startsWith("canopy-auth."))).toBeTruthy();
    expect(cookies.every((cookie) => /;\s*domain=smarttools\.test(?:;|$)/i.test(cookie))).toBeTruthy();
    const cookie = cookies.map((value) => value.split(";")[0]).join("; ");
    for (const sessionOrigin of origins) {
      const session = await customAuth.handler(
        new Request(`${sessionOrigin}/api/auth/get-session`, {
          headers: { host: new URL(sessionOrigin).host, cookie },
        }),
      );
      expect((await session.json()).user.email).toBe(email);
    }

    const logoutOrigin = origins.find((origin) => origin !== loginOrigin);
    const logout = await customAuth.handler(request(logoutOrigin, "/sign-out", {}, { cookie }));
    expect(logout.status).toBe(200);
    expect(
      logout.headers
        .getSetCookie()
        .some((cookie) => cookie.startsWith("canopy-auth.session_token=;") && /;\s*Max-Age=0(?:;|$)/i.test(cookie)),
    ).toBeTruthy();
    for (const sessionOrigin of origins) {
      const session = await customAuth.handler(
        new Request(`${sessionOrigin}/api/auth/get-session`, {
          headers: { host: new URL(sessionOrigin).host, cookie },
        }),
      );
      expect(await session.json()).toBe(null);
    }
  }
});

test("another registered subdomain receives auth callbacks, shared sessions, and canonical return destinations", async () => {
  const billingOrigin = "https://billing.smarttools.test";
  // Scope the expanded subdomain registry to this test's fresh module graph only.
  vi.resetModules();
  vi.doMock("@/lib/config/subdomains.ts", async (importOriginal) => ({
    ...(await importOriginal()),
    SUBDOMAINS: {
      admin: { routePrefix: "/admin", indexable: false },
      billing: { routePrefix: "/billing", indexable: false },
    },
  }));
  onTestFinished(() => {
    vi.doUnmock("@/lib/config/subdomains.ts");
    vi.resetModules();
  });
  const { auth: multiSubdomainAuth } = await import("@/lib/auth/auth.ts?second-subdomain");
  const { resolveConfiguredReturnTo: resolveMultiReturnTo } =
    await import("@/app/auth/_lib/returnTo.ts?second-subdomain");
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
    expect(resolveMultiReturnTo(input), input).toBe(expected);
  expect(resolveConfiguredReturnTo(`${billingOrigin}/invoices`), "the test registry stays isolated").toBe("/");

  const social = await multiSubdomainAuth.handler(
    request(
      billingOrigin,
      "/sign-in/social",
      { provider: "google", callbackURL: `${billingOrigin}/invoices` },
      { "x-forwarded-host": "evil.test", "x-forwarded-proto": "http" },
    ),
  );
  expect(social.status).toBe(200);
  expect(new URL((await social.json()).url).searchParams.get("redirect_uri")).toBe(
    `${billingOrigin}/api/auth/callback/google`,
  );
  const email = "billing-origin@example.test";
  const password = "billing-origin-password-123";
  const signup = await multiSubdomainAuth.handler(
    request(billingOrigin, "/sign-up/email", { name: "Billing", email, password, callbackURL: "/invoices" }),
  );
  expect(signup.status).toBe(200);
  const verification = new URL(state.sent.pop().actionUrl);
  expect(verification.origin).toBe(billingOrigin);
  const verified = await multiSubdomainAuth.handler(
    new Request(verification, { headers: { host: new URL(billingOrigin).host } }),
  );
  expect(verified.status).toBe(302);
  expect(verified.headers.get("location")).toBe("/invoices");
  const signin = await multiSubdomainAuth.handler(request(billingOrigin, "/sign-in/email", { email, password }));
  expect(signin.status).toBe(200);
  const cookies = signin.headers.getSetCookie();
  expect(cookies.some((cookie) => cookie.startsWith("smarttools.session_token="))).toBeTruthy();
  expect(cookies.every((cookie) => /;\s*domain=smarttools\.test(?:;|$)/i.test(cookie))).toBeTruthy();
  const cookie = cookies.map((value) => value.split(";")[0]).join("; ");
  const origins = [environment.APP_URL, adminOrigin, billingOrigin];
  for (const origin of origins) {
    const session = await multiSubdomainAuth.handler(
      new Request(`${origin}/api/auth/get-session`, { headers: { host: new URL(origin).host, cookie } }),
    );
    expect((await session.json()).user.email).toBe(email);
  }
  const untrusted = await multiSubdomainAuth.handler(
    request(
      billingOrigin,
      "/sign-in/social",
      { provider: "google", callbackURL: "/" },
      { cookie, origin: "https://unregistered.smarttools.test" },
    ),
  );
  expect(untrusted.status).toBe(403);
  const logout = await multiSubdomainAuth.handler(request(environment.APP_URL, "/sign-out", {}, { cookie }));
  expect(logout.status).toBe(200);
  for (const origin of origins) {
    const session = await multiSubdomainAuth.handler(
      new Request(`${origin}/api/auth/get-session`, { headers: { host: new URL(origin).host, cookie } }),
    );
    expect(await session.json()).toBe(null);
  }
});

test("production shares secure cookies and logout across hosts with the configured prefix", async () => {
  const previousEnvironment = process.env.NODE_ENV;
  const previousPrefix = process.env.AUTH_COOKIE_PREFIX;
  onTestFinished(() => {
    process.env.NODE_ENV = previousEnvironment;
    if (previousPrefix === undefined) delete process.env.AUTH_COOKIE_PREFIX;
    else process.env.AUTH_COOKIE_PREFIX = previousPrefix;
  });
  process.env.NODE_ENV = "production";
  const origins = [environment.APP_URL, adminOrigin];
  for (const configuredPrefix of ["", "canopy-auth"]) {
    process.env.AUTH_COOKIE_PREFIX = configuredPrefix;
    const prefix = configuredPrefix || "smarttools";
    const productionAuth = await freshAuth();
    for (const loginOrigin of origins) {
      const signin = await productionAuth.handler(
        request(loginOrigin, "/sign-in/email", {
          email: "admin-origin@example.test",
          password: "admin-origin-password-123",
        }),
      );
      expect(signin.status).toBe(200);
      const cookies = signin.headers.getSetCookie();
      expect(cookies.some((cookie) => cookie.startsWith(`__Secure-${prefix}.session_token=`))).toBeTruthy();
      for (const cookie of cookies) {
        expect(cookie.startsWith(`__Secure-${prefix}.`)).toBeTruthy();
        const attributes = cookie.split(/;\s*/);
        for (const attribute of ["Domain=smarttools.test", "Path=/", "Secure", "HttpOnly", "SameSite=Lax"])
          expect(attributes.includes(attribute), attribute).toBeTruthy();
      }
      const cookie = cookies.map((value) => value.split(";")[0]).join("; ");
      for (const sessionOrigin of origins) {
        const session = await productionAuth.api.getSession({
          headers: new Headers({ host: new URL(sessionOrigin).host, cookie }),
        });
        expect(session.user.email).toBe("admin-origin@example.test");
      }
      const logoutOrigin = origins.find((origin) => origin !== loginOrigin);
      const logout = await productionAuth.handler(request(logoutOrigin, "/sign-out", {}, { cookie }));
      expect(logout.status).toBe(200);
      expect(
        logout.headers.getSetCookie().some((value) => {
          const attributes = value.split(/;\s*/);
          return (
            value.startsWith(`__Secure-${prefix}.session_token=;`) &&
            attributes.includes("Domain=smarttools.test") &&
            attributes.includes("Max-Age=0")
          );
        }),
      ).toBeTruthy();
      for (const sessionOrigin of origins) {
        const session = await productionAuth.api.getSession({
          headers: new Headers({ host: new URL(sessionOrigin).host, cookie }),
        });
        expect(session).toBe(null);
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
        { provider: "google", callbackURL },
        { origin, cookie: "smarttools.session_token=csrf-check" },
      ),
    );
    expect(response.status).toBe(403);
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
    expect(resolveConfiguredReturnTo(input), input).toBe(expected);
});

test("admin permission guards retain sign-in and denial behavior with clean destinations", async () => {
  for (const operation of [getActorUserId, () => requirePagePermission("users", "read")]) {
    await expect(operation()).rejects.toSatisfy((error) => {
      const destination = new URL(error.location);
      return (
        destination.origin === adminOrigin &&
        destination.pathname === "/auth" &&
        destination.searchParams.get("returnTo") === `${adminOrigin}/`
      );
    });
  }
  state.session = { user: { id: "admin-1" } };
  expect(await getActorUserId()).toBe("admin-1");
  expect(await requirePagePermission("users", "read")).toBe(state.session);
  state.denied = true;
  await expect(requirePagePermission("users", "read")).rejects.toSatisfy(
    (error) => error.location === `${adminOrigin}/denied`,
  );
});

test("signed-out visitors to named localhost admin routes are sent to sign-in on the admin host", async () => {
  const previousAppUrl = process.env.APP_URL;
  const previousSession = state.session;
  onTestFinished(() => {
    if (previousAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousAppUrl;
    state.session = previousSession;
  });
  process.env.APP_URL = "http://smarttools.localhost:3000";
  state.session = null;
  for (const operation of [getActorUserId, () => requirePagePermission("admin", "enter")]) {
    await expect(operation()).rejects.toSatisfy((error) => {
      const destination = new URL(error.location);
      return (
        destination.origin === "http://admin.smarttools.localhost:3000" &&
        destination.pathname === "/auth" &&
        destination.searchParams.get("returnTo") === "http://admin.smarttools.localhost:3000/"
      );
    });
  }
});

test("invalid application origins are rejected before configuring authentication", async () => {
  onTestFinished(() => {
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
    vi.resetModules();
    await expect(import("@/lib/auth/auth.ts")).rejects.toThrow(/APP_URL/);
  }
});

test("www and named localhost applications derive the admin host and share the parent cookie", async () => {
  onTestFinished(() => {
    process.env.APP_URL = environment.APP_URL;
  });
  for (const [appUrl, expectedAdminOrigin, expectedCookieDomain] of [
    ["https://www.smarttools.test", "https://admin.smarttools.test", "smarttools.test"],
    ["http://smarttools.localhost:3000", "http://admin.smarttools.localhost:3000", "smarttools.localhost"],
  ]) {
    process.env.APP_URL = appUrl;
    const configuredAuth = await freshAuth();
    expect(resolveConfiguredReturnTo("/admin/users")).toBe(`${expectedAdminOrigin}/users`);
    const response = await configuredAuth.handler(
      request(expectedAdminOrigin, "/sign-in/social", { provider: "google", callbackURL: "/" }),
    );
    expect(response.status).toBe(200);
    expect(new URL((await response.json()).url).searchParams.get("redirect_uri")).toBe(
      `${expectedAdminOrigin}/api/auth/callback/google`,
    );
    const login = await configuredAuth.handler(
      request(expectedAdminOrigin, "/sign-in/email", {
        email: "admin-origin@example.test",
        password: "admin-origin-password-123",
      }),
    );
    expect(login.status).toBe(200);
    const cookies = login.headers.getSetCookie();
    expect(cookies.some((cookie) => cookie.startsWith("smarttools.session_token="))).toBeTruthy();
    expect(cookies.every((cookie) => cookie.split(/;\s*/).includes(`Domain=${expectedCookieDomain}`))).toBeTruthy();
    const cookie = cookies.map((value) => value.split(";")[0]).join("; ");
    for (const sessionOrigin of [appUrl, expectedAdminOrigin]) {
      const session = await configuredAuth.handler(
        new Request(`${sessionOrigin}/api/auth/get-session`, {
          headers: { host: new URL(sessionOrigin).host, cookie },
        }),
      );
      expect((await session.json()).user.email).toBe("admin-origin@example.test");
    }
  }
});

test("IP and Vercel URLs keep same-host cookies and existing admin paths", async () => {
  const previousSession = state.session;
  state.session = null;
  onTestFinished(() => {
    process.env.APP_URL = environment.APP_URL;
    state.session = previousSession;
  });
  for (const appUrl of ["http://127.0.0.1:3000", "http://[::1]:3000", "https://canopy-preview.vercel.app"]) {
    process.env.APP_URL = appUrl;
    for (const operation of [getActorUserId, () => requirePagePermission("users", "read")]) {
      await expect(operation()).rejects.toSatisfy((error) => error.location === "/auth?returnTo=%2Fadmin");
    }
    const singleHostAuth = await freshAuth();
    expect(resolveConfiguredReturnTo("/admin/users")).toBe("/admin/users");
    expect(resolveConfiguredReturnTo(`${adminOrigin}/users`)).toBe("/");
    const social = await singleHostAuth.handler(
      request(appUrl, "/sign-in/social", { provider: "google", callbackURL: "/admin" }),
    );
    expect(social.status).toBe(200);
    expect(new URL((await social.json()).url).searchParams.get("redirect_uri")).toBe(
      `${appUrl}/api/auth/callback/google`,
    );
    const login = await singleHostAuth.handler(
      request(appUrl, "/sign-in/email", {
        email: "admin-origin@example.test",
        password: "admin-origin-password-123",
      }),
    );
    expect(login.status).toBe(200);
    const cookies = login.headers.getSetCookie();
    expect(cookies.some((cookie) => cookie.startsWith("smarttools.session_token="))).toBeTruthy();
    expect(cookies.every((cookie) => !/;\s*domain=/i.test(cookie))).toBeTruthy();
    const cookie = cookies.map((value) => value.split(";")[0]).join("; ");
    const sessionRequest = () =>
      new Request(`${appUrl}/api/auth/get-session`, { headers: { host: new URL(appUrl).host, cookie } });
    expect((await (await singleHostAuth.handler(sessionRequest())).json()).user.email).toBe(
      "admin-origin@example.test",
    );
    const logout = await singleHostAuth.handler(request(appUrl, "/sign-out", {}, { cookie }));
    expect(logout.status).toBe(200);
    expect(await (await singleHostAuth.handler(sessionRequest())).json()).toBe(null);
  }
});
