"use client";

import { AdminPageHeader } from "@/app/admin/(protected)/components/AdminPageHeader";
import Link from "next/link";
import { AdminListing } from "../../components/AdminListing";
import { AdminFilters } from "../../components/AdminFilters";
import type { ReactNode } from "react";
import { CalendarClock, Copy, FileText, Globe, History, MoreHorizontal, Pencil, Trash2, Undo2 } from "lucide-react";
import styles from "./blog-management.module.css";
import {
  Badge,
  Button,
  EmptyState,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/index.tsx";

export interface BlogPostListItem {
  id: string;
  title: string;
  author?: string;
  category?: string | null;
  updatedLabel: string;
  status: "draft" | "published" | "scheduled" | "update-scheduled" | "trash";
  generationStatus?: string | null;
  detail?: string;
  editHref: string;
  historyHref: string;
}

export interface BlogListFilters {
  search: string;
  status: "all" | "draft" | "published" | "scheduled" | "trash";
  category: string;
}

interface BlogPostListProps {
  posts: readonly BlogPostListItem[];
  categories: readonly { id: string; name: string }[];
  filters: BlogListFilters;
  onTrash: (post: BlogPostListItem) => void;
  onRestore: (post: BlogPostListItem) => void;
  onDuplicate?: (post: BlogPostListItem) => void;
  canCreate?: boolean;
  canArchive?: boolean;
  busy?: boolean;
  newPostHref: string;
  publicBlogHref?: string;
  taxonomyHref?: string;
  categoryPagination?: ReactNode;
  pagination: { label: string; page: number; pageCount: number; getPageHref: (page: number) => string };
}

const STATUS = {
  draft: { label: "Draft", variant: "neutral" },
  published: { label: "Published", variant: "success" },
  scheduled: { label: "Scheduled", variant: "info" },
  "update-scheduled": { label: "Update scheduled", variant: "info" },
  trash: { label: "Trash", variant: "archived" },
} as const;

/** The caller owns post queries and mutations; AdminFilters owns filter navigation. */
export function BlogPostList({
  posts,
  categories,
  filters,
  onTrash,
  onRestore,
  onDuplicate,
  canCreate = false,
  canArchive = false,
  busy = false,
  newPostHref,
  publicBlogHref = "/blog",
  taxonomyHref,
  pagination,
  categoryPagination,
}: BlogPostListProps) {
  const trash = filters.status === "trash";
  return (
    <TooltipProvider>
      <section
        aria-busy={busy}
        className={`${styles.posts} flex h-full min-h-0 min-w-0 flex-col gap-5 [&>header]:shrink-0 [&>form]:shrink-0`}
      >
        <AdminPageHeader
          className={styles.heading}
          title="Blog posts"
          description="Useful ideas, ready to publish."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {taxonomyHref && (
                <Button asChild variant="ghost">
                  <Link href={taxonomyHref}>Categories & tags</Link>
                </Button>
              )}
              <Button asChild variant="ghost" className={styles.publicLink}>
                <Link href={publicBlogHref}>View public blog</Link>
              </Button>
              {canCreate && (
                <Button asChild>
                  <Link href={newPostHref}>New post</Link>
                </Button>
              )}
            </div>
          }
        />
        <AdminFilters
          search={{ key: "search", label: "Search posts", placeholder: "Search posts by title", maxLength: 200 }}
          selects={[
            {
              key: "status",
              label: "Status",
              options: [
                { value: "all", label: "All statuses" },
                { value: "draft", label: "Drafts" },
                { value: "published", label: "Published" },
                { value: "scheduled", label: "Scheduled" },
                { value: "trash", label: "Trash" },
              ],
            },
            {
              key: "categoryId",
              label: "Category",
              options: [
                { value: "all", label: "All categories" },
                ...categories.map((category) => ({ value: category.id, label: category.name })),
              ],
            },
          ]}
        />
        {categoryPagination}
        <AdminListing
          aria-label="Blog posts"
          pagination={{
            "aria-label": "Post pages",
            page: pagination.page,
            pageCount: pagination.pageCount,
            getPageHref: pagination.getPageHref,
            disabled: busy,
            summary: pagination.label,
          }}
        >
          {posts.length === 0 ? (
            <EmptyState
              icon={<FileText />}
              title={
                trash
                  ? "Trash is empty"
                  : !filters.search && filters.status === "all" && filters.category === "all"
                    ? "Write your first story"
                    : "No posts found"
              }
              description={
                trash
                  ? "Trashed posts appear here. Restore a post to continue editing it privately."
                  : !filters.search && filters.status === "all" && filters.category === "all"
                    ? "Start a private draft. Add useful content, preview it, then publish when you’re ready."
                    : "Try a different search, status, or category."
              }
              action={
                !trash && canCreate ? (
                  <Button asChild>
                    <Link href={newPostHref}>New post</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Table className="min-w-[800px] table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">
                    {posts.some((post) => post.author) ? "Title / author" : "Title"}
                  </TableHead>
                  <TableHead className="w-[22%]">Last edited</TableHead>
                  <TableHead className="w-[20%]">Status</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.map((post) => (
                  <TableRow key={post.id}>
                    <TableCell className="whitespace-normal break-words">
                      <Link
                        className="block font-semibold text-foreground hover:underline focus-visible:underline"
                        href={post.editHref}
                      >
                        {post.title || "Untitled post"}
                      </Link>
                      {(post.author || post.category !== undefined) && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {[post.category ?? "Uncategorized", post.author].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">{post.updatedLabel}</TableCell>
                    <TableCell className="whitespace-normal">
                      <StatusBadge className="mr-2 whitespace-nowrap" variant={STATUS[post.status].variant}>
                        {STATUS[post.status].label}
                      </StatusBadge>
                      {post.detail === "Unpublished changes" && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge asChild variant="secondary" className="mr-2">
                              <button type="button" aria-label="Unpublished changes">
                                +1
                              </button>
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>Unpublished changes</TooltipContent>
                        </Tooltip>
                      )}
                      {post.generationStatus && post.generationStatus !== "completed" && post.status !== "trash" && (
                        <StatusBadge
                          className="whitespace-nowrap"
                          variant={post.generationStatus === "failed" ? "danger" : "info"}
                        >
                          {post.generationStatus === "failed"
                            ? "AI failed"
                            : post.generationStatus === "cancelled"
                              ? "AI cancelled"
                              : post.generationStatus === "unknown"
                                ? "AI status unknown"
                                : "AI processing"}
                        </StatusBadge>
                      )}
                      {post.detail && post.detail !== "Unpublished changes" && (
                        <p className="mt-1 max-w-52 text-xs text-muted-foreground">{post.detail}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <DropdownMenu>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label={`More actions for ${post.title || "Untitled post"}`}
                                >
                                  <MoreHorizontal aria-hidden="true" />
                                </Button>
                              </DropdownMenuTrigger>
                            </TooltipTrigger>
                            <TooltipContent>More post actions</TooltipContent>
                          </Tooltip>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem asChild>
                              <Link href={post.editHref}>
                                <Pencil aria-hidden="true" />
                                Edit post
                              </Link>
                            </DropdownMenuItem>
                            {!trash && canCreate && onDuplicate && (
                              <DropdownMenuItem disabled={busy} onSelect={() => onDuplicate(post)}>
                                <Copy aria-hidden="true" />
                                Duplicate as draft
                              </DropdownMenuItem>
                            )}
                            {(post.status === "published" ||
                              post.status === "update-scheduled" ||
                              post.status === "scheduled") && (
                              <DropdownMenuItem asChild>
                                <Link href={post.editHref}>
                                  {post.status === "scheduled" ? (
                                    <CalendarClock aria-hidden="true" />
                                  ) : (
                                    <Globe aria-hidden="true" />
                                  )}
                                  {post.status === "scheduled" ? "Manage schedule…" : "Manage live post…"}
                                </Link>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem asChild>
                              <Link href={post.historyHref}>
                                <History aria-hidden="true" />
                                Revision history
                              </Link>
                            </DropdownMenuItem>
                            {canArchive && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className={
                                    trash
                                      ? undefined
                                      : "text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"
                                  }
                                  disabled={busy}
                                  onSelect={() => (trash ? onRestore(post) : onTrash(post))}
                                >
                                  {trash ? <Undo2 aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                                  {trash ? "Restore as draft" : "Move to trash…"}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </AdminListing>
      </section>
    </TooltipProvider>
  );
}
