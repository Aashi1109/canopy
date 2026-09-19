import { uploadAttachment, createLinkAttachment, listThreadAttachments } from "@/lib/blog/assistantThreads.ts";
import { BlogAssistantError } from "@/lib/blog/assistantValidation.ts";
import { blogAssistantRoute, readAssistantUpload, readAssistantJson } from "@/lib/blog/assistantHttp.ts";
export async function POST(request: Request, { params }: { params: Promise<{ id: string; threadId: string }> }) {
  return blogAssistantRoute(request, async (actor) => {
    if (Number(request.headers.get("content-length")) > 6 * 1024 * 1024)
      throw new BlogAssistantError("VALIDATION", "Image upload is too large.", 413);
    const { id, threadId } = await params;
    if (request.headers.get("content-type")?.split(";")[0].trim() === "application/json")
      return { attachment: await createLinkAttachment(actor, id, threadId, await readAssistantJson(request)) };
    const form = await readAssistantUpload(request);
    const file = form.get("file");
    if (!(file instanceof File)) throw new BlogAssistantError("VALIDATION", "Choose an image to upload.");
    return { attachment: await uploadAttachment(actor, id, threadId, file) };
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string; threadId: string }> }) {
  return blogAssistantRoute(request, async (actor) => {
    const { id, threadId } = await params;
    const query = new URL(request.url).searchParams;
    return listThreadAttachments(actor, id, threadId, query.get("kind") ?? "sources", query.get("cursor"));
  });
}
