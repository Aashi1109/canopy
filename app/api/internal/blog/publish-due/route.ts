import config from "@/lib/config/config.ts";
import { handleBlogPublishRequest } from "@/lib/blog/cron";
import { captureException } from "@sentry/core";
import { after } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleBlogPublishRequest(request, config.blog.schedulerSecret, async () => {
    try {
      const { publishDueBlogPosts } = await import("@/lib/blog/mutations");
      const result = await publishDueBlogPosts();
      after(async () => {
        try {
          const { cleanupBlogAssistant } = await import("@/lib/blog/assistantMaintenance.ts");
          const cleanup = await cleanupBlogAssistant();
          if (cleanup.failed) console.warn("Blog assistant cleanup needs retry", cleanup);
        } catch {
          console.warn("Blog assistant maintenance is temporarily unavailable");
        }
      });
      return result;
    } catch (error) {
      captureException(error);
      throw error;
    }
  });
}
