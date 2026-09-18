import config from "../../lib/config/config.ts";
import { randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";
import pg from "pg";
import { Cache, CACHE_NAMESPACES, closeRedis } from "../../lib/cache/index.ts";

for (const file of [".env.local", ".env"]) {
  loadEnv({ path: new URL(`../../${file}`, import.meta.url), override: false, quiet: true });
}

const email = process.argv[2]?.trim().toLowerCase();
const databaseUrl = config.databaseUrl;
if (!email) throw new Error("Usage: pnpm admin:promote <verified-email>");
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 30_000 });
const userCache = new Cache(CACHE_NAMESPACES.USER);
const userRolesCache = new Cache(CACHE_NAMESPACES.USER_ROLES);
let cacheUserId;
let cacheToken = null;
let rolesCacheToken = null;

try {
  await client.connect();
  await client.query("BEGIN");
  try {
    const {
      rows: [user],
    } = await client.query(
      `
      SELECT id, email_verified, status
      FROM auth_users
      WHERE lower(email) = $1
      FOR UPDATE
    `,
      [email],
    );

    if (!user) throw new Error("Account not found");
    if (!user.email_verified) throw new Error("Account email is not verified");
    if (user.status !== "active") throw new Error("Account is suspended");

    cacheUserId = user.id;
    cacheToken = await userCache.beginInvalidation(user.id, 3600);
    rolesCacheToken = await userRolesCache.beginInvalidation(user.id, 86400);

    await client.query(
      `
      INSERT INTO user_roles (user_id, role_id)
      VALUES ($1, 'admin')
      ON CONFLICT DO NOTHING
    `,
      [user.id],
    );
    await client.query(
      `
      INSERT INTO audit_events (
        id, actor_user_id, action, target_type, target_id, metadata
      ) VALUES (
        $1, $2, 'user.promote_admin', 'user', $2, $3::jsonb
      )
    `,
      [randomUUID(), user.id, JSON.stringify({ source: "cli" })],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  console.log(`Promoted verified account ${email} to Admin`);
} finally {
  if (cacheUserId) {
    await userCache.endInvalidation(cacheUserId, cacheToken, 3600);
    await userRolesCache.endInvalidation(cacheUserId, rolesCacheToken, 86400);
  }
  closeRedis();
  await client.end();
}
