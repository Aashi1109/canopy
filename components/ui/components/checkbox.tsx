"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { CheckIcon, MinusIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";

import { cn } from "../lib/utils.ts";

const checkboxSizeVariants = cva("", {
  variants: {
    size: {
      xs: "size-3 [&_svg]:size-2 before:inset-[-6px]",
      sm: "size-3.5 [&_svg]:size-2.5 before:inset-[-5px]",
      default: "size-4 [&_svg]:size-3 before:inset-[-4px]",
      md: "size-5 [&_svg]:size-4 before:inset-[-2px]",
      lg: "size-[22px] [&_svg]:size-[18px] before:-inset-px",
    },
  },
  defaultVariants: { size: "default" },
});

function Checkbox({
  className,
  size = "default",
  // Composed triggers must not override the checkbox's own Radix state.
  "data-state": _triggerState,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root> &
  VariantProps<typeof checkboxSizeVariants> & { "data-state"?: string }) {
  return (
    <CheckboxPrimitive.Root
      {...props}
      data-slot="checkbox"
      data-size={size}
      className={cn(
        "peer group/checkbox relative before:absolute before:content-[''] shrink-0 rounded-[4px] border border-input bg-card transition-[background-color,border-color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:opacity-70 aria-invalid:border-validation aria-invalid:ring-validation/20 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
        checkboxSizeVariants({ size }),
        className,
      )}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className="group-data-[state=indeterminate]/checkbox:hidden" />
        <MinusIcon className="hidden group-data-[state=indeterminate]/checkbox:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
