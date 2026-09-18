import { randomUUID } from "node:crypto";
import type { FullConfig } from "@playwright/test";
import { E2E_ACCOUNTS, E2E_PASSWORD } from "./fixtures/accounts";

export default async function globalSetup(_config: FullConfig) {
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://api.resend.com/emails") {
      return Response.json({ id: randomUUID() });
    }
    return nativeFetch(input, init);
  };

  const [{ auth }, { db, sql, sqlClient }] = await Promise.all([
    import("../../lib/auth/auth"),
    import("../../db/index"),
  ]);

  try {
    for (const account of Object.values(E2E_ACCOUNTS)) {
      const [existing] = (
        await db.execute<{ id: string }>(sql`
        SELECT id FROM auth_users WHERE email = ${account.email}
      `)
      ).rows;
      if (!existing) {
        await auth.api.signUpEmail({
          body: {
            ...account,
            password: E2E_PASSWORD,
            callbackURL: "http://localhost:3000",
          },
          headers: new Headers({ origin: "http://localhost:3000" }),
        });
      }
    }

    await db.execute(sql`
      UPDATE auth_users
      SET email_verified = TRUE
      WHERE email IN (
        ${E2E_ACCOUNTS.user.email},
        ${E2E_ACCOUNTS.viewer.email},
        ${E2E_ACCOUNTS.admin.email}
      )
    `);
    const users = (
      await db.execute<{ id: string; email: string }>(sql`
      SELECT id, email FROM auth_users
      WHERE email IN (
        ${E2E_ACCOUNTS.user.email},
        ${E2E_ACCOUNTS.viewer.email},
        ${E2E_ACCOUNTS.admin.email}
      )
    `)
    ).rows;
    const byEmail = new Map(users.map((user) => [user.email, user.id]));

    await db.execute(sql`
      INSERT INTO roles (id, name, description, access, is_system)
      VALUES (
        'e2e-tool-viewer',
        'E2E Tool Viewer',
        'Enters Admin and views tool configuration during browser tests.',
        ${JSON.stringify({ admin: { enter: true }, tools: { view: true } })}::jsonb,
        FALSE
      )
      ON CONFLICT (id) DO UPDATE SET
        description = EXCLUDED.description,
        access = EXCLUDED.access,
        updated_at = NOW()
    `);
    await db.execute(sql`
      INSERT INTO user_roles (user_id, role_id)
      VALUES
        (${byEmail.get(E2E_ACCOUNTS.viewer.email)}, 'e2e-tool-viewer'),
        (${byEmail.get(E2E_ACCOUNTS.admin.email)}, 'admin')
      ON CONFLICT DO NOTHING
    `);
  } finally {
    globalThis.fetch = nativeFetch;
    await sqlClient.end();
  }
}
