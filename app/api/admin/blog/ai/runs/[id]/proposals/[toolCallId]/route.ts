import { updateProposal } from "@/lib/blog/assistantRuns.ts";
import { blogAssistantRoute, readAssistantJson } from "@/lib/blog/assistantHttp.ts";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; toolCallId: string }> }) {
  return blogAssistantRoute(request, async (actor) => {
    const { id, toolCallId } = await params;
    return { run: await updateProposal(actor, id, toolCallId, await readAssistantJson(request)) };
  });
}
