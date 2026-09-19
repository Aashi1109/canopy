"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { AdminListing } from "../../components/AdminListing";
import { AlertBanner, Button } from "@/components/ui/index.tsx";
import { readBlogAction } from "../actions";
import { BlogRevisionList } from "./BlogRevisionList";

export const historyPageSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      revisionNumber: z.number(),
      title: z.string(),
      reason: z.string(),
      createdAt: z.coerce.date(),
    }),
  ),
  nextCursor: z.string().nullable(),
  page: z.number().int().positive(),
  pageCount: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

type Props = {
  postId: string;
  version: number;
  publishedRevisionId: string | null;
  currentTitle: string;
};

export function BlogHistoryPanel({ postId, version, publishedRevisionId, currentTitle }: Props) {
  const [requestedPage, setRequestedPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState<z.infer<typeof historyPageSchema> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setPage(null);
    setError("");
    async function load() {
      try {
        const result = await readBlogAction({ operation: "history", postId, page: requestedPage });
        if (cancelled) return;
        if (!result.ok) {
          setError(result.message);
          return;
        }
        const parsed = historyPageSchema.safeParse(result.data);
        if (!parsed.success) {
          setError("Couldn’t load revision history. Try again.");
          return;
        }
        setPage(parsed.data);
      } catch {
        if (!cancelled) setError("Couldn’t load revision history. Try again.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [postId, version, requestedPage, attempt]);

  return (
    <AdminListing
      className="rounded-none border-0 bg-transparent shadow-none"
      aria-label="Revision history"
      pagination={{
        "aria-label": "Revision pages",
        page: page?.page ?? requestedPage,
        pageCount: page?.pageCount ?? requestedPage,
        disabled: !page,
        onPageChange: setRequestedPage,
        className: "bg-transparent px-0",
        summary: page
          ? `Showing ${page.total ? (page.page - 1) * 25 + 1 : 0}–${(page.page - 1) * 25 + page.items.length} of ${page.total} revisions`
          : undefined,
      }}
    >
      <div className="space-y-3 py-3">
        <p className="text-xs text-muted-foreground">Compare to review or restore a saved revision.</p>
        {error ? (
          <>
            <AlertBanner variant="error">{error}</AlertBanner>
            <Button size="sm" variant="outline" onClick={() => setAttempt((value) => value + 1)}>
              Retry
            </Button>
          </>
        ) : !page ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading history…
          </p>
        ) : (
          <>
            <BlogRevisionList
              compact
              currentTitle={currentTitle}
              postId={postId}
              version={version}
              publishedRevisionId={publishedRevisionId}
              revisions={page.items}
              canRestore={false}
              historyPage={page.page}
            />
          </>
        )}
      </div>
    </AdminListing>
  );
}
