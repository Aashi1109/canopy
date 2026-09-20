import { assistantRoute } from "@/lib/assistant/http.ts";
import { getAssistantService } from "../../../../../integrations.ts";

type Context = { params: Promise<{ integrationKey: string; threadId: string; attachmentId: string }> };
export async function GET(request: Request, { params }: Context) {
  return assistantRoute(request, async (actor) => {
    const { integrationKey, threadId, attachmentId } = await params;
    return getAssistantService(integrationKey).getThreadAttachment(actor, undefined, threadId, attachmentId);
  });
}
export async function DELETE(request: Request, { params }: Context) {
  return assistantRoute(request, async (actor) => {
    const { integrationKey, threadId, attachmentId } = await params;
    await getAssistantService(integrationKey).removeAttachment(actor, undefined, threadId, attachmentId);
    return { ok: true };
  });
}
