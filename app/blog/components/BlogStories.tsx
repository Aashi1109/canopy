"use client";

import { useRef, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
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
  searchCoverUrl?: string;
  intro: ReactNode;
  emptyState: ReactNode;
  topics: ReactNode;
};

export function BlogStories({ initialPage, filters, featuredId, searchCoverUrl, intro, emptyState, topics }: Props) {
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
    setAnnouncement("Loading stories…");
    try {
      const result = await loadMoreBlogPosts({
        search: filters.search,
        category: filters.category,
        tag: filters.tag,
        cursor: page.nextCursor,
      });
      if (!result.ok) {
        setError(result.message);
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
        `${additions.length} more ${additions.length === 1 ? "story" : "stories"} loaded.${result.data.nextCursor ? "" : " You’re up to date."}`,
      );
    } catch {
      setError("Couldn’t load more stories. Your loaded stories are still here. Check your connection and try again.");
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
                ? "Loading articles…"
                : `${page.items.length}${page.nextCursor ? "+" : ""} ${page.items.length === 1 ? "result" : "results"}`}
            </span>
            <span>Newest first</span>
          </div>
        )}
        <div className={`flex flex-col gap-7 ${filters.search ? "lg:gap-8" : "lg:gap-0"}`}>
          {stories.map((post, index) => (
            <BlogTeaser
              key={post.id}
              post={post}
              variant={filters.search ? "search" : "list"}
              coverUrl={filters.search && index === 0 ? searchCoverUrl : undefined}
            />
          ))}
        </div>
        {!page.items.length && emptyState}
        {featuredId && !stories.length && (
          <P className="py-6 text-muted-foreground">You’re up to date. More stories are on the way.</P>
        )}
      </section>
      {topics}
      <div
        className={`${filters.search && !page.nextCursor && !filters.cursor ? "sr-only" : "space-y-4"} lg:col-start-1 lg:row-start-2`}
      >
        {error && <AlertBanner variant="error">{error}</AlertBanner>}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Caption className="text-muted-foreground">
            {page.items.length} {page.items.length === 1 ? "story" : "stories"}
            {page.nextCursor ? " · More available" : ""}
          </Caption>
          <nav aria-label="Article pages" className="flex gap-2">
            {filters.cursor && (
              <Button asChild variant="outline" size="sm">
                <a href={blogListingHref(filters, { cursor: undefined })}>Newest stories</a>
              </Button>
            )}
            {page.nextCursor && (
              <Button asChild loading={busy} variant="outline" size="sm">
                <a
                  rel="next"
                  href={blogListingHref(filters, { cursor: page.nextCursor })}
                  onClick={(event) => {
                    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    void loadMore();
                  }}
                >
                  {error ? "Try loading more" : "Load more stories"}
                  <ArrowRight aria-hidden="true" />
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
