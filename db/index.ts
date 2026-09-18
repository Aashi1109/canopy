import config from "../lib/config/config.ts";
import { createDatabase } from "./runtime.ts";
import * as schema from "./schema.ts";
export { sqlClient } from "./runtime.ts";

export { and, asc, count, countDistinct, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
export { alias } from "drizzle-orm/pg-core";

export const db = createDatabase(schema);

export function isDatabaseConfigured(): boolean {
  return Boolean(config.databaseUrl);
}

export function assertDatabaseConfigured(): void {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is required");
  }
}

export * from "./schema.ts";
// Keep filesystem-based tool discovery out of the application module graph.
// The seed script imports seedManagedTools.ts directly.
export * from "./toolContent.ts";
