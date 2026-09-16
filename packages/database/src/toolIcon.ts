import { eq } from "drizzle-orm";
import { db } from "./index.ts";
import { toolIconsTable } from "./schema.ts";

export type ToolIconRow = typeof toolIconsTable.$inferSelect;

type ToolIconInput = Omit<ToolIconRow, "updatedAt">;

export async function getToolIcons(): Promise<Record<string, ToolIconRow>> {
  const rows = await db.select().from(toolIconsTable);
  return Object.fromEntries(rows.map((row) => [row.toolId, { ...row }] as const));
}

export async function getToolIcon(toolId: string): Promise<ToolIconRow | null> {
  const [row] = await db.select().from(toolIconsTable).where(eq(toolIconsTable.toolId, toolId)).limit(1);
  return row ? { ...row } : null;
}

export async function upsertToolIcon(row: ToolIconInput): Promise<void> {
  const { toolId, ...values } = row;
  const updatedAt = new Date();
  await db
    .insert(toolIconsTable)
    .values({ toolId, ...values, updatedAt })
    .onConflictDoUpdate({
      target: toolIconsTable.toolId,
      set: { ...values, updatedAt },
    });
}

export async function deleteToolIcon(toolId: string): Promise<void> {
  await db.delete(toolIconsTable).where(eq(toolIconsTable.toolId, toolId));
}
