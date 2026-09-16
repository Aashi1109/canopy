"use server";

import { z, ZodError } from "zod";
import { AuthorizationError } from "@smarttools/control-plane";
import { getActorUserId } from "../../../../lib/admin/access";
import {
  BlogError,
  createBlogPost,
  duplicateBlogPost,
  saveBlogDraft,
  publishBlogPost,
  scheduleBlogPost,
  retryBlogSchedule,
  cancelBlogSchedule,
  unpublishBlogPost,
  trashBlogPost,
  restoreTrashedBlogPost,
  restoreBlogRevision,
  saveBlogTerm,
} from "../../../../lib/blog/mutations";
import { BlogValidationError, renderBlogDocument } from "../../../../lib/blog/document";
import { BlogImageUploadError, uploadBlogImage } from "../../../../lib/blog/images";
import {
  getBlogPost,
  getBlogRevision,
  listBlogPosts,
  listBlogRevisions,
  listBlogTaxonomy,
} from "../../../../lib/blog/queries";

const operations = {
  create: createBlogPost,
  duplicate: duplicateBlogPost,
  save: saveBlogDraft,
  publish: publishBlogPost,
  schedule: scheduleBlogPost,
  retrySchedule: retryBlogSchedule,
  cancelSchedule: cancelBlogSchedule,
  unpublish: unpublishBlogPost,
  trash: trashBlogPost,
  restoreTrash: restoreTrashedBlogPost,
  restoreRevision: restoreBlogRevision,
  saveTerm: saveBlogTerm,
};

function failure(error: unknown) {
  if (error instanceof BlogError)
    return { ok: false as const, code: error.code, message: error.message };
  if (error instanceof BlogValidationError || error instanceof ZodError) {
    return {
      ok: false as const,
      code: "VALIDATION" as const,
      message:
        error instanceof ZodError ? "Check the supplied fields and try again." : error.message,
    };
  }
  if (error instanceof AuthorizationError)
    return {
      ok: false as const,
      code: "FORBIDDEN" as const,
      message: "You do not have permission to perform this action.",
    };
  return {
    ok: false as const,
    code: "TEMPORARY_FAILURE" as const,
    message: "The change could not be saved. Try again.",
  };
}

/** The session owns identity. Mutation schemas reject actor IDs, slugs and extra fields. */
export async function mutateBlogAction(operation: keyof typeof operations, input: unknown) {
  const actor = await getActorUserId();
  try {
    if (!Object.hasOwn(operations, operation))
      throw new BlogError("VALIDATION", "Unknown blog operation.");
    return { ok: true as const, data: await operations[operation](actor, input) };
  } catch (error) {
    return failure(error);
  }
}

export async function uploadBlogImageAction(formData: FormData) {
  const actor = await getActorUserId();
  try {
    if (!(formData instanceof FormData)) throw new BlogError("VALIDATION", "Choose an image file.");
    const fields = [...formData.keys()];
    if (fields.length !== 1 || fields[0] !== "file")
      throw new BlogError("VALIDATION", "Supply one image file.");
    const file = formData.get("file");
    if (!(file instanceof File)) throw new BlogError("VALIDATION", "Choose an image file.");
    return { ok: true as const, data: await uploadBlogImage(actor, file) };
  } catch (error) {
    if (error instanceof BlogImageUploadError)
      return { ok: false as const, code: error.code, message: error.message };
    const result = failure(error);
    return result.code === "TEMPORARY_FAILURE"
      ? {
          ok: false as const,
          code: "UPLOAD_TEMPORARY_FAILURE" as const,
          message: "The image upload failed unexpectedly. Try uploading the image again.",
        }
      : result;
  }
}

const readInput = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("list"), filters: z.unknown().optional() }).strict(),
  z.object({ operation: z.literal("post"), postId: z.string() }).strict(),
  z
    .object({ operation: z.literal("history"), postId: z.string(), cursor: z.string().optional() })
    .strict(),
  z
    .object({
      operation: z.literal("preview"),
      postId: z.string(),
      revisionId: z.string().optional(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("taxonomy"),
      kind: z.enum(["category", "tag"]),
      filters: z.unknown().optional(),
    })
    .strict(),
]);

/** Server Actions use authenticated POST responses; no preview is placed in a public cache. */
export async function readBlogAction(input: unknown) {
  const actor = await getActorUserId();
  try {
    const value = readInput.parse(input);
    switch (value.operation) {
      case "list":
        return { ok: true as const, data: await listBlogPosts(actor, value.filters) };
      case "history":
        return {
          ok: true as const,
          data: await listBlogRevisions(actor, value.postId, value.cursor),
        };
      case "taxonomy":
        return {
          ok: true as const,
          data: await listBlogTaxonomy(actor, value.kind, value.filters),
        };
      case "post": {
        const data = await getBlogPost(actor, value.postId);
        if (!data) throw new BlogError("NOT_FOUND", "Article not found.");
        return { ok: true as const, data };
      }
      case "preview": {
        const source = value.revisionId
          ? await getBlogRevision(actor, value.postId, value.revisionId)
          : await getBlogPost(actor, value.postId);
        if (!source) throw new BlogError("NOT_FOUND", "Article or revision not found.");
        const document = "document" in source ? source.document : source.draftDocument;
        return {
          ok: true as const,
          data: {
            document,
            ...renderBlogDocument(document, {
              cloudName: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
            }),
            robots: "noindex, nofollow",
          },
        };
      }
    }
  } catch (error) {
    return failure(error);
  }
}
