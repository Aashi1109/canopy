import { assistantRoute } from "@/lib/assistant/http.ts";
import { getAssistantService } from "../../integrations.ts";

export async function GET(request: Request, { params }: { params: Promise<{ integrationKey: string }> }) {
  return assistantRoute(request, async (actor) => getAssistantService((await params).integrationKey).config(actor));
}
