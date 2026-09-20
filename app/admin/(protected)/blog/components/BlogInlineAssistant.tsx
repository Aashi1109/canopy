"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Check, RotateCw, Sparkles, X } from "lucide-react";
import { Button, Tooltip, TooltipContent, TooltipTrigger, toast } from "@/components/ui/index.tsx";
import type { BlogNode } from "@/lib/blog/document";
import type { AssistantRun, AssistantRunRequest } from "@/lib/assistant/types";
import { activeRun, assistantRequest, streamAssistantRun } from "@/lib/assistant/client";
import type { BlogProposalData } from "@/lib/blog/assistantTypes";
import { captureAssistantSelection } from "../lib/assistantSelection";
import styles from "./BlogSelectionToolbar.module.css";

type Props = {
  editor: Editor;
  postId: string;
  instruction: string;
  target: ReturnType<typeof captureAssistantSelection>;
  dismissRequest: number;
  onClose: (restore: boolean) => void;
};

function plain(nodes: BlogNode[]): string {
  return nodes.map((node) => node.text ?? plain(node.content ?? []) + (node.type === "paragraph" ? "\n" : "")).join("");
}

const highlightKey = new PluginKey<{ token: symbol | null; decorations: DecorationSet }>("blogInlineHighlight");
export function highlightInlineSelection(editor: Editor, from: number, to: number, className: string) {
  if (!highlightKey.getState(editor.state)) {
    editor.registerPlugin(
      new Plugin<{ token: symbol | null; decorations: DecorationSet }>({
        key: highlightKey,
        state: {
          init: () => ({ token: null, decorations: DecorationSet.empty }),
          apply: (transaction, current) => {
            const next = transaction.getMeta(highlightKey) as
              { token: symbol; from: number; to: number; className: string } | null | undefined;
            if (next === null) return { token: null, decorations: DecorationSet.empty };
            if (next)
              return {
                token: next.token,
                decorations: DecorationSet.create(transaction.doc, [
                  Decoration.inline(next.from, next.to, { class: next.className }),
                ]),
              };
            return { ...current, decorations: current.decorations.map(transaction.mapping, transaction.doc) };
          },
        },
        props: { decorations: (state) => highlightKey.getState(state)?.decorations },
      }),
    );
  }
  const token = Symbol();
  editor.view.dispatch(editor.state.tr.setMeta(highlightKey, { token, from, to, className }));
  return () => {
    if (!editor.isDestroyed && highlightKey.getState(editor.state)?.token === token)
      editor.view.dispatch(editor.state.tr.setMeta(highlightKey, null));
  };
}

