import { listPublishedBlogPosts } from '../../../lib/blog/queries';
import { buildBlogFeed } from '../../../lib/blog/publication';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { items } = await listPublishedBlogPosts();
    return new Response(buildBlogFeed(items), { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch {
    return new Response('The blog feed is temporarily unavailable.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
