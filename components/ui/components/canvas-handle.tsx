import type { ComponentProps } from "react";

import { cn } from "../lib/utils.ts";

const EDGE_CLASSES = {
  top: ["-ml-3.5 -mt-7", "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2"],
  right: ["ml-0 -mt-3.5", "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2"],
  bottom: ["-ml-3.5 mt-0", "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2"],
  left: ["-ml-7 -mt-3.5", "right-0 top-1/2 translate-x-1/2 -translate-y-1/2"],
} as const;

export function CanvasHandle({
  className,
  edge,
  selected = false,
  variant = "default",
  ...props
}: ComponentProps<"button"> & {
  edge?: keyof typeof EDGE_CLASSES;
  selected?: boolean;
  variant?: "default" | "subtle";
}) {
  const subtle = variant === "subtle";
  return (
    <button
      type="button"
      data-slot="canvas-handle"
      data-variant={variant}
      className={cn(
        "absolute flex touch-none items-center justify-center cursor-grab active:cursor-grabbing disabled:cursor-not-allowed",
        subtle
          ? "group/canvas-handle size-7 outline-none"
          : "size-11 -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-2 focus-visible:outline-ring",
        subtle && (edge ? EDGE_CLASSES[edge][0] : "-ml-3.5 -mt-3.5"),
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          subtle
            ? "relative z-10 size-2 rounded-[2px] border border-input bg-background transition-colors duration-150 group-hover/canvas-handle:border-primary group-hover/canvas-handle:bg-primary group-focus-visible/canvas-handle:border-primary group-focus-visible/canvas-handle:bg-primary group-active/canvas-handle:border-primary group-active/canvas-handle:bg-primary"
            : "size-4 rounded-full border-2 border-white bg-primary",
          subtle && edge && ["absolute", EDGE_CLASSES[edge][1]],
          selected && (subtle ? "border-primary bg-primary" : "ring-4 ring-primary/25"),
        )}
      />
    </button>
  );
}
