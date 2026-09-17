import { createDatabase } from "./runtime.ts";
import * as schema from "./schema.ts";
export { sqlClient } from "./runtime.ts";

export { and, asc, count, countDistinct, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
export { alias } from "drizzle-orm/pg-core";

export const db = createDatabase(schema);

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function assertDatabaseConfigured(): void {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is required");
  }
}

export * from "./schema.ts";
// `./seedManagedTools.ts` is deliberately NOT re-exported. It walks the `tools/`
// directory with `fs` and resolves `../../../tools/<key>/definition.ts` at
// runtime — build-time-only work. Re-exporting it here pulled it into the app's
// module graph (every `@canopy/database` importer), and the bundler then
// failed to resolve that path, breaking `next build`.
// `scripts/seed.mjs` imports it directly by path, which is the only caller.
export * from "./toolContent.ts";
