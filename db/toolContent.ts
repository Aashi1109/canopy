import { eq } from "drizzle-orm";
import { db } from "./index.ts";
import { toolContentTable } from "./schema.ts";

export type ToolContentRow = typeof toolContentTable.$inferSelect;

type ToolContentPatch = Partial<Omit<ToolContentRow, "toolId" | "updatedAt">>;

export async function getToolContentRows(): Promise<ToolContentRow[]> {
  const rows = await db.select().from(toolContentTable);
  return rows.map((row) => ({ ...row }));
}

export async function getToolContentRow(toolId: string): Promise<ToolContentRow | null> {
  const [row] = await db.select().from(toolContentTable).where(eq(toolContentTable.toolId, toolId)).limit(1);
  return row ? { ...row } : null;
}

export async function upsertToolContent(toolId: string, patch: ToolContentPatch): Promise<void> {
  const updatedAt = new Date();
  await db
    .insert(toolContentTable)
    .values({ toolId, ...patch, updatedAt })
    .onConflictDoUpdate({
      target: toolContentTable.toolId,
      set: { ...patch, updatedAt },
    });
}

async function setToolContentPublishedAt(toolId: string, publishedAt: Date | null): Promise<void> {
  await db
    .update(toolContentTable)
    .set({ publishedAt, updatedAt: new Date() })
    .where(eq(toolContentTable.toolId, toolId));
}

export async function publishToolContent(toolId: string): Promise<void> {
  await setToolContentPublishedAt(toolId, new Date());
}

export async function unpublishToolContent(toolId: string): Promise<void> {
  await setToolContentPublishedAt(toolId, null);
}
