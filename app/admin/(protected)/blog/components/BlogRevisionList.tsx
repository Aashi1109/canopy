"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, GitCompareArrows, RotateCcw } from "lucide-react";
import { AlertBanner, AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, Button, EmptyState, StatusBadge } from "@smarttools/ui";
import { mutateBlogAction } from "../actions";

interface Props {
  postId: string;
  version: number;
  publishedRevisionId: string | null;
  canRestore: boolean;
  comparedRevisionId?: string;
  compact?: boolean;
  currentTitle?: string;
  revisions: { id: string; revisionNumber: number; title: string; reason: string; createdAt: Date }[];
}

export function BlogRevisionList({ postId, version, publishedRevisionId, revisions, canRestore, comparedRevisionId, compact = false, currentTitle }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Props["revisions"][number] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function restore() {
    if (!selected || pending) return;
    setPending(true); setError("");
    try {
      const result = await mutateBlogAction("restoreRevision", { postId, version, revisionId: selected.id });
      if (!result.ok) { setError(result.message); return; }
      router.push(`/admin/blog/${postId}`);
      router.refresh();
    } catch { setError("Couldn’t restore this revision. Your current draft is unchanged; try again."); }
    finally { setPending(false); }
  }
  return <>
    {!revisions.length && <EmptyState title="No revisions yet" description="Save your draft to create a revision." />}
    <ul className="divide-y divide-border">{revisions.map((revision) => <li key={revision.id} className={`${compact ? "flex flex-col gap-2 py-3" : "flex flex-wrap items-center justify-between gap-4 px-5 py-5"} ${comparedRevisionId === revision.id ? "bg-accent/50" : ""}`}>
      <div><div className="flex flex-wrap items-center gap-2"><h3 className={compact ? "text-sm font-semibold" : "font-semibold"}>Revision {revision.revisionNumber}</h3>{publishedRevisionId === revision.id && <StatusBadge variant="success">Live</StatusBadge>}{compact && <span className="ml-auto text-xs text-muted-foreground">{revision.reason.replaceAll("_", " ")}</span>}</div>
        {(!compact || revision.title !== currentTitle) && <p className={compact ? "mt-1 break-words text-xs text-muted-foreground" : "mt-1 break-words text-[15px]"}>{revision.title || "Untitled post"}</p>}
        <p className={compact ? "mt-1 text-xs tabular-nums text-muted-foreground" : "mt-1 text-sm text-muted-foreground"}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(revision.createdAt))} UTC{!compact && ` · ${revision.reason.replaceAll("_", " ")}`}</p>
      </div>
      <div className="flex flex-wrap gap-1"><Button asChild variant="ghost" size={compact ? "xs" : "sm"}><Link href={`/admin/blog/${postId}/history?${new URLSearchParams({ revision: revision.id })}`} aria-current={comparedRevisionId === revision.id ? "page" : undefined}><GitCompareArrows aria-hidden="true" />Compare</Link></Button><Button asChild variant={compact ? "ghost" : "outline"} size={compact ? "xs" : "sm"}><Link href={`/admin/blog/${postId}/preview?${new URLSearchParams({ revision: revision.id })}`}><Eye aria-hidden="true" />Preview</Link></Button>{canRestore && <Button size={compact ? "xs" : "sm"} variant="ghost" onClick={() => { setSelected(revision); setError(""); }}><RotateCcw aria-hidden="true" />Restore</Button>}</div>
    </li>)}</ul>
    <AlertDialog open={!!selected} onOpenChange={(open) => { if (!open && !pending) setSelected(null); }}><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>Restore revision {selected?.revisionNumber}?</AlertDialogTitle><AlertDialogDescription>Creates a new draft from “{selected?.title || "Untitled post"}”. This restores the article body, cover, byline, topics, SEO, and related tools. Use Compare first to review these changes. Your current draft is backed up first. The current live article and any scheduled version stay unchanged.</AlertDialogDescription></AlertDialogHeader>
      {error && <AlertBanner variant="error">{error}</AlertBanner>}
      <AlertDialogFooter><AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel><Button loading={pending} onClick={() => { void restore(); }}>Restore as draft</Button></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </>;
}
