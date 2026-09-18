"use server";

import { measureServerAction } from "../../lib/observability/sentry.ts";
import { captureException } from "@sentry/core";
import { ZodError } from "zod";
import { BlogValidationError } from "@/lib/blog/document";
import { listPublishedBlogPosts } from "@/lib/blog/queries";
import { errorMessage } from "@/utils/errorMessage";

export async function loadMoreBlogPosts(input: unknown) {
  return measureServerAction("blog.loadMoreBlogPosts", async () => {
    try {
      return { ok: true as const, data: await listPublishedBlogPosts(input) };
    } catch (error) {
      if (!(error instanceof ZodError || error instanceof BlogValidationError)) captureException(error);
      return {
        ok: false as const,
        message: errorMessage(
          error,
          error instanceof ZodError || error instanceof BlogValidationError
            ? "These filters are no longer valid. Refresh the blog and try again."
            : "Couldn’t load more stories. Your loaded stories are still here. Try again.",
        ),
      };
    }
  });
}
