import { removeAttachment, getThreadAttachment } from "@/lib/blog/assistantThreads.ts";
import { blogAssistantRoute } from "@/lib/blog/assistantHttp.ts";
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; threadId: string; attachmentId: string }> },
) {
  return blogAssistantRoute(request, async (actor) => {
    const { id, threadId, attachmentId } = await params;
    await removeAttachment(actor, id, threadId, attachmentId);
    return { ok: true };
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; threadId: string; attachmentId: string }> },
) {
  return blogAssistantRoute(request, async (actor) => {
    const { id, threadId, attachmentId } = await params;
    return getThreadAttachment(actor, id, threadId, attachmentId);
  });
}
