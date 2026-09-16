"use client";

import type { ReactNode } from "react";
import { Download, Maximize2, X } from "lucide-react";
import { Button } from "#components/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "#components/tooltip";
import { cn } from "#lib/utils";

export interface MediaOutputCardProps {
  name: string;
  metadata: string;
  children: ReactNode;
  onPreview: () => void;
  onDownload?: () => void;
  onRemove?: () => void;
  disabled?: boolean;
  downloading?: boolean;
  error?: string;
  className?: string;
}

/** Contained media with persistent, compact actions and stacked file metadata. */
export function MediaOutputCard({
  name,
  metadata,
  children,
  onPreview,
  onDownload,
  onRemove,
  disabled,
  downloading,
  error,
  className,
}: MediaOutputCardProps) {
  const actionLabel = onRemove
    ? `Remove ${name}`
    : error
      ? `Retry download of ${name}`
      : `Download ${name}`;
  return (
    <TooltipProvider>
      <article
        className={cn(
          "flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-2",
          className,
        )}
        data-slot="media-output-card"
      >
        <div className="relative">
          <Button
            variant="card-action"
            onClick={onPreview}
            aria-label={`Preview ${name}`}
            className="aspect-square h-auto w-full overflow-hidden rounded-lg bg-muted p-0"
          >
            {children}
          </Button>
          <div className="absolute right-2 top-2 flex gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon-xs"
                  className="rounded-md border-0"
                  onClick={onPreview}
                  aria-label={`Preview ${name}`}
                >
                  <Maximize2 aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Preview {name}</TooltipContent>
            </Tooltip>
            {(onRemove || onDownload) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={disabled || downloading ? 0 : undefined}
                    aria-label={
                      disabled || downloading
                        ? `${actionLabel} — ${downloading ? "preparing download" : "unavailable while processing"}`
                        : undefined
                    }
                    className="rounded-md focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <Button
                      variant="secondary"
                      size="icon-xs"
                      className="rounded-md border-0"
                      onClick={onRemove ?? onDownload}
                      disabled={disabled}
                      loading={downloading}
                      aria-label={actionLabel}
                    >
                      {onRemove ? <X aria-hidden="true" /> : <Download aria-hidden="true" />}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {downloading
                    ? "Preparing download…"
                    : disabled
                      ? "Wait for processing to finish"
                      : actionLabel}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5 px-1 pb-1">
          <p className="break-all text-[15px] font-semibold leading-5">{name}</p>
          <p className="text-xs text-muted-foreground">{metadata}</p>
        </div>
        {error && (
          <p role="alert" className="px-1 pb-1 text-xs text-destructive">
            {error} Use Download to retry.
          </p>
        )}
      </article>
    </TooltipProvider>
  );
}
