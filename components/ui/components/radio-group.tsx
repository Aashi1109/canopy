"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { cn } from "../lib/utils.ts";

const radioGroupItemVariants = cva(
  "group/radio relative aspect-square shrink-0 rounded-full border-input bg-card text-primary transition-[border-color,box-shadow] outline-none before:absolute before:content-[''] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:opacity-70 aria-invalid:border-validation aria-invalid:ring-validation/20 data-[state=checked]:border-primary",
  {
    variants: {
      size: {
        xs: "size-3.5 border before:inset-[-15px]",
        sm: "size-4 border before:inset-[-14px]",
        default: "size-5 border-2 before:inset-[-12px]",
        md: "size-[22px] border-2 before:inset-[-11px]",
        lg: "size-6 border-2 before:inset-[-10px]",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

type RadioGroupItemProps = React.ComponentProps<typeof RadioGroupPrimitive.Item> &
  VariantProps<typeof radioGroupItemVariants>;

function RadioGroup({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root data-slot="radio-group" className={cn("grid gap-3", className)} {...props} />;
}

function RadioGroupItem({ className, size = "default", ...props }: RadioGroupItemProps) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      data-size={size}
      className={cn(radioGroupItemVariants({ size }), className)}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="relative flex items-center justify-center"
      >
        <span className="size-[9px] rounded-full bg-primary group-data-[size=xs]/radio:size-1.5 group-data-[size=sm]/radio:size-[7px] group-data-[size=md]/radio:size-2.5 group-data-[size=lg]/radio:size-[11px]" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem, radioGroupItemVariants };
export type { RadioGroupItemProps };
