import { and, eq } from "drizzle-orm";
import { db, userPreferencesTable } from "@canopy/database";

const KEY = "saved_tools";

function readIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string")) {
    throw new Error("Invalid saved_tools preference");
  }
  return [...new Set(value as string[])];
}

export async function getSavedTools(userId: string): Promise<string[]> {
  const [row] = await db
    .select({ value: userPreferencesTable.value })
    .from(userPreferencesTable)
    .where(and(eq(userPreferencesTable.userId, userId), eq(userPreferencesTable.key, KEY)));
  return row ? readIds(row.value) : [];
}

export async function changeSavedTools(
  userId: string,
  operation: "merge" | "save" | "remove",
  toolIds: string[],
): Promise<string[]> {
  return db.transaction(async (tx) => {
    // Create once, then lock the preference row so concurrent devices cannot
    // overwrite one another's additions or unrelated preference keys.
    await tx.insert(userPreferencesTable).values({ userId, key: KEY, value: [] }).onConflictDoNothing();
    const where = and(eq(userPreferencesTable.userId, userId), eq(userPreferencesTable.key, KEY));
    const [row] = await tx
      .select({ value: userPreferencesTable.value })
      .from(userPreferencesTable)
      .where(where)
      .for("update");
    const current = readIds(row.value);
    const ids =
      operation === "remove" ? current.filter((id) => !toolIds.includes(id)) : [...new Set([...toolIds, ...current])];
    await tx.update(userPreferencesTable).set({ value: ids, updatedAt: new Date() }).where(where);
    return ids;
  });
}
