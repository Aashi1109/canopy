import type { ComponentProps } from "react";
import { ToolPageHeader } from "@/components/ui/index.tsx";
import { cn } from "@/components/ui/lib/utils.ts";

export function AdminPageHeader({
  className,
  ...props
}: Omit<ComponentProps<typeof ToolPageHeader>, "eyebrow" | "inlineEyebrow">) {
  return <ToolPageHeader {...props} className={cn("mb-5 border-b-0 pb-0", className)} />;
}
