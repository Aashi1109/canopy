import type { CSSProperties } from "react";

import { cn } from "../lib/utils.ts";

/** Transparency is shown independently of the surrounding page theme. */
export function ColorSwatch({
  color,
  label = color,
  className,
  style,
}: {
  color: string;
  label?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-label={label}
      className={cn("relative block overflow-hidden rounded-md border border-border", className)}
      role="img"
      style={{
        backgroundColor: "var(--card)",
        backgroundImage: "conic-gradient(var(--muted) 25%, transparent 0 50%, var(--muted) 0 75%, transparent 0)",
        backgroundSize: "16px 16px",
        ...style,
      }}
    >
      <span aria-hidden="true" className="absolute inset-0" style={{ backgroundColor: color }} />
    </span>
  );
}
