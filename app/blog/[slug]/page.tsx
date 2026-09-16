import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { H2 } from "@smarttools/ui";
import { blogArticleMetadata, blogStructuredData } from "@/lib/blog/publication";
import { getPublishedBlogPost, listPublishedBlogPosts } from "@/lib/blog/queries";
import { BlogTeaser } from "../components/BlogTeaser";
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
  const post = await loadPost((await params).slug);
  const related = await listPublishedBlogPosts({ category: post.category.slug })
    .then((page) => page.items.filter((item) => item.id !== post.id).slice(0, 2))
    .catch(() => []);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: blogStructuredData(post) }} />
      <BlogArticle document={post.document} publication={{ ...post, categorySlug: post.category.slug }} />
      {related.length > 0 && (
        <section aria-labelledby="related-stories" className="hidden bg-muted px-8 pb-14 pt-10 md:block">
          <div className="mx-auto max-w-[920px]">
            <H2 id="related-stories" className="font-sans text-[30px] leading-[1.6]">
              Keep a good thing going.
            </H2>
            <div className="mt-7 grid grid-cols-2 gap-10">
              {related.map((item) => (
                <BlogTeaser key={item.id} post={item} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
