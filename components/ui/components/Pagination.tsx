import { Fragment, type ReactNode } from "react";
import Link from "next/link.js";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button.tsx";
import { cn } from "../lib/utils.ts";

export interface PaginationProps {
  page: number;
  pageCount?: number;
  hasNextPage?: boolean;
  getPageHref?: (page: number) => string | undefined;
  onPageChange?: (page: number) => void;
  previousHref?: string;
  nextHref?: string;
  firstHref?: string;
  disabled?: boolean;
  summary?: ReactNode;
  "aria-label"?: string;
  className?: string;
  sticky?: boolean;
}

/** Default list pagination, matching design node quHuq. */
export function Pagination({
  page,
  pageCount,
  hasNextPage = false,
  getPageHref,
  onPageChange,
  previousHref,
  nextHref,
  firstHref,
  disabled = false,
  summary,
  "aria-label": ariaLabel = "Pagination",
  className,
  sticky = true,
}: PaginationProps) {
  const count = pageCount === undefined ? undefined : Math.max(1, Math.floor(pageCount));
  const current = Math.max(1, Math.min(Math.floor(page) || 1, count ?? Infinity));
  const start = Math.max(2, Math.min(current - 1, (count ?? current) - 3));
  const hasNext = Boolean(nextHref || hasNextPage);
  const pages =
    count === undefined
      ? onPageChange
        ? [
            ...new Set([
              1,
              ...Array.from(
                { length: Math.min(5, current + Number(hasNext)) },
                (_, index) => Math.max(1, current + Number(hasNext) - 4) + index,
              ),
            ]),
          ]
        : [...new Set([...(firstHref ? [1] : []), current, ...(hasNext ? [current + 1] : [])])]
      : count <= 7
        ? Array.from({ length: count }, (_, index) => index + 1)
        : [1, start, start + 1, start + 2, count];

  function control(target: number, content: ReactNode, label: string, arrow = false) {
    const active = !arrow && target === current;
    const href =
      getPageHref?.(target) ??
      (target === current - 1 ? previousHref : undefined) ??
      (target === current + 1 ? nextHref : undefined) ??
      (target === 1 ? firstHref : undefined);
    const unavailable =
      disabled ||
      target < 1 ||
      (count !== undefined && target > count) ||
      (count === undefined && target > current && !hasNext) ||
      (!active && !href && !onPageChange);
    const props = {
      "aria-label": label,
      "aria-current": active ? ("page" as const) : undefined,
      size: "icon-sm" as const,
      variant: active ? ("default" as const) : ("outline" as const),
      className: cn(arrow ? "text-muted-foreground" : "min-w-9 w-auto px-2 text-sm", !active && "font-medium"),
    };
    return href && !unavailable ? (
      <Button key={label} {...props} asChild>
        <Link href={href}>{content}</Link>
      </Button>
    ) : (
      <Button
        key={label}
        {...props}
        disabled={unavailable}
        onClick={onPageChange && !active ? () => onPageChange(target) : undefined}
      >
        {content}
      </Button>
    );
  }

  return (
    <div
      data-slot="pagination"
      className={cn(
        "flex flex-wrap items-center justify-end gap-3 border-t border-border bg-card px-4 py-3",
        sticky && "sticky bottom-0 z-20",
        className,
      )}
    >
      {summary && (
        <div className="mr-auto text-sm text-muted-foreground" aria-live="polite">
          {summary}
        </div>
      )}
      <nav aria-label={ariaLabel} className="flex flex-wrap items-center gap-1.5">
        {control(current - 1, <ChevronLeft aria-hidden="true" className="size-4" />, "Previous page", true)}
        {pages.map((number, index) => (
          <Fragment key={number}>
            {index > 0 && number - pages[index - 1] > 1 && (
              <span aria-hidden="true" className="px-1 text-sm text-muted-foreground">
                …
              </span>
            )}
            {control(number, number, `Page ${number}`)}
          </Fragment>
        ))}
        {control(current + 1, <ChevronRight aria-hidden="true" className="size-4" />, "Next page", true)}
      </nav>
    </div>
  );
}
