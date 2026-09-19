"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  Toaster,
  toast,
} from "@/components/ui/index.tsx";
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
    page?: number;
  };
  pagination: { page: number; pageCount: number; total: number };
  canCreate: boolean;
  canArchive: boolean;
  canManageTerms: boolean;
}

export function BlogPosts({
  posts,
  categories: initialCategories,
  filters: initial,
  pagination,
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
  const appliedFilters: BlogListFilters = {
    search: initial.search ?? "",
    status: initial.status ?? "all",
    category: initial.categoryId ?? "all",
  };
  const [selected, setSelected] = useState<BlogPostListItem | null>(null);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState("");
  const noticeId = useRef<string | number | undefined>(undefined);
  useEffect(
    () => () => {
      if (noticeId.current !== undefined) toast.dismiss(noticeId.current);
    },
    [],
  );

  const currentPage = pagination.page;

  function href(next: BlogListFilters, page = 1) {
    const query = new URLSearchParams();
    if (next.search.trim()) query.set("search", next.search.trim());
    if (next.status !== "all") query.set("status", next.status);
    if (next.category !== "all") query.set("categoryId", next.category);
    if (page > 1) query.set("page", String(page));
    return `/admin/blog${query.size ? `?${query}` : ""}`;
  }

  async function archive(post: BlogPostListItem, operation: "trash" | "restoreTrash") {
    const source = posts.find((item) => item.id === post.id);
    if (!source || mutating) return;
    setMutating(true);
    setError("");
    if (noticeId.current !== undefined) toast.dismiss(noticeId.current);
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
      if (operation === "trash") {
        const undo = "version" in result.data ? { postId: source.id, version: result.data.version } : null;
        noticeId.current = toast.success("Post moved to trash", {
          description: "Your content is retained in Trash.",
          duration: 10_000,
          closeButton: true,
          action: undo
            ? {
                label: "Undo",
                onClick: () => {
                  void undoTrash(undo);
                },
              }
            : undefined,
          cancel: { label: "Open Trash", onClick: () => router.push("/admin/blog?status=trash") },
        });
      } else {
        noticeId.current = toast.success("Draft restored", {
          description: "The post is private. Its previous schedule has not been restored.",
          action: { label: "Open draft", onClick: () => router.push(post.editHref) },
          closeButton: true,
        });
      }
      router.refresh();
    } catch {
      setError("The request failed. Your post has not been removed from this list. Try again.");
    } finally {
      setMutating(false);
    }
  }

  async function undoTrash(undo: { postId: string; version: number }) {
    if (mutating) return;
    setMutating(true);
    setError("");
    try {
      const result = await mutateBlogAction("restoreTrash", undo);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      noticeId.current = toast.success("Draft restored", {
        description: "The post is private. Open it to edit or publish again.",
        action: { label: "Open draft", onClick: () => router.push(`/admin/blog/${undo.postId}`) },
        closeButton: true,
      });
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
    if (noticeId.current !== undefined) toast.dismiss(noticeId.current);
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
    generationStatus: post.generationStatus,
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
      <Toaster position="top-right" />
      {error && !selected && (
        <div className="mb-4">
          <AlertBanner variant="error">{error}</AlertBanner>
        </div>
      )}
      <BlogPostList
        posts={rows}
        categories={categoryOptions.items}
        filters={appliedFilters}
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
        busy={mutating}
        newPostHref="/admin/blog/new"
        taxonomyHref={canManageTerms ? "/admin/blog/taxonomy" : undefined}
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
          label: `Showing ${pagination.total ? (currentPage - 1) * 25 + 1 : 0}–${(currentPage - 1) * 25 + posts.length} of ${pagination.total} posts`,
          page: currentPage,
          pageCount: pagination.pageCount,
          getPageHref: (page) => href(appliedFilters, page),
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
