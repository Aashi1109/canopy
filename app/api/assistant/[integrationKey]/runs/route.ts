import { assistantRoute, readAssistantJson } from "@/lib/assistant/http.ts";
import { getAssistantService } from "../../integrations.ts";

export async function POST(request: Request, { params }: { params: Promise<{ integrationKey: string }> }) {
  return assistantRoute(request, async (actor) =>
    getAssistantService((await params).integrationKey).streamRun(
      actor,
      await readAssistantJson(request),
      request.signal,
    ),
  );
}
