import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const enabled = process.env.CANOPY_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);

function emailActionUrl(message) {
  const href = message.html?.match(/href="([^"]+)"/)?.[1];
  assert.ok(href, "authentication email includes an action URL");
  return new URL(href.replaceAll("&amp;", "&"));
}

test(
  "Better Auth signs up, verifies, recovers, starts Google OAuth, and identifies suspended accounts",
  {
    skip: enabled ? false : "set CANOPY_INTEGRATION=1 with a migrated disposable DATABASE_URL",
  },
  async (context) => {
    process.env.BETTER_AUTH_SECRET = "integration-only-secret-that-is-at-least-32-characters";
    process.env.APP_URL = "http://localhost:3000";
    process.env.RESEND_API_KEY = "re_test_integration";
    process.env.ACCOUNTS_EMAIL = "accounts@example.test";
    process.env.GOOGLE_CLIENT_ID = "google-integration-client";
    process.env.GOOGLE_CLIENT_SECRET = "google-integration-secret";

    const delivered = [];
    const nativeFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === "https://api.resend.com/emails") {
        delivered.push(JSON.parse(String(init?.body ?? "{}")));
        return Response.json({ id: randomUUID() });
      }
      return nativeFetch(input, init);
    };

    const [{ auth }, { sqlClient }] = await Promise.all([
      import(`../packages/auth/src/auth.ts?integration=${randomUUID()}`),
      import("../packages/database/src/index.ts"),
    ]);
    context.after(async () => {
      globalThis.fetch = nativeFetch;
      await sqlClient.end();
    });

    const suffix = randomUUID();
    const email = `auth-${suffix}@example.test`;
    const password = "initial-password-123";
    const nextPassword = "replacement-password-456";
    const headers = new Headers({ origin: "http://localhost:3000" });

    const signup = await auth.api.signUpEmail({
      body: {
        name: "  Auth Integration User  ",
        email,
        password,
        callbackURL: "http://localhost:3000/",
      },
      headers,
    });
    assert.equal(signup.token, null);
    assert.equal(signup.user.name, "Auth Integration User");
    assert.equal(signup.user.emailVerified, false);
    assert.equal(delivered.length, 1);

    const verificationUrl = emailActionUrl(delivered.shift());
    const verificationToken = verificationUrl.searchParams.get("token");
    assert.ok(verificationToken);
    const verificationResponse = await auth.api.verifyEmail({
      query: {
        token: verificationToken,
        callbackURL: "http://localhost:3000/",
      },
      headers,
      asResponse: true,
    });
    assert.equal(verificationResponse.status, 302);

    const [storedUser] = await sqlClient`
      SELECT id, email_verified, name FROM auth_users WHERE email = ${email}
    `;
    assert.equal(storedUser.email_verified, true);
    assert.equal(storedUser.name, "Auth Integration User");
    const assignments = await sqlClient`
      SELECT role_id FROM user_roles WHERE user_id = ${storedUser.id}
    `;
    assert.deepEqual(
      assignments.map(({ role_id }) => role_id),
      ["user"],
    );

    const signIn = await auth.api.signInEmail({
      body: {
        email,
        password,
        callbackURL: "http://localhost:3000/paperwork",
      },
      headers,
    });
    assert.ok(signIn.token);

    const google = await auth.api.signInSocial({
      body: {
        provider: "google",
        callbackURL: "http://localhost:3000/",
      },
      headers,
    });
    assert.equal(google.redirect, true);
    assert.match(google.url, /^https:\/\/accounts\.google\.com\//);
    const unsafeOAuth = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/social", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          provider: "google",
          callbackURL: "https://evil.test",
        }),
      }),
    );
    assert.equal(unsafeOAuth.ok, false);
    assert.doesNotMatch(unsafeOAuth.headers.get("location") ?? "", /evil\.test/);

    await auth.api.requestPasswordReset({
      body: {
        email,
        redirectTo: "http://localhost:3000/auth/reset-password",
      },
      headers,
    });
    assert.equal(delivered.length, 1);
    const resetUrl = emailActionUrl(delivered.shift());
    const resetToken = resetUrl.searchParams.get("token") ?? resetUrl.pathname.split("/").filter(Boolean).at(-1);
    assert.ok(resetToken);
    await auth.api.resetPassword({
      body: { token: resetToken, newPassword: nextPassword },
      headers,
    });
    await assert.rejects(
      () => auth.api.signInEmail({ body: { email, password }, headers }),
      /password|credentials|invalid/i,
    );
    assert.ok(
      (
        await auth.api.signInEmail({
          body: { email, password: nextPassword },
          headers,
        })
      ).token,
    );

    await sqlClient.begin(async (transaction) => {
      await transaction`
        UPDATE auth_users SET status = 'suspended' WHERE id = ${storedUser.id}
      `;
      await transaction`
        DELETE FROM auth_sessions WHERE user_id = ${storedUser.id}
      `;
    });
    const suspendedSignIn = await auth.api.signInEmail({
      body: { email, password: nextPassword },
      headers,
    });
    assert.ok(suspendedSignIn.token);
    assert.equal(suspendedSignIn.user.status, "suspended");
    const [sessionCount] = await sqlClient`
      SELECT COUNT(*)::integer AS count FROM auth_sessions WHERE user_id = ${storedUser.id}
    `;
    assert.equal(sessionCount.count, 1);
  },
);
