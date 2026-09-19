import { createThread, listThreads } from "@/lib/blog/assistantThreads.ts";
import { blogAssistantRoute, readAssistantJson } from "@/lib/blog/assistantHttp.ts";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) {
  return blogAssistantRoute(request, async (actor) => ({ threads: await listThreads(actor, (await params).id) }));
}
export async function POST(request: Request, { params }: Context) {
  return blogAssistantRoute(request, async (actor) => ({
    thread: await createThread(actor, (await params).id, await readAssistantJson(request)),
  }));
}
