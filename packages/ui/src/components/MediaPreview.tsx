"use client";

import * as React from "react";
import { Dialog } from "radix-ui";

import { Button } from "#components/button";
import { cn } from "#lib/utils";

export interface MediaPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible dialog title, usually the file name. */
  title: string;
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
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-border bg-card/95 px-4 py-4 sm:min-h-20 sm:flex-nowrap sm:px-6">
            <div className={cn("min-w-0 flex-1", actions != null && "basis-full sm:basis-auto")}>
              <Dialog.Title
                title={title}
                className="line-clamp-2 break-words text-base font-semibold [overflow-wrap:anywhere]"
              >
                {title}
              </Dialog.Title>
              {hasDescription && (
                <Dialog.Description id={descriptionId} asChild>
                  <div className="mt-1 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
                    {description}
                  </div>
                </Dialog.Description>
              )}
            </div>
            <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">
              {actions}
              <Dialog.Close asChild>
                <Button variant="secondary">
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
              "flex min-h-0 min-w-0 flex-1 overflow-auto bg-transparent p-4 text-white sm:p-6",
              viewportClassName,
            )}
            data-slot="media-preview-viewport"
          >
            {children}
          </div>
          {hasFooter && (
            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-border bg-card/95 px-4 py-4 text-sm sm:min-h-19 sm:px-6">
              {status != null && <div className="min-w-0 break-words text-muted-foreground">{status}</div>}
              {controls != null && <div className="flex min-w-0 flex-wrap items-center gap-2">{controls}</div>}
              {hint != null && <div className="min-w-0 break-words text-muted-foreground">{hint}</div>}
            </footer>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
