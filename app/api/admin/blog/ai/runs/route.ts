import { streamBlogRun } from "@/lib/blog/assistantRuns.ts";
import { blogAssistantRoute, readAssistantJson } from "@/lib/blog/assistantHttp.ts";
export async function POST(request: Request) {
  return blogAssistantRoute(request, async (actor) =>
    streamBlogRun(actor, await readAssistantJson(request), request.signal),
  );
}
