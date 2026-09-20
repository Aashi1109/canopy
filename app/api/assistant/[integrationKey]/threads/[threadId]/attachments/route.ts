import { assistantRoute, readAssistantJson, readAssistantUpload } from "@/lib/assistant/http.ts";
import { AssistantError } from "@/lib/assistant/validation.ts";
import { getAssistantService } from "../../../../integrations.ts";

type Context = { params: Promise<{ integrationKey: string; threadId: string }> };
export async function GET(request: Request, { params }: Context) {
  return assistantRoute(request, async (actor) => {
    const { integrationKey, threadId } = await params;
    const query = new URL(request.url).searchParams;
    return getAssistantService(integrationKey).listThreadAttachments(
      actor,
      undefined,
      threadId,
      query.get("kind") ?? "sources",
      query.get("cursor"),
    );
  });
}
export async function POST(request: Request, { params }: Context) {
  return assistantRoute(request, async (actor) => {
    if (Number(request.headers.get("content-length")) > 6 * 1024 * 1024)
      throw new AssistantError("VALIDATION", "Image upload is too large.", 413);
    const { integrationKey, threadId } = await params;
    const service = getAssistantService(integrationKey);
    if (request.headers.get("content-type")?.split(";")[0].trim() === "application/json")
      return {
        attachment: await service.createLinkAttachment(actor, undefined, threadId, await readAssistantJson(request)),
      };
    const form = await readAssistantUpload(request);
    const file = form.get("file");
    if (!(file instanceof File)) throw new AssistantError("VALIDATION", "Choose an image to upload.");
    return { attachment: await service.uploadAttachment(actor, undefined, threadId, file) };
  });
}
