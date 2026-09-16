import { Caption, H3, Overline, P, TextLink } from "@smarttools/ui";
import type { listPublishedBlogPosts } from "@/lib/blog/queries";

type Post = Awaited<ReturnType<typeof listPublishedBlogPosts>>["items"][number];

export function BlogByline({ post }: { post: Pick<Post, "authorName" | "firstPublishedAt"> }) {
  return <Caption className="block font-sans text-xs leading-normal text-muted-foreground">{post.authorName}
    {post.firstPublishedAt && <> · <time dateTime={post.firstPublishedAt.toISOString()}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(post.firstPublishedAt)}</time></>}
  </Caption>;
}

export function BlogTeaser({ post, variant = "list", coverUrl }: { post: Post; variant?: "list" | "search"; coverUrl?: string }) {
  return <article className={`min-w-0 space-y-3 ${variant === "list" ? "lg:space-y-2 lg:border-b lg:border-border lg:py-5" : ""}`}>
    {coverUrl && post.coverImage && <img src={coverUrl} alt={post.coverImage.alt} width={post.coverImage.width} height={post.coverImage.height} className="h-[230px] w-full rounded-lg object-cover sm:w-[400px]" />}
    <Overline className="block font-sans text-xs font-normal leading-normal tracking-normal text-accent-text"><TextLink className="no-underline" href={`/blog?category=${encodeURIComponent(post.category.slug)}`}>{post.category.label}</TextLink></Overline>
    <H3 className={`font-sans text-[25px] leading-[1.2] ${variant === "list" ? "lg:text-[23px] lg:leading-[1.25]" : ""}`}><TextLink className="break-words text-foreground no-underline hover:underline" href={`/blog/${post.slug}`}>{post.title}</TextLink></H3>
    <P className="break-words text-[15px] leading-normal text-muted-foreground">{post.excerpt}</P>
    <BlogByline post={post} />
  </article>;
}
