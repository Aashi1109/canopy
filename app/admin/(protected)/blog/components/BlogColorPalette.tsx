"use client";

import { CircleOff } from "lucide-react";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@smarttools/ui";

export function BlogColorPalette({
  colors,
  label,
  value,
  onChange,
  disabled = false,
  separateClear = false,
}: {
  colors: readonly (readonly [string, string])[];
  label: string;
  value?: string | null;
  onChange: (color: string | null) => void;
  disabled?: boolean;
  separateClear?: boolean;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 [@media(pointer:coarse)]:[&_button]:min-h-11 [@media(pointer:coarse)]:[&_button]:min-w-11"
      role="group"
      aria-label={label}
    >
      {colors.map(([name, color]) => (
        <Tooltip key={color}>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-xs"
              className="size-6 rounded-sm border-foreground/20 p-0 shadow-none aria-pressed:ring-2 aria-pressed:ring-primary"
              style={{ backgroundColor: color }}
              aria-label={`${name} ${label.toLowerCase()}`}
              aria-pressed={value === undefined ? undefined : value === color}
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onChange(color)}
            />
          </TooltipTrigger>
          <TooltipContent>{name}</TooltipContent>
        </Tooltip>
      ))}
      <div className={separateClear ? "border-l border-border pl-2" : undefined}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={separateClear ? "ghost" : "outline"}
              size="icon-xs"
              className={separateClear ? "size-6 p-0" : "size-6 rounded-sm border-foreground/20 p-0 shadow-none"}
              aria-label={`Clear ${label.toLowerCase()}`}
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onChange(null)}
            >
              <CircleOff
                aria-hidden="true"
                className={separateClear ? "size-6 [@media(pointer:coarse)]:size-11" : undefined}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Clear {label.toLowerCase()}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
