"use client";
import { useRef, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import {
  Button,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  toast,
} from "@/components/ui/index.tsx";
import { RichContent } from "@/components/content/RichContent";
import { ReportView } from "./ReportView";
import type { ChangesetModel } from "./types";
import styles from "./AssistantOutput.module.css";

/** The canonical result stays with the integration; this component only owns review interactions. */
export function ChangesetPreview({ model, onRetry }: { model: ChangesetModel; onRetry: () => void }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);
  const state = model.eligibility();
  async function act(action: "apply" | "undo") {
    if (lock.current) return;
    const latest = model.eligibility();
    if (action === "apply" && (latest.expired || latest.stale || latest.alreadyApplied)) {
      toast.error("This result can no longer be applied. Prepare a fresh request.");
      setRevision(revision + 1);
      return;
    }
    if (action === "undo" && !latest.canUndo) {
      toast.error("Newer changes prevent undo. Recover an earlier version from history.");
      return;
    }
    lock.current = true;
    setPending(true);
    try {
      await (action === "apply" ? model.onApply() : model.onUndo());
      setRevision((value) => value + 1);
      if (action === "apply") setOpen(false);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not apply the change. Try again.");
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <>
      <p role="status" className="text-caption text-muted-foreground">
        {state.alreadyApplied
          ? "This result is already applied."
          : state.stale
            ? "Your content changed. Inspect this version or prepare a fresh request before applying."
            : model.description}
      </p>
      <Button
        onClick={() => {
          const latest = model.eligibility();
          if (latest.expired) {
            toast.error("This result expired. Prepare a fresh request.");
            return;
          }
          setOpen(true);
        }}
        disabled={state.expired || (!model.html && !model.text)}
      >
        {model.previewLabel}
      </Button>
      {!model.html && !model.text && (
        <p className="text-caption text-destructive">The preview is unavailable. Reopen the saved result to retry.</p>
      )}
      {state.stale && !state.alreadyApplied && (
        <Button variant="outline" onClick={onRetry}>
          Prepare new request
        </Button>
      )}
      {state.hasUndo && (
        <Button variant="outline" disabled={!state.canUndo || pending} onClick={() => void act("undo")}>
          <RotateCcw />
          Undo replacement
        </Button>
      )}
      {state.hasUndo && !state.canUndo && (
        <p className="text-caption text-muted-foreground">
          Newer edits prevent undo here. Use revision history to recover an earlier version.
        </p>
      )}
      <AlertDialog
        open={open}
        onOpenChange={(value) => {
          if (!pending) setOpen(value);
        }}
      >
        <AlertDialogContent className={styles.draftPreview}>
          <AlertDialogHeader>
            <AlertDialogTitle>{model.title}</AlertDialogTitle>
            <AlertDialogDescription>{model.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className={styles.previewScroll}>
            <h2>{model.contentTitle}</h2>
            {model.introduction && <p>{model.introduction}</p>}
            {model.html ? <RichContent html={model.html} className={styles.article} /> : <p>{model.text}</p>}
            <ReportView report={{ sections: model.sections ?? [] }} />
          </div>
          <AlertDialogFooter className="shrink-0">
            <AlertDialogCancel disabled={pending}>{model.keepLabel}</AlertDialogCancel>
            <Button
              loading={pending}
              disabled={pending || state.expired || state.stale || state.alreadyApplied}
              onClick={() => void act("apply")}
            >
              <Check />
              {state.alreadyApplied
                ? "Already applied"
                : state.stale
                  ? (model.staleLabel ?? "Content changed · run again")
                  : model.applyLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
