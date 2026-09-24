import { memoryAdapter } from "better-auth/adapters/memory";
import { NextRequest } from "next/server.js";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

const parentOrigin = "http://localhost:3000";
const adminOrigin = "http://admin.localhost:3000";
const environment = {
  NODE_ENV: "test",
  APP_URL: parentOrigin,
  AUTH_COOKIE_PREFIX: "local-test",
  BETTER_AUTH_SECRET: "local-session-test-secret-at-least-32-characters",
  GOOGLE_CLIENT_ID: "local-google-client",
  GOOGLE_CLIENT_SECRET: "local-google-secret",
};
const originalEnv = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
Object.assign(process.env, environment);
const database = { authUser: [], authSession: [], authAccount: [], authVerification: [] };
const state = { database, sent: [], adapter: memoryAdapter(database) };
globalThis.__localSessionTest = state;

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
vi.mock("better-auth/adapters/drizzle", () => ({
  drizzleAdapter: () => globalThis.__localSessionTest.adapter,
}));
vi.mock("@/lib/auth/cachedUserAdapter.ts", () => ({ cachedUserAdapter: (adapter) => adapter }));
vi.mock("@/lib/auth/email.ts", () => ({
  sendAuthEmail: async (message) => globalThis.__localSessionTest.sent.push(message),
}));

const { auth } = await import("@/lib/auth/auth.ts");
const { GET, POST } = await import("@/app/api/auth/local-session/route.ts");
const { usesLocalSubdomainSessions, getLocalSessionStartUrl } = await import("@/lib/auth/localSession.ts");

afterAll(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete globalThis.__localSessionTest;
});

