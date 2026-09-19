"use client";

import type { ComponentProps } from "react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { ChevronRight } from "lucide-react";
import { cn } from "../lib/utils.ts";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;

const contentClasses =
  "z-50 min-w-32 max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto rounded-xl border border-input bg-popover p-1.5 text-popover-foreground shadow-md";
const itemClasses =
  "relative flex min-h-9 cursor-default items-center gap-2 rounded-lg px-3 text-sm outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 max-md:min-h-11 [@media(pointer:coarse)]:min-h-11";

export function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(contentClasses, className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}
export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item data-slot="dropdown-menu-item" className={cn(itemClasses, className)} {...props} />
  );
}
export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("my-1 h-px bg-border", className)}
      {...props}
    />
  );
}
export function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.SubTrigger>) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      className={cn(itemClasses, "data-[state=open]:bg-accent data-[state=open]:text-accent-foreground", className)}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto" aria-hidden="true" />
    </DropdownMenuPrimitive.SubTrigger>
  );
}
export function DropdownMenuSubContent({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent
        data-slot="dropdown-menu-sub-content"
        className={cn(contentClasses, className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}
