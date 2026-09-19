import { db } from "@/db/index.ts";
import { requireTransactionPermission } from "@/lib/admin/adminMutations.ts";
import { assistantAvailability } from "@/lib/blog/assistantThreads.ts";
import { blogAssistantRoute } from "@/lib/blog/assistantHttp.ts";
export async function GET(request: Request) {
  return blogAssistantRoute(request, async (actor) => {
    await db.transaction(async (tx) => {
      try {
        await requireTransactionPermission(tx, actor, "blog", "view");
      } catch {
        await requireTransactionPermission(tx, actor, "blog", "create");
      }
    });
    return assistantAvailability();
  });
}
