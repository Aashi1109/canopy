"use server";

import { errorMessage } from "../../../../utils/errorMessage.ts";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActorUserId } from "../../../../lib/admin/access";
import {
  createManagedTool,
  MAX_TOOL_ICON_BYTES,
  removeToolIcon,
  saveToolIcon,
  setToolContentPublished,
  updateToolContent,
} from "../../../../lib/admin/adminMutations";

export type ToolContentActionState = {
  readonly status: "idle" | "success" | "error";
  readonly message: string;
};

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/** One entry per line; blank lines are dropped, so a blank box means "none". */
function lines(formData: FormData, key: string): string[] {
  return text(formData, key)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function keywords(formData: FormData, key: string): string[] {
  return text(formData, key)
    .split(/[\n,]/)
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0);
}

function jsonList(formData: FormData, key: string, label: string): unknown[] {
  const raw = text(formData, key);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
  if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array.`);
  return parsed;
}

function failure(error: unknown): ToolContentActionState {
  return {
    status: "error",
    message: errorMessage(error, "The change could not be saved."),
  };
}

function revalidate(toolId: string): void {
  revalidatePath("/admin/tools");
  revalidatePath(`/admin/tools/${encodeURIComponent(toolId)}`);
}

/**
 * Creates the database half of a tool — the `managed_tools` row and its empty
 * `tool_content` row — before `tools/<key>/` exists. `redirect` throws the
 * Next.js control-flow error, so it runs outside the try/catch that turns real
 * failures into a form message.
 */
export async function createToolAction(
  _previous: ToolContentActionState,
  formData: FormData,
): Promise<ToolContentActionState> {
  let toolId: string;
  try {
    const created = await createManagedTool(await getActorUserId(), {
      app: text(formData, "app"),
      key: text(formData, "key"),
      name: text(formData, "name"),
      description: text(formData, "description"),
      slug: text(formData, "slug"),
      category: text(formData, "category"),
    });
    toolId = created.toolId;
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/admin/tools");
  redirect(`/admin/tools/${encodeURIComponent(toolId)}`);
}

export async function saveToolContentAction(
  _previous: ToolContentActionState,
  formData: FormData,
): Promise<ToolContentActionState> {
  const toolId = text(formData, "toolId");
  try {
    // "inherit" clears the whole document, which is how the resolver reads it:
    // a stored document replaces the shipped one wholesale or not at all.
    const overrideDoc = text(formData, "contentDocMode") === "override";
    await updateToolContent(await getActorUserId(), toolId, {
      category: text(formData, "category"),
      keywords: keywords(formData, "keywords"),
      seoTitle: text(formData, "seoTitle"),
      seoDescription: text(formData, "seoDescription"),
      contentDoc: overrideDoc
        ? {
            howToUse: lines(formData, "howToUse"),
            limitations: lines(formData, "limitations"),
            faq: jsonList(formData, "faq", "FAQ"),
            examples: jsonList(formData, "examples", "Examples"),
            relatedToolIds: lines(formData, "relatedToolIds"),
          }
        : null,
    });
    revalidate(toolId);
    return { status: "success", message: "Content saved." };
  } catch (error) {
    return failure(error);
  }
}

export async function publishToolContentAction(
  _previous: ToolContentActionState,
  formData: FormData,
): Promise<ToolContentActionState> {
  const toolId = text(formData, "toolId");
  const published = text(formData, "published") === "true";
  try {
    await setToolContentPublished(await getActorUserId(), toolId, published);
    revalidate(toolId);
    return {
      status: "success",
      message: published ? "Stored content is live." : "Stored content is back to draft; the code values are live.",
    };
  } catch (error) {
    return failure(error);
  }
}

export async function uploadToolIconAction(
  _previous: ToolContentActionState,
  formData: FormData,
): Promise<ToolContentActionState> {
  const toolId = text(formData, "toolId");
  try {
    const file = formData.get("icon");
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("Choose a PNG, JPG, or WebP image.");
    }
    // Size is rejected before the file is ever read into memory.
    if (file.size > MAX_TOOL_ICON_BYTES) {
      throw new Error("The icon must be 1 MB or smaller.");
    }
    await saveToolIcon(await getActorUserId(), toolId, {
      bytes: new Uint8Array(await file.arrayBuffer()),
      mimeType: file.type,
    });
    revalidate(toolId);
    return { status: "success", message: "Icon uploaded." };
  } catch (error) {
    return failure(error);
  }
}

export async function removeToolIconAction(
  _previous: ToolContentActionState,
  formData: FormData,
): Promise<ToolContentActionState> {
  const toolId = text(formData, "toolId");
  try {
    await removeToolIcon(await getActorUserId(), toolId);
    revalidate(toolId);
    return {
      status: "success",
      message: "Icon removed; the tool falls back to its generated identicon.",
    };
  } catch (error) {
    return failure(error);
  }
}