function request(url, { method = "GET", body, cookie = "", headers = {} } = {}) {
  const parsed = new URL(url);
  return new NextRequest(parsed, {
    method,
    headers: {
      host: parsed.host,
      origin: parsed.origin,
      cookie,
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
function cookieHeader(response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}
function noSessionCookie(response) {
  expect(
    response.headers.getSetCookie().every((cookie) => !cookie.startsWith("local-test.session_token=")),
  ).toBeTruthy();
}
function privateResponse(response) {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}
const email = "local-session@example.test";
const password = "local-session-password-123";
beforeAll(async () => {
  const signup = await auth.handler(
    request(`${parentOrigin}/api/auth/sign-up/email`, {
      method: "POST",
      body: { name: "Local Session", email, password },
    }),
  );
  expect(signup.status).toBe(200);
  const verification = await auth.handler(request(state.sent.pop().actionUrl));
  expect(verification.status).toBe(302);
});
async function signIn() {
  const response = await auth.handler(
    request(`${parentOrigin}/api/auth/sign-in/email`, {
      method: "POST",
      body: { email, password },
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.getSetCookie().every((cookie) => !/;\s*domain=/i.test(cookie))).toBeTruthy();
  return cookieHeader(response);
}
async function session(origin, cookie) {
  return (await auth.handler(request(`${origin}/api/auth/get-session`, { cookie }))).json();
}
async function begin(mode = "check", returnTo = `${adminOrigin}/users?role=editor`) {
  const response = await GET(request(new URL(getLocalSessionStartUrl(returnTo, mode), adminOrigin).href));
  expect(response.status).toBe(303);
  privateResponse(response);
  return { authorizeUrl: response.headers.get("location"), nonceCookie: cookieHeader(response), response };
}
async function ticket(cookie) {
  const start = await begin();
  const response = await GET(request(start.authorizeUrl, { cookie }));
  expect(response.status).toBe(303);
  privateResponse(response);
  const completion = new URL(response.headers.get("location"));
  expect(completion.origin).toBe(adminOrigin);
  expect(completion.pathname).toBe("/auth/local-session");
  expect(completion.search).toBe("");
  const body = Object.fromEntries(new URLSearchParams(completion.hash.slice(1)));
  expect(body.token && body.state && body.returnTo).toBeTruthy();
  return { ...start, body };
}
const complete = (transfer, overrides = {}) =>
  POST(
    request(`${adminOrigin}/api/auth/local-session`, {
      method: "POST",
      body: transfer.body,
      cookie: transfer.nonceCookie,
      ...overrides,
    }),
  );

test("local session helpers preserve the main localhost origin and encode explicit modes", () => {
  expect(usesLocalSubdomainSessions()).toBe(true);
  expect(new URL(getLocalSessionStartUrl("/users?q=A&B", "google"), adminOrigin).searchParams.get("returnTo")).toBe(
    "/users?q=A&B",
  );
  expect(new URL(getLocalSessionStartUrl("/"), adminOrigin).searchParams.get("mode")).toBe("check");
});

test("Google starts on localhost with its existing callback and host-only state cookies", async () => {
  const start = await begin("google");
  expect(new URL(start.authorizeUrl).origin).toBe(parentOrigin);
  expect(
    start.response.headers.getSetCookie().some((cookie) => cookie.startsWith("local-test.local_auth_state=")),
  ).toBeTruthy();
  expect(
    start.response.headers.getSetCookie().every((cookie) => /HttpOnly/i.test(cookie) && !/;\s*domain=/i.test(cookie)),
  ).toBeTruthy();
  const response = await GET(request(start.authorizeUrl));
  expect(response.status).toBe(303);
  const google = new URL(response.headers.get("location"));
  expect(google.origin).toBe("https://accounts.google.com");
  expect(google.searchParams.get("redirect_uri")).toBe(`${parentOrigin}/api/auth/callback/google`);
  expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith("local-test.state="))).toBeTruthy();
  expect(response.headers.getSetCookie().every((cookie) => !/;\s*domain=/i.test(cookie))).toBeTruthy();
  privateResponse(response);
});

test("an unauthenticated session check returns to admin sign-in once without starting Google", async () => {
  const start = await begin();
  const response = await GET(request(start.authorizeUrl));
  const destination = new URL(response.headers.get("location"));
  expect(destination.origin).toBe(adminOrigin);
  expect(destination.pathname).toBe("/auth");
  expect(destination.searchParams.get("localChecked")).toBe("1");
  expect(destination.searchParams.get("returnTo")).toBe(`${adminOrigin}/users?role=editor`);
  noSessionCookie(response);
  privateResponse(response);
});

test("the handoff installs the same backend session on admin and logout revokes both hosts", async () => {
  const parentCookie = await signIn();
  const transfer = await ticket(parentCookie);
  const response = await complete(transfer);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ redirectTo: transfer.body.returnTo });
  privateResponse(response);
  const adminCookie = cookieHeader(response);
  expect(
    response.headers
      .getSetCookie()
      .some((cookie) => cookie.startsWith("local-test.local_auth_state=;") && /Max-Age=0/.test(cookie)),
  ).toBeTruthy();
  expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith("local-test.session_token="))).toBeTruthy();
  expect(response.headers.getSetCookie().every((cookie) => !/;\s*domain=/i.test(cookie))).toBeTruthy();
  expect((await session(parentOrigin, parentCookie)).session.id).toBe(
    (await session(adminOrigin, adminCookie)).session.id,
  );
  const logout = await auth.handler(
    request(`${adminOrigin}/api/auth/sign-out`, { method: "POST", body: {}, cookie: adminCookie }),
  );
  expect(logout.status).toBe(200);
  expect(await session(parentOrigin, parentCookie)).toBe(null);
  expect(await session(adminOrigin, adminCookie)).toBe(null);
});

