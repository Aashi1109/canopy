import type { ReactNode } from "react";
import { Pagination, type PaginationProps } from "@/components/ui/components/Pagination";
import { cn } from "@/components/ui/lib/utils";

/** A bounded list body with a footer that never overlays its rows. */
export function AdminListing({
  children,
  pagination,
  className,
  "aria-label": label,
}: {
  children: ReactNode;
  pagination: PaginationProps;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <section
      aria-label={label}
      className={cn(
        "grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden rounded-xl border border-border bg-card shadow-sm",
        className,
      )}
    >
      <div className="min-h-0 overflow-auto overscroll-contain [&>[data-slot=table-container]]:overflow-visible [&_th]:normal-case [&_th]:py-3 [&_td]:py-3.5">
        {children}
      </div>
      <Pagination {...pagination} sticky={false} />
    </section>
  );
}
