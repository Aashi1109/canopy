"use client";

import { useRef, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { localizeHref, type Locale } from "@/lib/i18n/config";
import { AlertBanner, Button, Caption, P } from "@/components/ui/index.tsx";
import type { listPublishedBlogPosts } from "@/lib/blog/queries";
import { loadMoreBlogPosts } from "../actions";
import { blogListingHref, type BlogFilters } from "../lib/filters";
import { BlogTeaser } from "./BlogTeaser";

type Page = Awaited<ReturnType<typeof listPublishedBlogPosts>>;
type Props = {
  initialPage: Page;
  filters: BlogFilters;
  featuredId?: string;
  searchCoverDelivery?: { src: string; srcSet: string };
  intro: ReactNode;
  emptyState: ReactNode;
  topics: ReactNode;
};

export function BlogStories({
  initialPage,
  filters,
  featuredId,
  searchCoverDelivery,
  intro,
  emptyState,
  topics,
}: Props) {
  const t = useTranslations("Blog");
  const locale = useLocale() as Locale;
  const [page, setPage] = useState(initialPage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const pending = useRef(false);

  async function loadMore() {
    if (pending.current || !page.nextCursor) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setAnnouncement(t("loadingStories"));
    try {
      const result = await loadMoreBlogPosts({
        search: filters.search,
        category: filters.category,
        tag: filters.tag,
        cursor: page.nextCursor,
      });
      if (!result.ok) {
        setError(t("loadFailed"));
        setAnnouncement("");
        return;
      }
      const ids = new Set(page.items.map((post) => post.id));
      const additions = result.data.items.filter((post) => {
        if (ids.has(post.id)) return false;
        ids.add(post.id);
        return true;
      });
      setPage({ items: [...page.items, ...additions], nextCursor: result.data.nextCursor });
      setAnnouncement(
        `${t("loadedMore", { count: additions.length })}${result.data.nextCursor ? "" : ` ${t("upToDate")}`}`,
      );
    } catch {
      setError(t("connectionFailed"));
      setAnnouncement("");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const stories = page.items.filter((post) => post.id !== featuredId);
  return (
    <div
      className={`order-3 grid min-w-0 gap-8 lg:gap-x-14 lg:gap-y-5 ${topics ? "lg:grid-cols-[minmax(0,1fr)_304px]" : ""}`}
    >
      <section className="flex min-w-0 flex-col" aria-labelledby="blog-stories-heading" aria-busy={busy}>
        {intro}
        {filters.search && (
          <div className="mb-8 flex items-center justify-between gap-4 text-[13px] text-muted-foreground">
            <span>
              {busy
                ? t("loadingArticles")
                : t("resultCount", { count: page.items.length, more: page.nextCursor ? "yes" : "no" })}
            </span>
            <span>{t("newestFirst")}</span>
          </div>
        )}
        <div className={`flex flex-col gap-7 ${filters.search ? "lg:gap-8" : "lg:gap-0"}`}>
          {stories.map((post, index) => (
            <BlogTeaser
              key={post.id}
              post={post}
              variant={filters.search ? "search" : "list"}
              coverDelivery={filters.search && index === 0 ? searchCoverDelivery : undefined}
            />
          ))}
        </div>
        {!page.items.length && emptyState}
        {featuredId && !stories.length && <P className="py-6 text-muted-foreground">{t("moreOnWay")}</P>}
      </section>
      {topics}
      <div
        className={`${filters.search && !page.nextCursor && !filters.cursor ? "sr-only" : "space-y-4"} lg:col-start-1 lg:row-start-2`}
      >
        {error && <AlertBanner variant="error">{error}</AlertBanner>}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Caption className="text-muted-foreground">
            {t("storyCount", { count: page.items.length })}
            {page.nextCursor ? ` · ${t("moreAvailable")}` : ""}
          </Caption>
          <nav aria-label={t("articlePages")} className="flex gap-2">
            {filters.cursor && (
              <Button asChild variant="outline" size="sm">
                <a href={localizeHref(blogListingHref(filters, { cursor: undefined }), locale)}>{t("newestStories")}</a>
              </Button>
            )}
            {page.nextCursor && (
              <Button asChild loading={busy} variant="outline" size="sm">
                <a
                  rel="next"
                  href={localizeHref(blogListingHref(filters, { cursor: page.nextCursor }), locale)}
                  onClick={(event) => {
                    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    void loadMore();
                  }}
                >
                  {error ? t("retryLoad") : t("loadMore")}
                  <ArrowRight aria-hidden="true" className="rtl:rotate-180" />
                </a>
              </Button>
            )}
          </nav>
        </div>
        <p role="status" className="sr-only">
          {announcement}
        </p>
      </div>
    </div>
  );
}
