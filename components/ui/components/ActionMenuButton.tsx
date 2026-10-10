"use client";

import type { ComponentProps, ReactNode, Ref } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { cn } from "../lib/utils.ts";
import { Button, buttonVariants } from "./button.tsx";
import { ButtonGroup } from "./button-group.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "./dropdown-menu.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip.tsx";

type ActionMenuButtonSize = Exclude<NonNullable<ComponentProps<typeof Button>["size"]>, `icon${string}`>;

type ActionMenuButtonProps = {
  children: ReactNode;
  label: string;
  icon?: ReactNode;
  size?: ActionMenuButtonSize;
  variant?: "default" | "outline" | "secondary";
  disabled?: boolean;
  loading?: boolean;
  triggerRef?: Ref<HTMLButtonElement>;
  menuLabel?: string;
  primaryAction?: {
    label: ReactNode;
    ariaLabel?: string;
    onClick: () => void;
    disabled?: boolean;
  };
  contentProps?: Omit<ComponentProps<typeof DropdownMenuContent>, "children"> &
    Partial<Record<`data-${string}`, string | number | boolean>>;
};

const MENU_ICON_SIZES = {
  xs: "icon-xs",
  sm: "icon-sm",
  default: "icon",
  md: "icon-md",
  lg: "icon-lg",
} as const satisfies Record<ActionMenuButtonSize, NonNullable<ComponentProps<typeof Button>["size"]>>;

/** A menu trigger, or a primary action joined to its additional actions. */
export function ActionMenuButton({
  children,
  label,
  icon,
  size = "default",
  variant = "default",
  disabled = false,
  loading = false,
  triggerRef,
  menuLabel = label,
  primaryAction,
  contentProps,
}: ActionMenuButtonProps) {
  const separatorColor = variant === "default" ? "border-primary-foreground/30" : "border-border";
  const trigger = (
    <DropdownMenuTrigger asChild>
      <Button
        size={primaryAction ? MENU_ICON_SIZES[size] : size}
        variant={variant}
        disabled={disabled}
        loading={!primaryAction && loading}
        ref={triggerRef}
        aria-label={menuLabel}
        className={`group/action-menu ${primaryAction ? `border-s! ${separatorColor}` : loading ? "" : "pe-0"}`}
      >
        {!primaryAction && icon}
        {!primaryAction && label}
        {(!loading || primaryAction) && (
          <span
            aria-hidden="true"
            className={
              primaryAction
                ? undefined
                : cn(
                    buttonVariants({ size: MENU_ICON_SIZES[size], variant: null }),
                    "ms-1 h-full rounded-none border-s",
                    separatorColor,
                  )
            }
          >
            <ChevronDown className="transition-transform duration-150 group-data-[state=open]/action-menu:rotate-180 motion-reduce:transition-none" />
          </span>
        )}
      </Button>
    </DropdownMenuTrigger>
  );

  return (
    <DropdownMenu>
      {primaryAction ? (
        <ButtonGroup>
          <Button
            size={size}
            variant={variant}
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled}
            loading={loading}
            aria-label={primaryAction.ariaLabel}
          >
            {icon}
            {primaryAction.label}
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>{trigger}</TooltipTrigger>
              <TooltipContent>{menuLabel}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </ButtonGroup>
      ) : (
        trigger
      )}
      <DropdownMenuContent
        size={size === "xs" ? "sm" : size === "lg" ? "md" : size}
        align="end"
        sideOffset={8}
        collisionPadding={16}
        {...contentProps}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The standard creation menu keeps the same trigger and focus contract. */
export function CreateMenuButton({
  label = "Create",
  onCloseAutoFocus,
  ...props
}: Omit<ActionMenuButtonProps, "label" | "icon" | "primaryAction" | "contentProps"> & {
  label?: string;
  onCloseAutoFocus?: ComponentProps<typeof DropdownMenuContent>["onCloseAutoFocus"];
}) {
  return (
    <ActionMenuButton {...props} label={label} icon={<Plus aria-hidden="true" />} contentProps={{ onCloseAutoFocus }} />
  );
}
