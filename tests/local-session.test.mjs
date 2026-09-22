import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { NextRequest } from "next/server.js";
import { memoryAdapter } from "better-auth/adapters/memory";

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
const authUrl = new URL("../lib/auth/auth.ts", import.meta.url).href;
const routeUrl = new URL("../app/api/auth/local-session/route.ts", import.meta.url).href;
const mocks = {
  "../authorization/index.ts": "export const assertCanDeleteUser = () => {};",
  "../../db/index.ts": `
    export const authAccount = {}, authSession = {}, authUser = {}, authVerification = {}, userRolesTable = {};
    export const and = () => {}, countDistinct = () => {}, eq = () => {};
    export const db = { insert: () => ({ values: () => ({ onConflictDoNothing: async () => {} }) }) };
  `,
  "better-auth/adapters/drizzle": "export const drizzleAdapter = () => globalThis.__localSessionTest.adapter;",
  "./cachedUserAdapter.ts": "export const cachedUserAdapter = adapter => adapter;",
  "./email.ts": "export const sendAuthEmail = async message => globalThis.__localSessionTest.sent.push(message);",
};
const hooks = registerHooks({
  resolve(specifier, context, next) {
    const source = context.parentURL === authUrl ? mocks[specifier] : undefined;
    if (source !== undefined) return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` };
    if (context.parentURL === routeUrl && specifier.startsWith("@/"))
      return { shortCircuit: true, url: new URL(`../${specifier.slice(2)}`, import.meta.url).href };
    return next(specifier === "next/server" ? "next/server.js" : specifier, context);
  },
});
const { auth } = await import(authUrl);
const { GET, POST } = await import(routeUrl);
const { usesLocalSubdomainSessions, getLocalSessionStartUrl } = await import("../lib/auth/localSession.ts");
test.after(() => {
  hooks.deregister();
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
  assert.ok(response.headers.getSetCookie().every((cookie) => !cookie.startsWith("local-test.session_token=")));
}
function privateResponse(response) {
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
}
const email = "local-session@example.test";
const password = "local-session-password-123";
test.before(async () => {
  const signup = await auth.handler(
    request(`${parentOrigin}/api/auth/sign-up/email`, {
      method: "POST",
      body: { name: "Local Session", email, password },
    }),
  );
  assert.equal(signup.status, 200);
  const verification = await auth.handler(request(state.sent.pop().actionUrl));
  assert.equal(verification.status, 302);
});
async function signIn() {
  const response = await auth.handler(
    request(`${parentOrigin}/api/auth/sign-in/email`, {
      method: "POST",
      body: { email, password },
    }),
  );
  assert.equal(response.status, 200);
  assert.ok(response.headers.getSetCookie().every((cookie) => !/;\s*domain=/i.test(cookie)));
  return cookieHeader(response);
}
async function session(origin, cookie) {
  return (await auth.handler(request(`${origin}/api/auth/get-session`, { cookie }))).json();
}
async function begin(mode = "check", returnTo = `${adminOrigin}/users?role=editor`) {
  const response = await GET(request(new URL(getLocalSessionStartUrl(returnTo, mode), adminOrigin).href));
  assert.equal(response.status, 303);
  privateResponse(response);
  return { authorizeUrl: response.headers.get("location"), nonceCookie: cookieHeader(response), response };
}
async function ticket(cookie) {
  const start = await begin();
  const response = await GET(request(start.authorizeUrl, { cookie }));
  assert.equal(response.status, 303);
  privateResponse(response);
  const completion = new URL(response.headers.get("location"));
  assert.equal(completion.origin, adminOrigin);
  assert.equal(completion.pathname, "/auth/local-session");
  assert.equal(completion.search, "");
  const body = Object.fromEntries(new URLSearchParams(completion.hash.slice(1)));
  assert.ok(body.token && body.state && body.returnTo);
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
  assert.equal(usesLocalSubdomainSessions(), true);
  assert.equal(
    new URL(getLocalSessionStartUrl("/users?q=A&B", "google"), adminOrigin).searchParams.get("returnTo"),
    "/users?q=A&B",
  );
  assert.equal(new URL(getLocalSessionStartUrl("/"), adminOrigin).searchParams.get("mode"), "check");
});

test("Google starts on localhost with its existing callback and host-only state cookies", async () => {
  const start = await begin("google");
  assert.equal(new URL(start.authorizeUrl).origin, parentOrigin);
  assert.ok(start.response.headers.getSetCookie().some((cookie) => cookie.startsWith("local-test.local_auth_state=")));
  assert.ok(
    start.response.headers.getSetCookie().every((cookie) => /HttpOnly/i.test(cookie) && !/;\s*domain=/i.test(cookie)),
  );
  const response = await GET(request(start.authorizeUrl));
  assert.equal(response.status, 303);
  const google = new URL(response.headers.get("location"));
  assert.equal(google.origin, "https://accounts.google.com");
  assert.equal(google.searchParams.get("redirect_uri"), `${parentOrigin}/api/auth/callback/google`);
  assert.ok(response.headers.getSetCookie().some((cookie) => cookie.startsWith("local-test.state=")));
  assert.ok(response.headers.getSetCookie().every((cookie) => !/;\s*domain=/i.test(cookie)));
  privateResponse(response);
});

test("an unauthenticated session check returns to admin sign-in once without starting Google", async () => {
  const start = await begin();
  const response = await GET(request(start.authorizeUrl));
  const destination = new URL(response.headers.get("location"));
  assert.equal(destination.origin, adminOrigin);
  assert.equal(destination.pathname, "/auth");
  assert.equal(destination.searchParams.get("localChecked"), "1");
  assert.equal(destination.searchParams.get("returnTo"), `${adminOrigin}/users?role=editor`);
  noSessionCookie(response);
  privateResponse(response);
});

test("the handoff installs the same backend session on admin and logout revokes both hosts", async () => {
  const parentCookie = await signIn();
  const transfer = await ticket(parentCookie);
  const response = await complete(transfer);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { redirectTo: transfer.body.returnTo });
  privateResponse(response);
  const adminCookie = cookieHeader(response);
  assert.ok(
    response.headers
      .getSetCookie()
      .some((cookie) => cookie.startsWith("local-test.local_auth_state=;") && /Max-Age=0/.test(cookie)),
  );
  assert.ok(response.headers.getSetCookie().some((cookie) => cookie.startsWith("local-test.session_token=")));
  assert.ok(response.headers.getSetCookie().every((cookie) => !/;\s*domain=/i.test(cookie)));
  assert.equal(
    (await session(parentOrigin, parentCookie)).session.id,
    (await session(adminOrigin, adminCookie)).session.id,
  );
  const logout = await auth.handler(
    request(`${adminOrigin}/api/auth/sign-out`, { method: "POST", body: {}, cookie: adminCookie }),
  );
  assert.equal(logout.status, 200);
  assert.equal(await session(parentOrigin, parentCookie), null);
  assert.equal(await session(adminOrigin, adminCookie), null);
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
    assert.equal(response.status, status);
    noSessionCookie(response);
    privateResponse(response);
  }
  assert.equal((await complete(transfer)).status, 200);
  const replay = await complete(transfer);
  assert.equal(replay.status, 400);
  noSessionCookie(replay);
});

test("the raw one-time-token endpoints cannot bypass the nonce-bound handoff", async () => {
  const parentCookie = await signIn();
  const transfer = await ticket(parentCookie);
  const generate = await auth.handler(
    request(`${parentOrigin}/api/auth/one-time-token/generate`, { cookie: parentCookie }),
  );
  assert.equal(generate.status, 403);
  const verify = await auth.handler(
    request(`${adminOrigin}/api/auth/one-time-token/verify`, {
      method: "POST",
      body: { token: transfer.body.token },
    }),
  );
  assert.equal(verify.status, 403);
  noSessionCookie(verify);
  assert.equal((await complete(transfer)).status, 200);
});

test("expired tickets and suspended accounts never receive a session cookie", async () => {
  const parentCookie = await signIn();
  const transfer = await ticket(parentCookie);
  const currentSession = await session(parentOrigin, parentCookie);
  const verification = database.authVerification.find((record) => record.value === currentSession.session.token);
  assert.ok(verification);
  assert.ok(!verification.identifier.includes(transfer.body.token), "tickets are hashed in storage");
  verification.expiresAt = new Date(Date.now() - 1000);
  const expired = await complete(transfer);
  assert.equal(expired.status, 400);
  noSessionCookie(expired);

  const suspendedTransfer = await ticket(parentCookie);
  const user = database.authUser.find((user) => user.email === email);
  user.status = "suspended";
  try {
    const start = await begin();
    const source = await GET(request(start.authorizeUrl, { cookie: parentCookie }));
    assert.equal(source.headers.get("location"), `${parentOrigin}/account/suspended`);
    const response = await complete(suspendedTransfer);
    assert.equal(response.status, 403);
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
    assert.equal(response.status, status, url);
    privateResponse(response);
  }
  process.env.APP_URL = "https://smarttools.test";
  try {
    assert.equal(usesLocalSubdomainSessions(), false);
    assert.equal((await GET(request(`${adminOrigin}/api/auth/local-session?step=start`))).status, 404);
    assert.equal(
      (await POST(request(`${adminOrigin}/api/auth/local-session`, { method: "POST", body: {} }))).status,
      404,
    );
  } finally {
    process.env.APP_URL = parentOrigin;
  }
});