export function BlogInlineAssistant({ editor, postId, instruction, target, dismissRequest, onClose }: Props) {
  const surface = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState<AssistantRun | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(!target.valid());
  const alive = useRef(false);
  const pending = useRef<AssistantRunRequest | null>(null);
  const currentRun = useRef<AssistantRun | null>(null);
  const locked = useRef(false);
  const closing = useRef(false);
  const applied = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const [streamedText, setStreamedText] = useState("");
  const lastDismiss = useRef(dismissRequest);
  const proposal = run?.response?.proposals.find((item) => item.data.type === "edit" && item.status === "pending");

  const replacement = proposal?.data.replacement as BlogProposalData["replacement"];

  async function record(result: AssistantRun, status: "applied" | "discarded") {
    const edit = result.response?.proposals.find((item) => item.data.type === "edit" && item.status === "pending");
    if (edit)
      await assistantRequest(
        `/api/assistant/blog/runs/${result.id}/proposals/${encodeURIComponent(edit.id)}`,
        { status },
        "PATCH",
      );
  }
  function report(cause: unknown) {
    const message = cause instanceof Error ? cause.message : "Could not complete the rewrite. Try again.";
    if (alive.current) {
      setError(message);
      setBusy(false);
    }
    toast.error(message);
  }
  async function generate() {
    if (locked.current || closing.current) return;
    const range = target.range;
    if (!range) {
      setStale(true);
      setBusy(false);
      return;
    }
    locked.current = true;
    setBusy(true);
    setError("");
    setStreamedText("");
    const abort = new AbortController();
    controller.current = abort;
    try {
      if (!pending.current) {
        pending.current = {
          schemaVersion: 1,
          clientRequestId: crypto.randomUUID(),
          operation: "rewrite",
          resourceId: postId,
          context: { selectedText: range.text },
          message: instruction,
          ...(currentRun.current?.threadId ? { threadId: currentRun.current.threadId } : {}),
          ...(currentRun.current?.inputMessageId ? { inputMessageId: currentRun.current.inputMessageId } : {}),
        };
      }
      const next = await streamAssistantRun("blog", pending.current, abort.signal, (event) => {
        if (!alive.current || closing.current || abort.signal.aborted) return;
        if (event.type === "run") {
          currentRun.current = event.run;
          pending.current = null;
        } else if (event.type === "text-delta") setStreamedText((value) => value + event.text);
        else if (event.type === "text") setStreamedText(event.text);
      });
      if (!alive.current || closing.current || abort.signal.aborted) return;
      currentRun.current = next;
      pending.current = null;
      if (next.status !== "completed") throw new Error(next.errorMessage || "The rewrite stopped. Try again.");
      if (
        !next.response?.proposals.some(
          (item) => item.data.type === "edit" && (item.data as BlogProposalData).replacement?.length,
        )
      )
        throw new Error("No replacement was returned. Try again.");
      if (run && run.id !== next.id)
        void record(run, "discarded").catch(() =>
          toast.error("The previous suggestion could not be marked as discarded."),
        );
      setRun(next);
      setBusy(false);
    } catch (cause) {
      if (alive.current && !abort.signal.aborted) report(cause);
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        locked.current = false;
        if (alive.current && !closing.current) setBusy(false);
      }
    }
  }
  async function cancel(restore = true) {
    if (closing.current) return;
    closing.current = true;
    controller.current?.abort();
    onClose(restore);
    try {
      if (run) await record(run, "discarded");
    } catch {
      toast.error("The suggestion was closed. Its final saved outcome could not be confirmed.");
    }
  }

  function accept() {
    const range = target.range;
    if (
      !range ||
      !replacement ||
      busy ||
      pending.current ||
      (currentRun.current && activeRun(currentRun.current.status)) ||
      applied.current ||
      !run
    ) {
      setStale(!range);
      return;
    }
    const previousSize = editor.state.doc.content.size;
    if (!target.apply({ type: "doc", content: replacement }, "replace")) {
      setStale(true);
      return;
    }
    applied.current = true;
    const acceptedDocument = editor.state.doc;
    const end = range.to + acceptedDocument.content.size - previousSize;
    const clear = highlightInlineSelection(editor, range.from, end, styles.appliedSelection);
    setTimeout(clear, 900);
    void record(run, "applied").catch(() =>
      toast.error("The edit was applied, but its request history could not be updated."),
    );
    onClose(false);
    editor.view.focus();
    toast.success("Change applied", {
      action: {
        label: "Undo",
        onClick: () => {
          if (!editor.isDestroyed && editor.state.doc.eq(acceptedDocument)) editor.commands.undo();
          else toast.info("The draft changed again. Use the editor’s undo to review your recent edits.");
        },
      },
    });
  }
  useEffect(() => {
    alive.current = true;
    const range = target.range;
    const clear = range ? highlightInlineSelection(editor, range.from, range.to, styles.aiSelection) : () => {};
    const check = () => {
      if (alive.current) setStale(!target.valid() || !editor.isEditable);
    };
    editor.on("transaction", check);
    const frame = requestAnimationFrame(() => {
      if (!alive.current || editor.isDestroyed) return;
      editor.view.dispatch(editor.state.tr.setMeta("blogSelection", "show"));
      editor.view.dispatch(editor.state.tr.setMeta("blogSelection", "updatePosition"));
      surface.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
      // Effect replay cancels the discarded frame before it can start a request.
      void generate();
    });
    return () => {
      alive.current = false;
      cancelAnimationFrame(frame);
      controller.current?.abort();
      clear();
      editor.off("transaction", check);
    };
    // One captured selection owns this request; editing controls retain focus without cancelling.
  }, [target]);
  useEffect(() => {
    if (dismissRequest !== lastDismiss.current) {
      lastDismiss.current = dismissRequest;
      void cancel(false);
    }
  }, [dismissRequest]);

  useEffect(() => {
    if (busy || closing.current) return;
    if (
      surface.current?.contains(globalThis.document.activeElement) ||
      globalThis.document.activeElement === globalThis.document.body
    )
      surface.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }, [busy]);

  return (
    <div ref={surface} className={styles.inlineResult} aria-label="Inline AI suggestion" aria-busy={busy}>
      {busy && (
        <div className={styles.working}>
          <div className="flex items-center gap-2.5">
            <Sparkles className="size-5.5 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1" role="status">
              <p className={styles.workingLabel}>AI AT WORK</p>
              <p className={styles.suggestionText}>
                {instruction === "Reduce text" ? "Shortening selected text…" : "Improving selected text…"}
              </p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label="Cancel" onClick={() => void cancel()}>
                  <X aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Cancel</TooltipContent>
            </Tooltip>
          </div>
          <div className={styles.progress} aria-hidden="true">
            <span />
          </div>
          <p className="text-caption text-muted-foreground">Working on your selection.</p>
        </div>
      )}
      {busy && streamedText && (
        <p className={styles.suggestionText} aria-label="Generating suggestion">
          {streamedText}
        </p>
      )}
      {!busy && replacement && (
        <>
          <p className={styles.suggestionLabel}>SUGGESTION · NOT APPLIED</p>
          <p className={styles.suggestionText} tabIndex={0} aria-label="Suggested text">
            {plain(replacement).trim()}
          </p>
        </>
      )}
      {stale && (
        <p className="text-caption text-destructive" role="status">
          The selected text changed. Discard this suggestion and select the passage again.
        </p>
      )}
      {error && (
        <p className="text-caption text-muted-foreground" role="status">
          Your original text is unchanged. Retry the request or cancel.
        </p>
      )}
      {!busy && (
        <div className="flex flex-wrap gap-2">
          {proposal && (
            <Button
              size="sm"
              disabled={stale || !!pending.current || !!(currentRun.current && activeRun(currentRun.current.status))}
              onClick={accept}
            >
              <Check aria-hidden="true" />
              Accept
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={stale} onClick={() => void generate()}>
            <RotateCw aria-hidden="true" />
            {error ? "Retry" : "Try again"}
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size={proposal ? "sm" : "icon-sm"}
                variant="outline"
                aria-label={proposal ? "Discard" : "Cancel"}
                onClick={() => void cancel()}
              >
                <X aria-hidden="true" />
                {proposal ? "Discard" : null}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{proposal ? "Discard" : "Cancel"}</TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
