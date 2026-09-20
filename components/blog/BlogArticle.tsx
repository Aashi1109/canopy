import config from "@/lib/config/config.ts";
import { ArrowLeft, ArrowRight } from "lucide-react";
import "katex/dist/katex.min.css";
import {
  Avatar,
  AvatarFallback,
  Button,
  Caption,
  Card,
  H1,
  H2,
  Overline,
  P,
  TextLink,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/index.tsx";
import { blogImageUrl, renderBlogDocument, type BlogDocument } from "@/lib/blog/document";
import { blogCanonicalUrl } from "@/lib/blog/publication";
import { CanopyFooter } from "@/components/canopy/CanopyFooter";
import { CopyBlogLink } from "./CopyBlogLink";
import { BlogPageContainer } from "./BlogPageContainer";
import { RichContent } from "@/components/content/RichContent";
import styles from "./article.module.css";

type Props = {
  document: BlogDocument;
  publication?: {
    slug: string;
    categorySlug: string;
    firstPublishedAt: Date | null;
    publishedUpdatedAt: Date | null;
    tags: { id: string; label: string; slug: string }[];
    relatedToolLinks: { id: string; name: string; href: string }[];
  };
};

/** Live posts and saved previews deliberately share the same responsive renderer. */
export function BlogArticle({ document, publication }: Props) {
  const content = renderBlogDocument(document, {
    cloudName: config.cloudinary.cloudName?.trim(),
  });
  // Only transform the renderer's validated HTML, never the stored draft. Keep link
  // styling in previews without exposing navigation or keyboard-focusable links.
  const html = publication
    ? content.html
    : content.html.replace(/<a\b[^>]*>/g, '<span class="preview-link">').replace(/<\/a>/g, "</span>");
  const url = publication ? blogCanonicalUrl(publication.slug) : null;
  const tags = publication?.tags ?? [];
  const relatedToolLinks = publication?.relatedToolLinks ?? [];
  const date = (value: Date) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(value);
  return (
    <article className={styles.article}>
      <BlogPageContainer>
        <header className={styles.introduction}>
          <div className="flex items-center gap-3">
            {publication && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button asChild variant="ghost" size="icon-sm" className="text-primary">
                      <a href="/blog" aria-label="All stories">
                        <ArrowLeft aria-hidden="true" />
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>All stories</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <Overline className={`${styles.category} ml-auto min-w-0 break-words text-right`}>
              {publication ? (
                <TextLink
                  className="no-underline"
                  href={`/blog?category=${encodeURIComponent(publication.categorySlug)}`}
                >
                  {document.category?.label}
                </TextLink>
              ) : (
                (document.category?.label ?? "Uncategorized")
              )}
            </Overline>
          </div>
          <H1 className={styles.title}>{document.title}</H1>
          <P className={styles.excerpt}>{document.excerpt}</P>
          <div className={styles.byline}>
            <Avatar className="size-10 shrink-0">
              <AvatarFallback className="bg-accent text-primary">
                {document.authorName
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <P className={styles.author}>{document.authorName}</P>
              <Caption className={styles.date}>
                {publication?.firstPublishedAt && (
                  <>
                    <time dateTime={publication.firstPublishedAt.toISOString()}>
                      {date(publication.firstPublishedAt)}
                    </time>{" "}
                    ·{" "}
                  </>
                )}
                {content.readingMinutes} min read
              </Caption>
            </div>
            {url && <CopyBlogLink url={url} />}
          </div>
          {publication?.publishedUpdatedAt &&
            publication.firstPublishedAt &&
            publication.publishedUpdatedAt.getTime() !== publication.firstPublishedAt.getTime() && (
              <Caption className="text-muted-foreground">
                Updated{" "}
                <time dateTime={publication.publishedUpdatedAt.toISOString()}>
                  {date(publication.publishedUpdatedAt)}
                </time>
              </Caption>
            )}
        </header>
        {document.coverImage && (
          <figure className={styles.cover}>
            <img
              alt={document.coverImage.alt}
              src={blogImageUrl(document.coverImage, {
                cloudName: config.cloudinary.cloudName?.trim(),
              })}
              width={document.coverImage.width}
              height={document.coverImage.height}
              fetchPriority="high"
            />
            {document.coverImage.caption && <figcaption>{document.coverImage.caption}</figcaption>}
          </figure>
        )}
        <div className={styles.readingLayout}>
          {content.headings.length > 0 && (
            <nav aria-label="On this page" className={styles.contents}>
              <Overline className={styles.contentsLabel}>In this guide</Overline>
              <ul>
                {content.headings.map((heading) => (
                  <li key={heading.id} className={heading.level > 2 ? "pl-3" : ""}>
                    <TextLink href={`#${heading.id}`} className={`${styles.contentsLink} no-underline hover:underline`}>
                      {heading.text || "Untitled section"}
                    </TextLink>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <div className={styles.main}>
            <RichContent showToaster html={html} />
            {relatedToolLinks.length > 0 && (
              <Card className={styles.toolHandoff}>
                <H2 className="font-sans text-[26px] leading-[1.6]">Put the guide to work.</H2>
                <P className="text-muted-foreground">Open the tools mentioned in this story.</P>
                <div className="flex flex-wrap gap-3">
                  {relatedToolLinks.map((tool) => (
                    <Button asChild key={tool.id} className="max-w-full whitespace-normal text-left">
                      <a href={tool.href}>
                        {tool.name} <ArrowRight aria-hidden="true" />
                      </a>
                    </Button>
                  ))}
                </div>
              </Card>
            )}
            {tags.length > 0 && (
              <nav aria-label="Article tags" className="my-6 flex flex-wrap gap-3">
                {tags.map((tag) => (
                  <Button asChild key={tag.id} variant="outline" size="sm" className="max-w-full whitespace-normal">
                    <a href={`/blog?tag=${encodeURIComponent(tag.slug)}`}>{tag.label}</a>
                  </Button>
                ))}
              </nav>
            )}
            {url && (
              <footer className={styles.authorFooter}>
                <CopyBlogLink url={url} label="Share this guide · Copy link" />
              </footer>
            )}
          </div>
          <aside className={styles.utility}>
            <Overline className="font-sans text-[11px] font-normal text-muted-foreground">SmartTools</Overline>
            <P className="leading-[1.6]">Less busywork. More room for your work.</P>
            {publication ? (
              <Button asChild variant="ghost">
                <a href="/">All tools ↗</a>
              </Button>
            ) : (
              <span className={styles.inactiveLink}>All tools ↗</span>
            )}
          </aside>
        </div>
      </BlogPageContainer>
      {!publication && (
        <div className={styles.previewFooter} inert>
          <CanopyFooter />
        </div>
      )}
    </article>
  );
}
