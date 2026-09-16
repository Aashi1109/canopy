"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { AlertBanner, Button } from "@smarttools/ui";
import { readBlogAction } from "../actions";
import { BlogRevisionList } from "./BlogRevisionList";

export const historyPageSchema = z.object({
  items: z.array(z.object({
    id: z.string(), revisionNumber: z.number(), title: z.string(),
    reason: z.string(), createdAt: z.coerce.date(),
  })),
  nextCursor: z.string().nullable(),
});

type Props = { postId: string; version: number; publishedRevisionId: string | null; currentTitle: string };

export function BlogHistoryPanel({ postId, version, publishedRevisionId, currentTitle }: Props) {
  const [cursor, setCursor] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState<z.infer<typeof historyPageSchema> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setPage(null);
    setError("");
    async function load() {
      try {
        const result = await readBlogAction({ operation: "history", postId, cursor });
        if (cancelled) return;
        if (!result.ok) { setError(result.message); return; }
        const parsed = historyPageSchema.safeParse(result.data);
        if (!parsed.success) { setError("Couldn’t load revision history. Try again."); return; }
        setPage(parsed.data);
      } catch {
        if (!cancelled) setError("Couldn’t load revision history. Try again.");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [postId, version, cursor, attempt]);

  return <div className="space-y-2">
    <p className="text-xs text-muted-foreground">Compare to review or restore a saved revision.</p>
    {error ? <><AlertBanner variant="error">{error}</AlertBanner><Button size="sm" variant="outline" onClick={() => setAttempt(value => value + 1)}>Retry</Button></> : !page ? <p role="status" className="text-sm text-muted-foreground">Loading history…</p> : <>
      <BlogRevisionList compact currentTitle={currentTitle} postId={postId} version={version} publishedRevisionId={publishedRevisionId} revisions={page.items} canRestore={false} />
      <div className="flex flex-wrap gap-2">
        {cursor && <Button size="xs" variant="outline" onClick={() => setCursor(undefined)}>Latest revisions</Button>}
        {page.nextCursor && <Button size="xs" variant="outline" onClick={() => setCursor(page.nextCursor ?? undefined)}>Older revisions</Button>}
      </div>
    </>}
  </div>;
}
