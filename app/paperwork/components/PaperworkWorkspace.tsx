"use client";

import { useRef, type ReactNode } from "react";
import { FileText } from "lucide-react";
import {
  WorkbenchPresentationProvider,
  WorkbenchFocusButton,
  WorkbenchViewControl,
  useWorkbenchFocus,
} from "@/components/ui/components/workbench-presentation";
import { cn } from "@/components/ui/lib/utils";

export function PaperworkWorkspace({ children, title }: { children: ReactNode; title: string }) {
  return (
    <WorkbenchPresentationProvider>
      <Frame title={title}>{children}</Frame>
    </WorkbenchPresentationProvider>
  );
}

function Frame({ children, title }: { children: ReactNode; title: string }) {
  const ref = useRef<HTMLElement>(null);
  const { focused, placeholderHeight } = useWorkbenchFocus(ref);
  return (
    <div style={focused ? { height: placeholderHeight } : undefined}>
      <section
        ref={ref}
        data-focus-mode={focused}
        aria-label={`${title} workspace`}
        className={cn(focused && "fixed inset-0 z-40 flex h-dvh flex-col bg-card print:static print:h-auto")}
      >
        <div
          className={cn(
            "grid grid-cols-2 items-center gap-2 border-b border-border bg-card px-5 py-2 print:hidden min-[64rem]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]",
            !focused && "mx-auto max-w-7xl",
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <FileText aria-hidden="true" className="size-5 shrink-0 text-primary" />
            <span className="truncate text-sm font-semibold">{title}</span>
          </div>
          <div className="order-3 col-span-2 justify-self-center min-[64rem]:order-none min-[64rem]:col-span-1">
            <WorkbenchViewControl />
          </div>
          <div className="justify-self-end">
            <WorkbenchFocusButton />
          </div>
        </div>
        <div className={cn(focused && "min-h-0 flex-1 overflow-auto overscroll-contain print:overflow-visible")}>
          {children}
        </div>
      </section>
    </div>
  );
}
