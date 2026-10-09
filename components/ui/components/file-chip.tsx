"use client";

import { useLocale, useTranslations } from "next-intl";
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

/** Source-file identity and removal for tool toolbar headers only. */
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
  const t = useTranslations("Workbench");
  const locale = useLocale();
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            aria-label={t("fileDetails", { name: file.name })}
            className={cn("max-w-full min-w-0 shrink gap-1 py-0 pr-0.5 font-normal", className)}
            data-slot="file-chip"
            tabIndex={0}
            variant="secondary"
          >
            <FileText aria-hidden="true" className="shrink-0" />
            <span className="min-w-0 truncate">{file.name}</span>
            <Button
              aria-label={t("removeFile", { name: file.name })}
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
            {formatFileSize(file.size)} · {t("bytes", { count: file.size })}
          </span>
          <span className="block">{file.type || t("unknownType")}</span>
          {file.lastModified > 0 ? (
            <span className="block">{t("modified", { date: new Date(file.lastModified).toLocaleString(locale) })}</span>
          ) : null}
          {details ? <span className="block">{details}</span> : null}
          {disabled ? <span className="block">{t("removeAfterProcessing")}</span> : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
