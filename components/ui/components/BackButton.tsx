import type { MouseEventHandler } from "react";
import Link from "next/link.js";
import { Button } from "./button.tsx";
import { cn } from "../lib/utils.ts";

type BackButtonProps = { label: string; className?: string; showLabel?: boolean } & (
  | { href: string; onClick?: never; disabled?: never }
  | { href?: never; onClick: MouseEventHandler<HTMLButtonElement>; disabled?: boolean }
);

export function BackButton({ href, label, className, onClick, disabled, showLabel = false }: BackButtonProps) {
  const arrow = (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.75}
      className={cn(
        "shrink-0 transition-transform duration-200 ease-out motion-safe:group-hover/back:-translate-x-0.5 motion-safe:group-focus-visible/back:-translate-x-0.5 motion-reduce:transition-none",
        showLabel ? "size-3.5 w-5" : "size-5 w-7",
      )}
    >
      <path d="m12 19-7-7 7-7M5 12h24" />
    </svg>
  );
  const content = (
    <>
      {arrow}
      {showLabel && <span>{label}</span>}
    </>
  );
  return (
    <Button
      asChild={href !== undefined}
      type={href === undefined ? "button" : undefined}
      aria-label={label}
      variant="input-icon"
      size={showLabel ? "sm" : "icon-lg"}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "group/back justify-start text-foreground",
        showLabel ? "h-9 w-auto gap-1 px-1 text-[13px] font-normal" : "w-8",
        className,
      )}
    >
      {href !== undefined ? <Link href={href}>{content}</Link> : content}
    </Button>
  );
}
