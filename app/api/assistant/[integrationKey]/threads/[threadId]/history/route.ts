import { assistantRoute } from "@/lib/assistant/http.ts";
import { getAssistantService } from "../../../../integrations.ts";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ integrationKey: string; threadId: string }> },
) {
  return assistantRoute(request, async (actor) => {
    const { integrationKey, threadId } = await params;
    await getAssistantService(integrationKey).removeThreadHistory(actor, undefined, threadId);
    return { ok: true };
  });
}
