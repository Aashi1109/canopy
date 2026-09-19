import { getBlogRun } from "@/lib/blog/assistantRuns.ts";
import { blogAssistantRoute } from "@/lib/blog/assistantHttp.ts";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return blogAssistantRoute(request, async (actor) => ({ run: await getBlogRun(actor, (await params).id) }));
}
