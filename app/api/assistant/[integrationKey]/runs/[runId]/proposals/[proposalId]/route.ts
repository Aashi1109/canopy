import { assistantRoute, readAssistantJson } from "@/lib/assistant/http.ts";
import { getAssistantService } from "../../../../../integrations.ts";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ integrationKey: string; runId: string; proposalId: string }> },
) {
  return assistantRoute(request, async (actor) => {
    const { integrationKey, runId, proposalId } = await params;
    return {
      run: await getAssistantService(integrationKey).updateProposal(
        actor,
        runId,
        proposalId,
        await readAssistantJson(request),
      ),
    };
  });
}
