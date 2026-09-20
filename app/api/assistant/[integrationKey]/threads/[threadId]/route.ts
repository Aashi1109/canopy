import { assistantRoute, readAssistantJson } from "@/lib/assistant/http.ts";
import { getAssistantService } from "../../../integrations.ts";

type Context = { params: Promise<{ integrationKey: string; threadId: string }> };
export async function GET(request: Request, { params }: Context) {
  return assistantRoute(request, async (actor) => {
    const { integrationKey, threadId } = await params;
    const service = getAssistantService(integrationKey);
    const query = new URL(request.url).searchParams;
    return query.get("view") === "results"
      ? service.getThreadExecutions(actor, undefined, threadId, query.get("cursor"))
      : service.getThread(actor, undefined, threadId);
  });
}
export async function PATCH(request: Request, { params }: Context) {
  return assistantRoute(request, async (actor) => {
    const { integrationKey, threadId } = await params;
    return {
      thread: await getAssistantService(integrationKey).updateThread(
        actor,
        undefined,
        threadId,
        await readAssistantJson(request),
      ),
    };
  });
}
export async function DELETE(request: Request, { params }: Context) {
  return assistantRoute(request, async (actor) => {
    const { integrationKey, threadId } = await params;
    await getAssistantService(integrationKey).removeThreadHistory(actor, undefined, threadId, true);
    return { ok: true };
  });
}
