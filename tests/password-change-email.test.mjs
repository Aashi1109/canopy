import { memoryAdapter } from "better-auth/adapters/memory";
import { afterAll, expect, test, vi } from "vitest";

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
vi.mock("better-auth/adapters/drizzle", () => ({ drizzleAdapter: () => globalThis.__passwordEmailTest.adapter }));
vi.mock("@/lib/auth/cachedUserAdapter.ts", () => ({ cachedUserAdapter: (adapter) => adapter }));
vi.mock("resend", () => ({
  Resend: class Resend {
    emails = {
      async send(message) {
        const state = globalThis.__passwordEmailTest;
        state.sent.push(message);
        return { error: state.fail ? { message: "Simulated delivery failure" } : null };
      },
    };
  },
}));

const { auth } = await import("@/lib/auth/auth.ts");
afterAll(() => {
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
  expect(response.status).toBe(200);
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
        await expect(
          auth.api.resetPassword({ body: { token: "invalid-token", newPassword: password }, headers }),
        ).rejects.toThrow();
        await expect(auth.api.resetPassword({ body: { token, newPassword: "short" }, headers })).rejects.toThrow();
      } else {
        await expect(
          auth.api.changePassword({
            body: { currentPassword: "wrong-password", newPassword: password },
            headers: sessionHeaders,
          }),
        ).rejects.toThrow();
        await expect(
          auth.api.changePassword({
            body: { currentPassword: password, newPassword: "short" },
            headers: sessionHeaders,
          }),
        ).rejects.toThrow();
      }
      expect(state.sent.length, "rejected changes must not send confirmation").toBe(0);

      const nextPassword = `${operation}-${deliveryFails}-new-password-456`;
      state.fail = deliveryFails;
      if (operation === "reset") {
        const result = await auth.api.resetPassword({ body: { token, newPassword: nextPassword }, headers });
        expect(result.status).toBe(true);
        await expect(auth.api.resetPassword({ body: { token, newPassword: nextPassword }, headers })).rejects.toThrow();
        expect(await auth.api.getSession({ headers: sessionHeaders })).toBe(null);
      } else {
        const result = await auth.api.changePassword({
          body: { currentPassword: password, newPassword: nextPassword, revokeOtherSessions: true },
          headers: sessionHeaders,
        });
        expect(result.user.email).toBe(email);
      }
      state.fail = false;
      expect(
        await auth.api.getSession({ headers: otherSessionHeaders }),
        "previous sessions are revoked even when notification fails",
      ).toBe(null);
      expect(state.sent.length, `${operation} should attempt exactly one confirmation`).toBe(1);
      const message = state.sent.shift();
      expect(message.to).toEqual([email]);
      expect(message.from).toBe("SmartTools Accounts <accounts@smarttools.lol>");
      expect(message.subject).toMatch(/password.*changed/i);
      expect(message.html).toMatch(/reset your password/i);
      expect(message.html).not.toMatch(/link expires|ignore this email/i);
      expect(actionUrl(message).href).toBe(`${environment.APP_URL}/auth?mode=forgot`);
      expect(!message.html.includes(password) && !message.html.includes(nextPassword)).toBeTruthy();
      await expect(auth.api.signInEmail({ body: { email, password }, headers })).rejects.toThrow();
      await signIn(nextPassword);
      password = nextPassword;
    }
  }
});
