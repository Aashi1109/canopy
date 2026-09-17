"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertBanner,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  Button,
} from "@canopy/ui";
import type { listBlogPosts } from "@/lib/blog/queries";
import { mutateBlogAction } from "../actions";
import { BlogPostList, type BlogListFilters, type BlogPostListItem } from "./BlogPostList";
import { useBlogTaxonomyOptions, type TaxonomyOptions } from "../lib/useBlogTaxonomyOptions";

type Post = Awaited<ReturnType<typeof listBlogPosts>>["items"][number];
interface Props {
  posts: Post[];
  categories: TaxonomyOptions;
  filters: {
    search?: string;
    status?: "draft" | "published" | "scheduled" | "trash";
    categoryId?: string;
    cursor?: string;
  };
  nextCursor: string | null;
  canCreate: boolean;
  canArchive: boolean;
  canManageTerms: boolean;
}

export function BlogPosts({
  posts,
  categories: initialCategories,
  filters: initial,
  nextCursor,
  canCreate,
  canArchive,
  canManageTerms,
}: Props) {
  const router = useRouter();
  const categoryOptions = useBlogTaxonomyOptions(
    "category",
    initialCategories,
    initial.categoryId ? [{ id: initial.categoryId, label: "Selected category" }] : [],
  );
  const [navigating, startNavigation] = useTransition();
  const appliedFilters: BlogListFilters = {
    search: initial.search ?? "",
    status: initial.status === "trash" ? "all" : (initial.status ?? "all"),
    category: initial.status === "trash" ? "trash" : (initial.categoryId ?? "all"),
  };
  const [filters, setFilters] = useState(appliedFilters);
  const [selected, setSelected] = useState<BlogPostListItem | null>(null);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState("");
  const [undo, setUndo] = useState<{ postId: string; version: number } | null>(null);
  const [notice, setNotice] = useState<{
    title: string;
    description: string;
    href: string;
    label: string;
  } | null>(null);

  function href(next: BlogListFilters, cursor?: string) {
    const query = new URLSearchParams();
    if (next.search.trim()) query.set("search", next.search.trim());
    if (next.category === "trash") query.set("status", "trash");
    else {
      if (next.status !== "all") query.set("status", next.status);
      if (next.category !== "all") query.set("categoryId", next.category);
    }
    if (cursor) query.set("cursor", cursor);
    return `/admin/blog${query.size ? `?${query}` : ""}`;
  }

  async function archive(post: BlogPostListItem, operation: "trash" | "restoreTrash") {
    const source = posts.find((item) => item.id === post.id);
    if (!source || mutating) return;
    setMutating(true);
    setError("");
    setNotice(null);
    try {
      const result = await mutateBlogAction(operation, {
        postId: source.id,
        version: source.version,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSelected(null);
      setUndo(
        operation === "trash" && "version" in result.data ? { postId: source.id, version: result.data.version } : null,
      );
      setNotice(
        operation === "trash"
          ? {
              title: "Post moved to trash",
              description: "Your content is retained. Restore it from Trash to continue editing.",
              href: "/admin/blog?status=trash",
              label: "Open Trash",
            }
          : {
              title: "Draft restored",
              description:
                "The post is private. Open it to edit or publish again. Its previous schedule has not been restored.",
              href: post.editHref,
              label: "Open draft",
            },
      );
      router.refresh();
    } catch {
      setError("The request failed. Your post has not been removed from this list. Try again.");
    } finally {
      setMutating(false);
    }
  }

  async function undoTrash() {
    if (!undo || mutating) return;
    setMutating(true);
    setError("");
    try {
      const result = await mutateBlogAction("restoreTrash", undo);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setNotice({
        title: "Draft restored",
        description: "The post is private. Open it to edit or publish again.",
        href: `/admin/blog/${undo.postId}`,
        label: "Open draft",
      });
      setUndo(null);
      router.refresh();
    } catch {
      setError("Couldn’t restore the draft. Your content is still in Trash. Try again.");
    } finally {
      setMutating(false);
    }
  }

  async function duplicate(post: BlogPostListItem) {
    const source = posts.find((item) => item.id === post.id);
    if (!source || mutating) return;
    setMutating(true);
    setError("");
    setNotice(null);
    try {
      const result = await mutateBlogAction("duplicate", { postId: source.id });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/admin/blog/${result.data.id}`);
      router.refresh();
    } catch {
      setError("Couldn’t duplicate this post. The original is unchanged. Try again.");
    } finally {
      setMutating(false);
    }
  }

  const rows: BlogPostListItem[] = posts.map((post) => ({
    id: post.id,
    title: post.title,
    updatedLabel:
      new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(new Date(post.updatedAt)) + " UTC",
    status: post.trashedAt
      ? "trash"
      : post.schedule
        ? post.publishedRevisionId
          ? "update-scheduled"
          : "scheduled"
        : post.publishedRevisionId
          ? "published"
          : "draft",
    detail: post.schedule
      ? `${post.publishedRevisionId ? "Current article is live · " : ""}${post.schedule.lastErrorCode ? "Publishing delayed · " : ""}${new Date(post.schedule.scheduledAt).toISOString().slice(0, 16).replace("T", " ")} UTC`
      : post.hasUnpublishedChanges
        ? "Unpublished changes"
        : undefined,
    editHref: `/admin/blog/${post.id}`,
    historyHref: `/admin/blog/${post.id}/history`,
  }));

  return (
    <>
      {notice && (
        <div className="mb-6" role="status">
          <AlertBanner variant="success" title={notice.title}>
            {notice.description}
            <div className="mt-3 flex flex-wrap gap-2">
              {undo && (
                <Button
                  size="sm"
                  variant="outline"
                  loading={mutating}
                  onClick={() => {
                    void undoTrash();
                  }}
                >
                  Undo
                </Button>
              )}
              <Button asChild size="sm" variant="outline">
                <Link href={notice.href}>{notice.label}</Link>
              </Button>
            </div>
          </AlertBanner>
        </div>
      )}
      {error && !selected && (
        <div className="mb-4">
          <AlertBanner variant="error">{error}</AlertBanner>
        </div>
      )}
      <BlogPostList
        posts={rows}
        categories={categoryOptions.items}
        filters={filters}
        canCreate={canCreate}
        canArchive={canArchive}
        categoryPagination={
          <>
            {categoryOptions.hasMore && (
              <Button
                size="xs"
                variant="ghost"
                loading={categoryOptions.loading}
                onClick={() => {
                  void categoryOptions.loadMore();
                }}
              >
                Load more categories
              </Button>
            )}
            {categoryOptions.error && (
              <p role="alert" className="text-xs text-destructive">
                {categoryOptions.error}
              </p>
            )}
          </>
        }
        busy={navigating || mutating}
        newPostHref="/admin/blog/new"
        taxonomyHref={canManageTerms ? "/admin/blog/taxonomy" : undefined}
        onFiltersChange={(next) => {
          setFilters(next);
          if (next.status !== filters.status || next.category !== filters.category || (filters.search && !next.search))
            startNavigation(() => router.push(href(next)));
        }}
        onSearch={() => startNavigation(() => router.push(href(filters)))}
        onDuplicate={(post) => {
          void duplicate(post);
        }}
        onTrash={(post) => {
          setError("");
          setSelected(post);
        }}
        onRestore={(post) => {
          void archive(post, "restoreTrash");
        }}
        pagination={{
          label: `Showing ${posts.length} ${posts.length === 1 ? "post" : "posts"}${nextCursor ? " · More available" : ""}`,
          previousHref: initial.cursor ? href(appliedFilters) : undefined,
          previousLabel: "First page",
          nextHref: nextCursor ? href(appliedFilters, nextCursor) : undefined,
        }}
      />
      <AlertDialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open && !mutating) setSelected(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move this {selected?.status === "draft" ? "draft" : "post"} to trash?</AlertDialogTitle>
            <AlertDialogDescription>
              “{selected?.title || "Untitled post"}” will leave your post list.{" "}
              {selected?.status === "published" || selected?.status === "update-scheduled"
                ? "The live article will no longer be visible to readers. "
                : ""}
              {selected?.status === "scheduled" || selected?.status === "update-scheduled"
                ? "Its publication schedule will be cancelled. "
                : ""}
              You can restore its content as a private draft from Trash.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <AlertBanner variant="error">{error}</AlertBanner>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutating}>Keep post</AlertDialogCancel>
            <Button
              variant="destructive"
              loading={mutating}
              onClick={() => {
                if (selected) void archive(selected, "trash");
              }}
            >
              Move to trash
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
