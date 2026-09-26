import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../lib/utils.ts";

/** Shared single-row toolbar for adjacent workspace panels. Put help in the panel body. */
export function WorkspacePanelHeader({
  actions,
  children,
  className,
  meta,
  ...props
}: HTMLAttributes<HTMLElement> & {
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header
      {...props}
      className={cn(
        "@container flex h-[51px] min-w-0 shrink-0 items-center gap-3 border-b border-border px-4",
        className,
      )}
      data-slot="workspace-header"
    >
      <div className="min-w-0 flex-1">{children}</div>
      {meta != null ? <div className="min-w-0 truncate text-right text-xs text-muted-foreground">{meta}</div> : null}
      {actions ? (
        <div className="ml-auto flex min-w-0 max-w-full items-center gap-1 overflow-x-auto [scrollbar-width:none]">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
