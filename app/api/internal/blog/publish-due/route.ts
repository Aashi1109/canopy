import { handleBlogPublishRequest } from "@/lib/blog/cron";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleBlogPublishRequest(request, process.env.BLOG_SCHEDULER_SECRET, async () => {
    const { publishDueBlogPosts } = await import("@/lib/blog/mutations");
    return publishDueBlogPosts();
  });
}
