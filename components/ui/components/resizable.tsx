"use client";

import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "../lib/utils.ts";
import { usePanelRef } from "react-resizable-panels";

function ResizablePanelGroup({ className, ...props }: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn("flex h-full w-full aria-[orientation=vertical]:flex-col", className)}
      {...props}
    />
  );
}

function ResizablePanel({ ...props }: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />;
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: ResizablePrimitive.SeparatorProps & {
  withHandle?: boolean;
}) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        "group/resize relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-6 after:-translate-x-1/2 data-[separator=hover]:bg-primary/20 data-[separator=active]:bg-primary/30 focus-visible:bg-primary/20 focus-visible:outline-hidden aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:inset-y-auto aria-[orientation=horizontal]:after:top-1/2 aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-6 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2 [&[aria-orientation=horizontal]>div]:rotate-90",
        !withHandle && "focus-visible:bg-muted-foreground focus-visible:ring-1 focus-visible:ring-muted-foreground",
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div
          aria-hidden="true"
          className="pointer-events-none z-10 h-6 w-[3px] shrink-0 rounded-full bg-muted-foreground/70 group-data-[separator=hover]/resize:bg-primary group-data-[separator=active]/resize:bg-primary group-focus-visible/resize:bg-primary group-focus-visible/resize:outline-2 group-focus-visible/resize:outline-offset-2 group-focus-visible/resize:outline-ring group-aria-disabled/resize:opacity-50"
        />
      )}
    </ResizablePrimitive.Separator>
  );
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup, usePanelRef };
