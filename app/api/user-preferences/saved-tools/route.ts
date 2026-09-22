import { getSession } from "@/lib/auth/session.ts";
import { captureException } from "@sentry/core";
import { z } from "zod";
import { getPublicTools } from "@/lib/tool-framework/catalog";
import { changeSavedTools, getSavedTools } from "@/lib/user-preferences/savedTools";
import { isSameOriginRequest } from "@/lib/routing/requestOrigin.ts";

const headers = { "Cache-Control": "private, no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
const mutation = z
  .object({
    userId: z.string().min(1).max(200),
    operation: z.enum(["merge", "save", "remove"]),
    toolIds: z
      .array(
        z
          .string()
          .max(160)
          .regex(/^[a-z][a-z0-9-]*\.[a-z0-9]+(?:-[a-z0-9]+)*$/),
      )
      .max(500),
  })
  .strict()
  .refine((value) => value.operation === "merge" || value.toolIds.length === 1);

async function bookmarkCatalog() {
  return (await getPublicTools()).map(({ toolId, name, href, category }) => ({ toolId, name, href, category }));
}

export async function GET(request: Request) {
  try {
    const session = await getSession(request.headers);
    if (session && session.user.status !== "active")
      return json({ error: "This account cannot access saved tools." }, 403);
    const tools = await bookmarkCatalog();
    return json({
      userId: session?.user.id ?? null,
      savedTools: session ? await getSavedTools(session.user.id) : [],
      tools,
    });
  } catch (error) {
    captureException(error);
    return json({ error: "Couldn’t load saved tools. Please try again." }, 503);
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return json({ error: "Invalid request origin." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return json({ error: "Expected JSON." }, 415);
  try {
    const session = await getSession(request.headers);
    if (!session) return json({ error: "Your session ended. Sign in again to change account bookmarks." }, 401);
    if (session.user.status !== "active") return json({ error: "This account cannot change saved tools." }, 403);
    let body: unknown;
    try {
      const text = await request.text();
      if (text.length > 100_000) return json({ error: "Request is too large." }, 413);
      body = JSON.parse(text);
    } catch {
      return json({ error: "Invalid JSON." }, 400);
    }
    const parsed = mutation.safeParse(body);
    if (!parsed.success) return json({ error: "Invalid saved-tools request." }, 400);
    const { userId, operation } = parsed.data;
    // The submitted identity is a stale-session guard, never the authority.
    if (userId !== session.user.id) return json({ error: "Your account changed. Reload Saved and try again." }, 409);
    const available = new Set((await bookmarkCatalog()).map((tool) => tool.toolId));
    const ids = [...new Set(parsed.data.toolIds)].filter((id) => operation === "remove" || available.has(id));
    if (operation === "save" && ids.length === 0) return json({ error: "This tool is no longer available." }, 400);
    const savedTools = await changeSavedTools(session.user.id, operation, ids);
    return json({ userId: session.user.id, savedTools });
  } catch (error) {
    captureException(error);
    return json({ error: "Couldn’t confirm the update. Reload Saved and try again." }, 503);
  }
}
