"use client";

import * as React from "react";
import { Dialog } from "radix-ui";

import { Button } from "./button.tsx";
import { cn } from "../lib/utils.ts";

export interface MediaPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible dialog title, usually the file name. */
  title: string;
  /** Optional visible title content; the plain title remains the accessible dialog name. */
  titleContent?: React.ReactNode;
  description?: React.ReactNode;
  /** Caller-owned actions placed immediately before Exit preview. */
  actions?: React.ReactNode;
  /** The caller owns rendering, sizing, playback, zoom, and preview state. */
  children: React.ReactNode;
  /** Optional media-specific controls; omitted for previews that need none. */
  controls?: React.ReactNode;
  status?: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
  /** Customize the task surface independently from the dialog chrome. */
  viewportClassName?: string;
}

/** Viewport-filling modal shell. Does not inspect or transform its children. */
export function MediaPreview({
  open,
  onOpenChange,
  title,
  titleContent,
  description,
  actions,
  children,
  controls,
  status,
  hint,
  className,
  viewportClassName,
}: MediaPreviewProps) {
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const descriptionId = React.useId();
  const hasDescription = description !== undefined && description !== null;
  const hasFooter = controls != null || status != null || hint != null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-surface-ink/70 backdrop-blur-xl" />
        <Dialog.Content
          aria-describedby={hasDescription ? descriptionId : undefined}
          className={cn(
            "fixed inset-0 z-50 flex h-dvh w-full flex-col overflow-hidden bg-transparent text-foreground outline-none",
            className,
          )}
          data-slot="media-preview"
          onEscapeKeyDown={(event) => {
            // Nested navigation handles Escape before the full-screen dialog.
            if (event.target instanceof Element && event.target.closest("[data-preview-escape-boundary]")) {
              event.preventDefault();
            }
          }}
          onOpenAutoFocus={() => {
            returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            const target = returnFocusRef.current;
            if (target?.isConnected) {
              event.preventDefault();
              target.focus();
            }
            returnFocusRef.current = null;
          }}
        >
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card/95 px-3 py-3 sm:min-h-16 sm:flex-nowrap sm:px-5">
            <div className={cn("min-w-0 flex-1", actions != null && "basis-full sm:basis-auto")}>
              <Dialog.Title
                className={cn(
                  "line-clamp-2 break-words text-sm font-semibold [overflow-wrap:anywhere]",
                  titleContent != null && "sr-only",
                )}
              >
                {title}
              </Dialog.Title>
              {titleContent}
              {hasDescription && (
                <Dialog.Description id={descriptionId} asChild>
                  <div className="mt-1 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {description}
                  </div>
                </Dialog.Description>
              )}
            </div>
            <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1.5">
              {actions}
              <Dialog.Close asChild>
                <Button variant="secondary" size="sm">
                  Exit preview
                  <kbd aria-hidden="true" className="hidden text-xs font-normal text-muted-foreground sm:inline">
                    Esc
                  </kbd>
                </Button>
              </Dialog.Close>
            </div>
          </header>
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 overflow-auto bg-transparent p-3 text-white sm:p-5",
              viewportClassName,
            )}
            data-slot="media-preview-viewport"
          >
            {children}
          </div>
          {hasFooter && (
            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-border bg-card/95 px-3 py-3 text-xs sm:min-h-16 sm:px-5">
              {controls != null && <div className="flex min-w-0 flex-wrap items-center gap-1.5">{controls}</div>}
              {status != null && <div className="min-w-0 break-words text-muted-foreground">{status}</div>}
              {hint != null && <div className="min-w-0 break-words text-muted-foreground">{hint}</div>}
            </footer>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
