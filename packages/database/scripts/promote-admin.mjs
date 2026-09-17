import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import postgres from "postgres";
import { Cache } from "@canopy/cache";

for (const file of [".env.local", ".env"]) {
  config({ path: new URL(`../../../${file}`, import.meta.url), override: false, quiet: true });
}

const email = process.argv[2]?.trim().toLowerCase();
const databaseUrl = process.env.DATABASE_URL;
if (!email) throw new Error("Usage: pnpm admin:promote <verified-email>");
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const sql = postgres(databaseUrl, { max: 1 });
const userCache = new Cache("user");
let cacheUserId;
let cacheToken = null;

try {
  await sql.begin(async (transaction) => {
    const [user] = await transaction`
      SELECT id, email_verified, status
      FROM auth_users
      WHERE lower(email) = ${email}
      FOR UPDATE
    `;

    if (!user) throw new Error("Account not found");
    if (!user.email_verified) throw new Error("Account email is not verified");
    if (user.status !== "active") throw new Error("Account is suspended");

    cacheUserId = user.id;
    cacheToken = await userCache.beginInvalidation(user.id, 3600);

    await transaction`
      INSERT INTO user_roles (user_id, role_id)
      VALUES (${user.id}, 'admin')
      ON CONFLICT DO NOTHING
    `;
    await transaction`
      INSERT INTO audit_events (
        id, actor_user_id, action, target_type, target_id, metadata
      ) VALUES (
        ${randomUUID()}, ${user.id}, 'user.promote_admin', 'user', ${user.id},
        ${transaction.json({ source: "cli" })}
      )
    `;
  });
  console.log(`Promoted verified account ${email} to Admin`);
} finally {
  if (cacheUserId) await userCache.endInvalidation(cacheUserId, cacheToken, 3600);
  await sql.end();
}
