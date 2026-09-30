import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { ToolIcon } from "@/components/ToolIcon";
import { CatalogCard } from "@/components/ui/index.tsx";
import type { CatalogTool } from "@/lib/tool-framework/catalog";

export function CatalogToolCard({
  tool,
  status,
}: {
  tool: Pick<CatalogTool, "name" | "description" | "href" | "icon">;
  status?: ReactNode;
}) {
  return (
    <CatalogCard
      action={
        <>
          Open tool
          <ArrowUpRight aria-hidden="true" className="size-4" />
        </>
      }
      className="min-h-48 rounded-[1.25rem] shadow-none duration-300 hover:border-primary/40 hover:shadow-lg [&>span:last-child]:inline-flex [&>span:last-child]:items-center [&>span:last-child]:gap-1.5"
      description={tool.description}
      href={tool.href}
      icon={<ToolIcon icon={tool.icon} />}
      title={tool.name}
      status={status}
    />
  );
}
