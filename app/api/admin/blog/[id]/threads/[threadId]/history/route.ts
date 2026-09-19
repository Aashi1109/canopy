import { removeThreadHistory } from "@/lib/blog/assistantThreads.ts";
import { blogAssistantRoute } from "@/lib/blog/assistantHttp.ts";
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; threadId: string }> }) {
  return blogAssistantRoute(request, async (actor) => {
    const { id, threadId } = await params;
    await removeThreadHistory(actor, id, threadId);
    return { ok: true };
  });
}
