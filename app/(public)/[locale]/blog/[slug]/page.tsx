import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { localizeHref, type Locale } from "@/lib/i18n/config";
import { ArrowRight } from "lucide-react";
import { H2, Overline, TextLink } from "@/components/ui/index.tsx";
import { blogArticleMetadata, blogStructuredData } from "@/lib/blog/publication";
import { getPublishedBlogPost, listPublishedBlogPosts } from "@/lib/blog/queries";
import { BlogTeaser } from "@/app/blog/components/BlogTeaser";
import { BlogArticle } from "@/components/blog/BlogArticle";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };
const loadPost = cache(async (slug: string) => {
  if (slug.length > 160 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) notFound();
  const post = await getPublishedBlogPost(slug);
  if (!post) notFound();
  return post;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return blogArticleMetadata(await loadPost((await params).slug));
}

export default async function BlogArticlePage({ params }: Props) {
  const [post, t, locale] = await Promise.all([loadPost((await params).slug), getTranslations("Blog"), getLocale()]);
  const related = await listPublishedBlogPosts({ category: post.category.slug })
    .then((page) => page.items.filter((item) => item.id !== post.id).slice(0, 2))
    .catch(() => []);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: blogStructuredData(post) }} />
      <BlogArticle document={post.document} publication={{ ...post, categorySlug: post.category.slug }} />
      {related.length > 0 && (
        <section aria-labelledby="related-stories" className="border-t border-border bg-muted px-6 py-8 lg:px-12">
          <div className="mx-auto grid max-w-[1184px] gap-7 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
            <div className="flex min-w-0 flex-col items-start gap-3">
              <Overline className="font-sans text-[11px] font-semibold tracking-[1.8px] text-muted-foreground">
                {t("nextChapter")}
              </Overline>
              <H2 id="related-stories" className="font-sans text-[34px] font-semibold leading-[1.1] tracking-[-1px]">
                {t("keepGoing")}
              </H2>
              <TextLink
                href={localizeHref("/blog", locale as Locale)}
                className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent-text no-underline hover:underline"
              >
                {t("exploreAll")} <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
              </TextLink>
            </div>
            <ol className="m-0 grid min-w-0 list-none gap-6 p-0 sm:grid-cols-2">
              {related.map((item, index) => (
                <li key={item.id} className="min-w-0">
                  <BlogTeaser post={item} variant="related" number={index + 1} />
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}
    </>
  );
}
