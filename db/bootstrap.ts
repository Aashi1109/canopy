import { sql } from "drizzle-orm";
import { db } from "./paperwork.ts";
import { usersTable } from "./paperworkSchema.ts";

let bootstrapped = false;
const bootstrapPromises = new WeakMap<object, Promise<void>>();

export async function ensureDatabaseBootstrapped() {
  if (bootstrapped) return;
  const client = db.$client;
  const pending = bootstrapPromises.get(client);
  if (pending) return pending;

  const bootstrapPromise = (async () => {
    try {
      // Create partitioned and isolated tables if not existing
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS key_value_pairs (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          key TEXT NOT NULL,
          value JSONB NOT NULL,
          updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, key)
        );
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS vendor_profiles (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          id TEXT NOT NULL,
          legal_name TEXT NOT NULL,
          business_name TEXT,
          email TEXT,
          phone TEXT,
          address_line1 TEXT,
          city TEXT,
          state TEXT,
          zip_code TEXT,
          entity_type TEXT NOT NULL DEFAULT 'Unknown',
          w9_status TEXT NOT NULL DEFAULT 'Not Requested',
          notes TEXT,
          updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, id)
        );
      `);

      bootstrapped = true;
    } catch (err) {
      console.warn("Database schema bootstrap warning:", err);
    } finally {
      bootstrapPromises.delete(client);
    }
  })();

  bootstrapPromises.set(client, bootstrapPromise);
  return bootstrapPromise;
}

export async function ensureUserExists(userId: string) {
  try {
    await db.insert(usersTable).values({ id: userId }).onConflictDoNothing();
  } catch (err) {
    console.error("ensureUserExists error for:", userId, err);
  }
}
