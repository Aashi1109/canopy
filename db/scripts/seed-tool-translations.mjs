import config from "../../lib/config/config.ts";
import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { backfillToolTranslations } from "../seedManagedTools.ts";
import * as schema from "../schema.ts";

for (const file of [".env.local", ".env"]) {
  loadEnv({ path: new URL(`../../${file}`, import.meta.url), override: false });
}
if (!config.databaseUrl) throw new Error("DATABASE_URL is required");
const client = new pg.Client({ connectionString: config.databaseUrl, connectionTimeoutMillis: 30_000 });

try {
  await client.connect();
  const updated = await backfillToolTranslations(drizzle(client, { schema }));
  console.log(`Initialized missing English translation fields for ${updated} tools.`);
} finally {
  await client.end();
}
