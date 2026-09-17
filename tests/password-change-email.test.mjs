import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { memoryAdapter } from "better-auth/adapters/memory";

const state = {
  sent: [],
  fail: false,
  adapter: memoryAdapter({ authUser: [], authSession: [], authAccount: [], authVerification: [] }),
};
globalThis.__passwordEmailTest = state;
const environment = {
  NODE_ENV: "test",
  APP_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "password-notification-test-secret-at-least-32-characters",
  ACCOUNTS_EMAIL: "accounts@smarttools.lol",
  RESEND_API_KEY: "test-key",
};
const originalEnv = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
Object.assign(process.env, environment);

const authUrl = new URL("../packages/auth/src/auth.ts", import.meta.url).href;
const emailUrl = new URL("../packages/auth/src/email.ts", import.meta.url).href;
const mocks = {
  "@canopy/authorization": "export const assertCanDeleteUser = () => {};",
  "@canopy/database": `
    export const authAccount = {}, authSession = {}, authUser = {}, authVerification = {}, userRolesTable = {};
    export const and = () => {}, countDistinct = () => {}, eq = () => {};
    export const db = { insert: () => ({ values: () => ({ onConflictDoNothing: async () => {} }) }) };
  `,
  "better-auth/adapters/drizzle": "export const drizzleAdapter = () => globalThis.__passwordEmailTest.adapter;",
  "./cachedUserAdapter.ts": "export const cachedUserAdapter = (adapter) => adapter;",
};
const hooks = registerHooks({
  resolve(specifier, context, next) {
    let source = context.parentURL === authUrl ? mocks[specifier] : undefined;
    if (context.parentURL === emailUrl && specifier === "resend") {
      source = `export class Resend { emails = { async send(message) {
        const state = globalThis.__passwordEmailTest;
        state.sent.push(message);
        return { error: state.fail ? { message: 'Simulated delivery failure' } : null };
      } }; }`;
    }
    return source === undefined
      ? next(specifier, context)
      : {
          shortCircuit: true,
          url: `data:text/javascript,${encodeURIComponent(source)}`,
        };
  },
});
const { auth } = await import(authUrl);
hooks.deregister();
test.after(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete globalThis.__passwordEmailTest;
});

function actionUrl(message) {
  return new URL(message.html.match(/href="([^"]+)"/)[1].replaceAll("&amp;", "&"));
}

const headers = new Headers({ origin: environment.APP_URL });
const email = "password-notification@example.test";
async function signIn(password) {
  const response = await auth.api.signInEmail({ body: { email, password }, headers, asResponse: true });
  assert.equal(response.status, 200);
  return new Headers({
    origin: environment.APP_URL,
    cookie: response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; "),
  });
}

test("successful password changes and resets notify the account without breaking recovery on email failures", async () => {
  let password = "initial-password-123";
  await auth.api.signUpEmail({ body: { name: "Password Test", email, password }, headers });
  const verification = actionUrl(state.sent.shift());
  await auth.api.verifyEmail({ query: { token: verification.searchParams.get("token") }, headers });

  for (const operation of ["change", "reset"]) {
    for (const deliveryFails of [false, true]) {
      const sessionHeaders = await signIn(password);
      const otherSessionHeaders = await signIn(password);
      let token;
      if (operation === "reset") {
        await auth.api.requestPasswordReset({ body: { email }, headers });
        const url = actionUrl(state.sent.shift());
        token = url.pathname.split("/").at(-1);
        await assert.rejects(
          auth.api.resetPassword({ body: { token: "invalid-token", newPassword: password }, headers }),
        );
        await assert.rejects(auth.api.resetPassword({ body: { token, newPassword: "short" }, headers }));
      } else {
        await assert.rejects(
          auth.api.changePassword({
            body: { currentPassword: "wrong-password", newPassword: password },
            headers: sessionHeaders,
          }),
        );
        await assert.rejects(
          auth.api.changePassword({
            body: { currentPassword: password, newPassword: "short" },
            headers: sessionHeaders,
          }),
        );
      }
      assert.equal(state.sent.length, 0, "rejected changes must not send confirmation");

      const nextPassword = `${operation}-${deliveryFails}-new-password-456`;
      state.fail = deliveryFails;
      if (operation === "reset") {
        const result = await auth.api.resetPassword({ body: { token, newPassword: nextPassword }, headers });
        assert.equal(result.status, true);
        await assert.rejects(auth.api.resetPassword({ body: { token, newPassword: nextPassword }, headers }));
        assert.equal(await auth.api.getSession({ headers: sessionHeaders }), null);
      } else {
        const result = await auth.api.changePassword({
          body: { currentPassword: password, newPassword: nextPassword, revokeOtherSessions: true },
          headers: sessionHeaders,
        });
        assert.equal(result.user.email, email);
      }
      state.fail = false;
      assert.equal(
        await auth.api.getSession({ headers: otherSessionHeaders }),
        null,
        "previous sessions are revoked even when notification fails",
      );
      assert.equal(state.sent.length, 1, `${operation} should attempt exactly one confirmation`);
      const message = state.sent.shift();
      assert.deepEqual(message.to, [email]);
      assert.equal(message.from, "SmartTools Accounts <accounts@smarttools.lol>");
      assert.match(message.subject, /password.*changed/i);
      assert.match(message.html, /reset your password/i);
      assert.doesNotMatch(message.html, /link expires|ignore this email/i);
      assert.equal(actionUrl(message).href, `${environment.APP_URL}/auth?mode=forgot`);
      assert.ok(!message.html.includes(password) && !message.html.includes(nextPassword));
      await assert.rejects(auth.api.signInEmail({ body: { email, password }, headers }));
      await signIn(nextPassword);
      password = nextPassword;
    }
  }
});
