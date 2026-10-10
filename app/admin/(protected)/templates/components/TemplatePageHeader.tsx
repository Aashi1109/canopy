import type { ReactNode } from "react";
import { BackButton, Caption, H1, StatusBadge } from "@/components/ui/index.tsx";
import { cn } from "@/components/ui/lib/utils.ts";
import type { InvoiceTemplate } from "@/lib/invoice-templates/index.ts";
import { appHref } from "@/lib/routing/subdomains.ts";

export function TemplatePageHeader({
  title,
  description,
  status,
  actions,
  backHref = appHref("/admin/templates"),
  backLabel = "Back to templates",
  className,
}: {
  title: string;
  description: ReactNode;
  status: InvoiceTemplate["status"];
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex shrink-0 flex-col gap-4 bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <BackButton href={backHref} label={backLabel} className="shrink-0" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <H1 className="truncate text-foreground">{title}</H1>
            <StatusBadge
              className="min-h-6 px-2.5"
              variant={status === "published" ? "success" : status === "archived" ? "archived" : "warning"}
            >
              {status}
            </StatusBadge>
          </div>
          <Caption className="block mt-1 truncate text-muted-foreground">{description}</Caption>
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
