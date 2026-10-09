import config from "@/lib/config/config.ts";
import { getPublicTools } from "@/lib/tool-framework/catalog";
import { getBlogSitemapEntries } from "@/lib/blog/queries";
import type { MetadataRoute } from "next";
import { localizeHref } from "@/lib/i18n/config";

// Deliberately no `generateStaticParams` companion anywhere: slugs and
// enablement live in `managed_tools`, so use the runtime public catalog cache
// instead of freezing the tool list until the next deployment.
//
// `force-dynamic` is what actually enforces that. Next prerenders `sitemap.ts`
// at build time by default, which both froze the tool list into the bundle and
// made `next build` require a reachable, migrated database — a deployment
// coupling we do not want.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = config.appUrl;

  // A sitemap is not worth a 500. If the catalog cannot be read, serve the
  // known-good static entries rather than failing the whole route.
  let tools: Awaited<ReturnType<typeof getPublicTools>> = [];
  try {
    tools = await getPublicTools();
  } catch {
    tools = [];
  }

  // ponytail: one sitemap holds 50,000 URLs; split into sitemap files before
  // reaching this total. Keep the established tool URLs ahead of blog entries.
  const entries: MetadataRoute.Sitemap = tools
    .flatMap((tool) =>
      tool.availableLocales.map((locale) => ({
        url: new URL(localizeHref(tool.href, locale), base).toString(),
        alternates: {
          languages: Object.fromEntries(
            tool.availableLocales.map((language) => [
              language,
              new URL(localizeHref(tool.href, language), base).toString(),
            ]),
          ),
        },
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
    )
    .slice(0, 50000);
  try {
    const posts = await getBlogSitemapEntries(50000 - entries.length);
    entries.push(
      ...posts.map((post) => ({
        url: new URL(`/blog/${post.slug}`, base).toString(),
        lastModified: post.publishedUpdatedAt ?? undefined,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
    );
  } catch {
    // A blog migration or read failure must not remove the existing tool URLs.
  }
  return entries;
}
