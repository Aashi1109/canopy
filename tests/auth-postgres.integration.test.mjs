import { expect, onTestFinished, test } from "vitest";
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
  async () => {
    const environment = {
      BETTER_AUTH_SECRET: "integration-only-secret-that-is-at-least-32-characters",
      APP_URL: "http://localhost:3000",
      EMAIL_PROVIDER: "cloudflare",
      CLOUDFLARE_EMAIL_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
      CLOUDFLARE_EMAIL_API_TOKEN: "integration-mock-token",
      ACCOUNTS_EMAIL: "accounts@example.test",
      GOOGLE_CLIENT_ID: "google-integration-client",
      GOOGLE_CLIENT_SECRET: "google-integration-secret",
    };
    const originalEnv = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
    const delivered = [];
    const nativeFetch = globalThis.fetch;
    let closeDatabase;
    onTestFinished(async () => {
      globalThis.fetch = nativeFetch;
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await closeDatabase?.();
    });
    Object.assign(process.env, environment);
    globalThis.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (
        url ===
        `https://api.cloudflare.com/client/v4/accounts/${environment.CLOUDFLARE_EMAIL_ACCOUNT_ID}/email/sending/send`
      ) {
        const message = JSON.parse(String(init?.body ?? "{}"));
        delivered.push(message);
        return Response.json({
          success: true,
          errors: [],
          messages: [],
          result: { delivered: message.to, permanent_bounces: [], queued: [] },
        });
      }
      return nativeFetch(input, init);
    };

    const [{ auth }, { db, sql, sqlClient }] = await Promise.all([
      import(`../lib/auth/auth.ts?integration=${randomUUID()}`),
      import("../db/index.ts"),
    ]);
    closeDatabase = () => sqlClient.end();

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
