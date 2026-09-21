"use client";

import type { ReactNode } from "react";
import { FileText, X } from "lucide-react";

import { cn } from "../lib/utils.ts";
import { Badge } from "./badge.tsx";
import { Button } from "./button.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip.tsx";

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

/** Compact source-file identity and removal, shared by tool upload surfaces. */
export function FileChip({
  file,
  onRemove,
  disabled = false,
  details,
  className,
}: {
  file: Pick<File, "name" | "size" | "type" | "lastModified">;
  onRemove: () => void;
  disabled?: boolean;
  details?: ReactNode;
  className?: string;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            aria-label={`${file.name}, file details`}
            className={cn("max-w-full min-w-0 shrink gap-1 py-0 pr-0.5 font-normal", className)}
            data-slot="file-chip"
            tabIndex={0}
            variant="secondary"
          >
            <FileText aria-hidden="true" className="shrink-0" />
            <span className="min-w-0 truncate">{file.name}</span>
            <Button
              aria-label={`Remove ${file.name}`}
              className="rounded-full"
              disabled={disabled}
              onClick={onRemove}
              size="icon-xs"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs break-words font-normal" side="bottom">
          <span className="block font-semibold">{file.name}</span>
          <span className="block">
            {formatFileSize(file.size)} · {file.size.toLocaleString()} bytes
          </span>
          <span className="block">{file.type || "Unknown file type"}</span>
          {file.lastModified > 0 ? (
            <span className="block">Modified {new Date(file.lastModified).toLocaleString()}</span>
          ) : null}
          {details ? <span className="block">{details}</span> : null}
          {disabled ? <span className="block">Wait for processing to finish before removing this file.</span> : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
