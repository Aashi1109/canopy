import { expect, test } from "vitest";
import { randomUUID } from "node:crypto";

const enabled = process.env.CANOPY_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);

function emailActionUrl(message) {
  const href = message.html?.match(/href="([^"]+)"/)?.[1];
  expect(href, "authentication email includes an action URL").toBeTruthy();
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

    const [{ auth }, { db, sql, sqlClient }] = await Promise.all([
      import(`../lib/auth/auth.ts?integration=${randomUUID()}`),
      import("../db/index.ts"),
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
    expect(signup.token).toBe(null);
    expect(signup.user.name).toBe("Auth Integration User");
    expect(signup.user.emailVerified).toBe(false);
    expect(delivered.length).toBe(1);

    const verificationUrl = emailActionUrl(delivered.shift());
    const verificationToken = verificationUrl.searchParams.get("token");
    expect(verificationToken).toBeTruthy();
    const verificationResponse = await auth.api.verifyEmail({
      query: {
        token: verificationToken,
        callbackURL: "http://localhost:3000/",
      },
      headers,
      asResponse: true,
    });
    expect(verificationResponse.status).toBe(302);

    const [storedUser] = (
      await db.execute(sql`
      SELECT id, email_verified, name FROM auth_users WHERE email = ${email}
    `)
    ).rows;
    expect(storedUser.email_verified).toBe(true);
    expect(storedUser.name).toBe("Auth Integration User");
    const assignments = (
      await db.execute(sql`
      SELECT role_id FROM user_roles WHERE user_id = ${storedUser.id}
    `)
    ).rows;
    expect(assignments.map(({ role_id }) => role_id)).toEqual(["user"]);

    const signIn = await auth.api.signInEmail({
      body: {
        email,
        password,
        callbackURL: "http://localhost:3000/paperwork",
      },
      headers,
    });
    expect(signIn.token).toBeTruthy();

    const google = await auth.api.signInSocial({
      body: {
        provider: "google",
        callbackURL: "http://localhost:3000/",
      },
      headers,
    });
    expect(google.redirect).toBe(true);
    expect(google.url).toMatch(/^https:\/\/accounts\.google\.com\//);
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
    expect(unsafeOAuth.ok).toBe(false);
    expect(unsafeOAuth.headers.get("location") ?? "").not.toMatch(/evil\.test/);

    await auth.api.requestPasswordReset({
      body: {
        email,
        redirectTo: "http://localhost:3000/auth/reset-password",
      },
      headers,
    });
    expect(delivered.length).toBe(1);
    const resetUrl = emailActionUrl(delivered.shift());
    const resetToken = resetUrl.searchParams.get("token") ?? resetUrl.pathname.split("/").filter(Boolean).at(-1);
    expect(resetToken).toBeTruthy();
    await auth.api.resetPassword({
      body: { token: resetToken, newPassword: nextPassword },
      headers,
    });
    await expect(() => auth.api.signInEmail({ body: { email, password }, headers })).rejects.toThrow(
      /password|credentials|invalid/i,
    );
    expect(
      (
        await auth.api.signInEmail({
          body: { email, password: nextPassword },
          headers,
        })
      ).token,
    ).toBeTruthy();

    await db.transaction(async (transaction) => {
      await transaction.execute(sql`
        UPDATE auth_users SET status = 'suspended' WHERE id = ${storedUser.id}
      `);
      await transaction.execute(sql`
        DELETE FROM auth_sessions WHERE user_id = ${storedUser.id}
      `);
    });
    const suspendedSignIn = await auth.api.signInEmail({
      body: { email, password: nextPassword },
      headers,
    });
    expect(suspendedSignIn.token).toBeTruthy();
    expect(suspendedSignIn.user.status).toBe("suspended");
    const [sessionCount] = (
      await db.execute(sql`
      SELECT COUNT(*)::integer AS count FROM auth_sessions WHERE user_id = ${storedUser.id}
    `)
    ).rows;
    expect(sessionCount.count).toBe(1);
  },
);
