"use client";

import * as React from "react";
import { CheckIcon, MinusIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";

import { cn } from "../lib/utils.ts";

function Checkbox({
  className,
  // Composed triggers must not override the checkbox's own Radix state.
  "data-state": _triggerState,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root> & { "data-state"?: string }) {
  return (
    <CheckboxPrimitive.Root
      {...props}
      data-slot="checkbox"
      className={cn(
        "peer group/checkbox size-5 shrink-0 rounded-[4px] border border-input bg-card transition-[background-color,border-color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:opacity-70 aria-invalid:border-validation aria-invalid:ring-validation/20 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
        className,
      )}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-[13px] group-data-[state=indeterminate]/checkbox:hidden" />
        <MinusIcon className="hidden size-[13px] group-data-[state=indeterminate]/checkbox:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
