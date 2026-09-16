"use server";

import { ZodError } from "zod";
import { BlogValidationError } from "@/lib/blog/document";
import { listPublishedBlogPosts } from "@/lib/blog/queries";

export async function loadMoreBlogPosts(input: unknown) {
  try {
    return { ok: true as const, data: await listPublishedBlogPosts(input) };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof ZodError || error instanceof BlogValidationError
        ? "These filters are no longer valid. Refresh the blog and try again."
        : "Couldn’t load more stories. Your loaded stories are still here. Try again.",
    };
  }
}
