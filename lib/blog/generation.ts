import { and, db, desc, eq, sql, assistantRunsTable as runs } from "../../db/index.ts";
import { createAssistantService } from "../assistant/service.ts";
import { ACTIVE_RUN_STATUSES } from "../assistant/threads.ts";
import { blogAssistantIntegration, requirePostAccess } from "./assistantIntegration.ts";

const service = createAssistantService(blogAssistantIntegration);

export async function getInitialBlogGeneration(actor: string, postId: string) {
  return db.transaction(async (tx) => {
    await requirePostAccess(tx, actor, postId);
    const [run] = await tx
      .select()
      .from(runs)
      .where(
        and(
          eq(runs.integrationKey, "blog"),
          eq(runs.resourceId, postId),
          eq(runs.operation, "generate"),
          sql`${runs.expiresAt} > now()`,
        ),
      )
      .orderBy(desc(runs.createdAt))
      .limit(1);
    if (!run) return null;
    const view = service.runView(run);
    if (run.ownerId === actor) return { ...view, canManage: true };
    if (!ACTIVE_RUN_STATUSES.some((status) => status === run.status)) return null;
    return {
      ...view,
      canManage: false,
      id: "",
      threadId: null,
      inputMessageId: null,
      assistantMessageId: null,
      provider: "",
      model: "",
      response: null,
      errorMessage: null,
      request: { clientRequestId: "", operation: "generate" as const, message: "An article is being generated." },
    };
  });
}
