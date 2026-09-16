import { getTools } from "@/lib/tool-framework/catalog";
import { getBlogSitemapEntries } from "@/lib/blog/queries";
import type { MetadataRoute } from "next";

// Deliberately no `generateStaticParams` companion anywhere: slugs and
// enablement live in `managed_tools`, so this must be read at request time or
// every admin toggle would need a redeploy to show up.
//
// `force-dynamic` is what actually enforces that. Next prerenders `sitemap.ts`
// at build time by default, which both froze the tool list into the bundle and
// made `next build` require a reachable, migrated database — a deployment
// coupling we do not want.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL ?? "http://localhost:3000";

  // A sitemap is not worth a 500. If the catalog cannot be read, serve the
  // known-good static entries rather than failing the whole route.
  let tools: Awaited<ReturnType<typeof getTools>> = [];
  try {
    tools = await getTools();
  } catch {
    tools = [];
  }

  // ponytail: one sitemap holds 50,000 URLs; split into sitemap files before
  // reaching this total. Keep the established tool URLs ahead of blog entries.
  const entries: MetadataRoute.Sitemap = tools.slice(0, 50000).map((tool) => ({
    url: new URL(tool.href, base).toString(),
    changeFrequency: "weekly",
    priority: 0.7,
  }));
  try {
    const posts = await getBlogSitemapEntries(50000 - entries.length);
    entries.push(...posts.map((post) => ({
      url: new URL(`/blog/${post.slug}`, base).toString(),
      lastModified: post.publishedUpdatedAt ?? undefined,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })));
  } catch {
    // A blog migration or read failure must not remove the existing tool URLs.
  }
  return entries;
}
