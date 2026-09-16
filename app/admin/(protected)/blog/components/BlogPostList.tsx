"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { FileText, History, MoreHorizontal, Pencil, Search, Trash2, Undo2, X } from "lucide-react";
import styles from "./blog-management.module.css";
import {
  Button, EmptyState, Input, Label, Popover, Select, SelectContent, SelectItem,
  SelectSeparator, SelectTrigger, SelectValue, StatusBadge, Table, TableBody,
  TableCell, TableHead, TableHeader, TableRow, Tabs, TabsList, TabsTrigger,
  ToolPageHeader, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@smarttools/ui";

export interface BlogPostListItem {
  id: string;
  title: string;
  author?: string;
  category?: string | null;
  updatedLabel: string;
  status: "draft" | "published" | "scheduled" | "update-scheduled" | "trash";
  detail?: string;
  editHref: string;
  historyHref: string;
}

export interface BlogListFilters {
  search: string;
  status: "all" | "draft" | "published" | "scheduled";
  category: string;
}

interface BlogPostListProps {
  posts: readonly BlogPostListItem[];
  categories: readonly { id: string; name: string }[];
  filters: BlogListFilters;
  onFiltersChange: (filters: BlogListFilters) => void;
  onSearch: () => void;
  onTrash: (post: BlogPostListItem) => void;
  onRestore: (post: BlogPostListItem) => void;
  onDuplicate?: (post: BlogPostListItem) => void;
  canCreate?: boolean;
  canArchive?: boolean;
  busy?: boolean;
  newPostHref: string;
  taxonomyHref?: string;
  categoryPagination?: ReactNode;
  pagination: { label: string; previousHref?: string; previousLabel?: string; nextHref?: string };
}

const STATUS = {
  draft: { label: "Draft", variant: "neutral" },
  published: { label: "Published", variant: "success" },
  scheduled: { label: "Scheduled", variant: "info" },
  "update-scheduled": { label: "Update scheduled", variant: "info" },
  trash: { label: "Trash", variant: "archived" },
} as const;

/** Rows and filters are presentation only; the caller owns queries and mutations. */
export function BlogPostList({
  posts, categories, filters, onFiltersChange, onSearch, onTrash, onRestore, onDuplicate,
  canCreate = false, canArchive = false, busy = false, newPostHref, taxonomyHref, pagination, categoryPagination,
}: BlogPostListProps) {
  const trash = filters.category === "trash";
  return (
    <TooltipProvider>
      <section aria-busy={busy} className={`${styles.posts} flex min-w-0 flex-col gap-6`}>
        <ToolPageHeader className={styles.heading} title="Blog posts" description="Useful ideas, ready to publish."
          actions={<div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost" className={styles.publicLink}><Link href="/blog">View public blog</Link></Button>
            {canCreate && <Button asChild><Link href={newPostHref}>New post</Link></Button>}
          </div>} />
        <Tabs className={styles.statusTabs} value={trash ? "all" : filters.status} onValueChange={(value) => {
          if (value === "all" || value === "draft" || value === "published" || value === "scheduled") {
            onFiltersChange({ ...filters, status: value, category: trash ? "all" : filters.category });
          }
        }}>
          <TabsList aria-label="Post status" className={styles.tabList}>
            <TabsTrigger value="all">All posts</TabsTrigger>
            <TabsTrigger value="draft">Drafts</TabsTrigger>
            <TabsTrigger value="published">Published</TabsTrigger>
            <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
          </TabsList>
        </Tabs>
        <form className="grid items-end gap-4 md:grid-cols-[minmax(0,1fr)_240px_auto]" onSubmit={(event) => { event.preventDefault(); onSearch(); }}>
          <div className="grid gap-2">
            <Label htmlFor="blog-search">Search posts</Label>
            <div className="relative">
              <Input id="blog-search" maxLength={200} className="pr-12" leadingIcon={<Search />} placeholder="Search posts by title"
                value={filters.search} onChange={(event) => onFiltersChange({ ...filters, search: event.target.value })} />
              {filters.search && <Button aria-label="Clear search" className="absolute right-1 top-1" size="icon-sm" variant="input-icon"
                onClick={() => onFiltersChange({ ...filters, search: "" })}><X aria-hidden="true" /></Button>}
            </div>
          </div>
          <div className="grid gap-2 md:hidden">
            <Label htmlFor="blog-status">Status</Label>
            <Select value={trash ? "trash" : filters.status} onValueChange={(value) => {
              if (value === "trash") onFiltersChange({ ...filters, category: "trash", status: "all" });
              else if (value === "all" || value === "draft" || value === "published" || value === "scheduled") onFiltersChange({ ...filters, status: value, category: trash ? "all" : filters.category });
            }}><SelectTrigger id="blog-status" className="w-full"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="all">All posts</SelectItem><SelectItem value="draft">Drafts</SelectItem><SelectItem value="published">Published</SelectItem><SelectItem value="scheduled">Scheduled</SelectItem><SelectItem value="trash">Trash</SelectItem>
            </SelectContent></Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="blog-category">Category</Label>
            <Select value={filters.category} onValueChange={(category) => onFiltersChange({ ...filters, category })}>
              <SelectTrigger id="blog-category" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All categories</SelectItem>
                {categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}
                <SelectSeparator /><SelectItem value="trash">Trash</SelectItem>
              </SelectContent>
            </Select>
            {categoryPagination}
          </div>
          <Button type="submit" variant="outline" disabled={busy}>Search</Button>
        </form>
        {posts.length === 0 ? <EmptyState icon={<FileText />} title={trash ? "Trash is empty" : !filters.search && filters.status === "all" && filters.category === "all" ? "Write your first story" : "No posts found"}
          description={trash ? "Trashed posts appear here. Restore a post to continue editing it privately." : !filters.search && filters.status === "all" && filters.category === "all" ? "Start a private draft. Add useful content, preview it, then publish when you’re ready." : "Try a different search, status, or category."}
          action={!trash && canCreate ? <Button asChild><Link href={newPostHref}>New post</Link></Button> : undefined} /> :
          <Table className={styles.postTable}>
            <TableHeader><TableRow><TableHead>{posts.some(post => post.author) ? "Title / author" : "Title"}</TableHead><TableHead className="hidden md:table-cell">Last edited</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>{posts.map((post) => <TableRow key={post.id}>
              <TableCell className="max-w-64 py-4 sm:max-w-none">
                <Link className="block font-semibold text-foreground hover:underline focus-visible:underline" href={post.editHref}>{post.title || "Untitled post"}</Link>
                {(post.author || post.category !== undefined) && <p className="mt-1 text-xs text-muted-foreground">{[post.category ?? "Uncategorized", post.author].filter(Boolean).join(" · ")}</p>}
                <p className="mt-2 text-sm text-muted-foreground md:hidden">{STATUS[post.status].label} · {post.updatedLabel}</p>
              </TableCell>
              <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{post.updatedLabel}</TableCell>
              <TableCell className={styles.statusCell}><StatusBadge className="whitespace-nowrap" variant={STATUS[post.status].variant}>{STATUS[post.status].label}</StatusBadge>
                {post.detail && <p className="mt-1 max-w-52 text-xs text-muted-foreground">{post.detail}</p>}
              </TableCell>
              <TableCell><div className={`flex justify-end gap-1 ${styles.rowActions}`}>
                <Button asChild variant="ghost" className="md:hidden"><Link href={post.editHref}>Edit post</Link></Button>
                <Tooltip><TooltipTrigger asChild><Button asChild size="icon-sm" variant="ghost" className="hidden md:inline-flex"><Link aria-label={`Edit ${post.title}`} href={post.editHref}><Pencil aria-hidden="true" /></Link></Button></TooltipTrigger><TooltipContent>Edit post</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild><Button asChild size="icon-sm" variant="ghost"><Link aria-label={`Revisions for ${post.title}`} href={post.historyHref}><History aria-hidden="true" /></Link></Button></TooltipTrigger><TooltipContent>Revision history</TooltipContent></Tooltip>
                {canArchive && <Tooltip><TooltipTrigger asChild><Button disabled={busy} aria-label={`${trash ? "Restore" : "Move to trash:"} ${post.title}`}
                  className={trash ? undefined : "text-destructive"} size="icon-sm" variant="ghost" onClick={() => trash ? onRestore(post) : onTrash(post)}>
                  {trash ? <Undo2 aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                </Button></TooltipTrigger><TooltipContent>{trash ? "Restore as draft" : "Move to trash"}</TooltipContent></Tooltip>}
                {!trash && <Popover.Root><Tooltip><TooltipTrigger asChild><Popover.Trigger asChild><Button size="icon-sm" variant="ghost" aria-label={`More actions for ${post.title || "Untitled post"}`}><MoreHorizontal aria-hidden="true" /></Button></Popover.Trigger></TooltipTrigger><TooltipContent>More post actions</TooltipContent></Tooltip><Popover.Portal><Popover.Content align="end" sideOffset={6} className="z-50 grid w-60 gap-1 rounded-lg border border-border bg-popover p-2 shadow-md">
                  {canCreate && onDuplicate && <Popover.Close asChild><Button variant="ghost" className="justify-start" disabled={busy} onClick={() => onDuplicate(post)}>Duplicate as draft</Button></Popover.Close>}
                  {(post.status === "published" || post.status === "update-scheduled" || post.status === "scheduled") && <Button asChild variant="ghost" className="justify-start"><Link href={post.editHref}>{post.status === "scheduled" ? "Manage schedule…" : "Manage live post…"}</Link></Button>}
                  <Button asChild variant="ghost" className="justify-start"><Link href={post.historyHref}>Revision history</Link></Button>
                  {canArchive && <Popover.Close asChild><Button variant="ghost" className="justify-start text-destructive" disabled={busy} onClick={() => onTrash(post)}>Move to trash…</Button></Popover.Close>}
                </Popover.Content></Popover.Portal></Popover.Root>}
              </div></TableCell>
            </TableRow>)}</TableBody>
          </Table>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {taxonomyHref && <Button asChild size="sm" variant="ghost"><Link href={taxonomyHref}>Categories & tags</Link></Button>}
          <p className="text-sm text-muted-foreground" aria-live="polite">{pagination.label}</p>
          <nav aria-label="Post pages" className="flex gap-2">
            {pagination.previousHref ? <Button asChild size="sm" variant="outline"><Link href={pagination.previousHref}>{pagination.previousLabel ?? "Previous"}</Link></Button> : <Button size="sm" variant="outline" disabled>Previous</Button>}
            {pagination.nextHref ? <Button asChild size="sm" variant="outline"><Link href={pagination.nextHref}>Next</Link></Button> : <Button size="sm" variant="outline" disabled>Next</Button>}
          </nav>
        </div>
      </section>
    </TooltipProvider>
  );
}
