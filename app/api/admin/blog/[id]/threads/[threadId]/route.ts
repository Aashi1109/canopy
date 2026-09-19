import { getThread, getThreadExecutions, updateThread, removeThreadHistory } from "@/lib/blog/assistantThreads.ts";
import { blogAssistantRoute, readAssistantJson } from "@/lib/blog/assistantHttp.ts";
type Context = { params: Promise<{ id: string; threadId: string }> };
export async function GET(request: Request, { params }: Context) {
  return blogAssistantRoute(request, async (actor) => {
    const { id, threadId } = await params;
    const query = new URL(request.url).searchParams;
    return query.get("view") === "results"
      ? getThreadExecutions(actor, id, threadId, query.get("cursor"))
      : getThread(actor, id, threadId);
  });
}
export async function PATCH(request: Request, { params }: Context) {
  return blogAssistantRoute(request, async (actor) => {
    const { id, threadId } = await params;
    return { thread: await updateThread(actor, id, threadId, await readAssistantJson(request)) };
  });
}
export async function DELETE(request: Request, { params }: Context) {
  return blogAssistantRoute(request, async (actor) => {
    const { id, threadId } = await params;
    await removeThreadHistory(actor, id, threadId, true);
    return { ok: true };
  });
}
