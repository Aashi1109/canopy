import config from "@/lib/config/config.ts";
import { handleBlogPublishRequest } from "@/lib/blog/cron";
import { captureException } from "@sentry/core";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleBlogPublishRequest(request, config.blog.schedulerSecret, async () => {
    try {
      const { publishDueBlogPosts } = await import("@/lib/blog/mutations");
      return await publishDueBlogPosts();
    } catch (error) {
      captureException(error);
      throw error;
    }
  });
}