test("nonce, exact origin, and destination checks run before consuming the one-time ticket", async () => {
  const transfer = await ticket(await signIn());
  for (const [overrides, status] of [
    [{ cookie: "" }, 403],
    [{ body: { ...transfer.body, state: "0".repeat(64) } }, 403],
    [{ headers: { origin: parentOrigin } }, 403],
    [{ body: { ...transfer.body, returnTo: "https://evil.test/" } }, 400],
    [{ body: { ...transfer.body, returnTo: `${parentOrigin}/` } }, 400],
    [{ body: { ...transfer.body, returnTo: "/auth/local-session" } }, 400],
    [{ body: { ...transfer.body, returnTo: "/api/auth/local-session" } }, 400],
    [{ body: { ...transfer.body, returnTo: "/%61uth" } }, 400],
    [{ body: {} }, 400],
  ]) {
    const response = await complete(transfer, overrides);
    expect(response.status).toBe(status);
    noSessionCookie(response);
    privateResponse(response);
  }
  expect((await complete(transfer)).status).toBe(200);
  const replay = await complete(transfer);
  expect(replay.status).toBe(400);
  noSessionCookie(replay);
});

test("the raw one-time-token endpoints cannot bypass the nonce-bound handoff", async () => {
  const parentCookie = await signIn();
  const transfer = await ticket(parentCookie);
  const generate = await auth.handler(
    request(`${parentOrigin}/api/auth/one-time-token/generate`, { cookie: parentCookie }),
  );
  expect(generate.status).toBe(403);
  const verify = await auth.handler(
    request(`${adminOrigin}/api/auth/one-time-token/verify`, {
      method: "POST",
      body: { token: transfer.body.token },
    }),
  );
  expect(verify.status).toBe(403);
  noSessionCookie(verify);
  expect((await complete(transfer)).status).toBe(200);
});

test("expired tickets and suspended accounts never receive a session cookie", async () => {
  const parentCookie = await signIn();
  const transfer = await ticket(parentCookie);
  const currentSession = await session(parentOrigin, parentCookie);
  const verification = database.authVerification.find((record) => record.value === currentSession.session.token);
  expect(verification).toBeTruthy();
  expect(!verification.identifier.includes(transfer.body.token), "tickets are hashed in storage").toBeTruthy();
  verification.expiresAt = new Date(Date.now() - 1000);
  const expired = await complete(transfer);
  expect(expired.status).toBe(400);
  noSessionCookie(expired);

  const suspendedTransfer = await ticket(parentCookie);
  const user = database.authUser.find((user) => user.email === email);
  user.status = "suspended";
  try {
    const start = await begin();
    const source = await GET(request(start.authorizeUrl, { cookie: parentCookie }));
    expect(source.headers.get("location")).toBe(`${parentOrigin}/account/suspended`);
    const response = await complete(suspendedTransfer);
    expect(response.status).toBe(403);
    noSessionCookie(response);
  } finally {
    user.status = "active";
  }
});

test("unknown hosts, callback loops, and non-local deployments cannot use the bridge", async () => {
  for (const [url, headers, status] of [
    [`${parentOrigin}/api/auth/local-session?step=start`, {}, 404],
    ["http://unknown.localhost:3000/api/auth/local-session?step=start", {}, 404],
    [`${parentOrigin}/api/auth/local-session?step=start`, { "x-forwarded-host": "admin.localhost:3000" }, 404],
    [`${adminOrigin}/api/auth/local-session?step=start&returnTo=%2Fauth`, {}, 400],
    [`${adminOrigin}/api/auth/local-session?step=start&returnTo=https%3A%2F%2Fevil.test`, {}, 400],
    [`${adminOrigin}/api/auth/local-session?step=start&mode=unknown`, {}, 400],
    [`${adminOrigin}/api/auth/local-session?step=authorize`, {}, 404],
    [`${parentOrigin}/api/auth/local-session?step=authorize&state=x`, {}, 400],
  ]) {
    const response = await GET(request(url, { headers }));
    expect(response.status, url).toBe(status);
    privateResponse(response);
  }
  process.env.APP_URL = "https://smarttools.test";
  try {
    expect(usesLocalSubdomainSessions()).toBe(false);
    expect((await GET(request(`${adminOrigin}/api/auth/local-session?step=start`))).status).toBe(404);
    expect((await POST(request(`${adminOrigin}/api/auth/local-session`, { method: "POST", body: {} }))).status).toBe(
      404,
    );
  } finally {
    process.env.APP_URL = parentOrigin;
  }
});
