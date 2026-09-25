import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils.ts";

const inputVariants = cva(
  "w-full min-w-0 rounded-lg border border-input bg-card font-sans text-foreground outline-none transition-[border-color,box-shadow] selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-on-ink-muted disabled:opacity-70 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 aria-invalid:border-validation aria-invalid:ring-2 aria-invalid:ring-validation/15",
  {
    variants: {
      size: {
        xs: "h-7 px-2 text-[11px]",
        sm: "h-8 px-2.5 text-[11px]",
        default: "h-9 px-3 text-[13px]",
        md: "h-11 px-4 text-sm",
        lg: "h-12 px-[18px] text-[15px]",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

type InputProps = Omit<React.ComponentProps<"input">, "size"> &
  VariantProps<typeof inputVariants> & {
    code?: boolean;
    leadingIcon?: React.ReactNode;
    suffix?: React.ReactNode;
  };

function Input({ className, code = false, size = "default", type, leadingIcon, suffix, ...props }: InputProps) {
  const control = (
    <input
      type={type}
      data-slot="input"
      data-size={size}
      data-leading-icon={leadingIcon ? "true" : undefined}
      data-suffix={suffix ? "true" : undefined}
      className={cn(
        inputVariants({ size }),
        code && "font-mono",
        leadingIcon && (typeof leadingIcon === "string" && leadingIcon.length === 1 ? "pl-7" : "pl-8"),
        suffix &&
          "pr-10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        type === "range" ? "border-0 bg-transparent px-0" : "group-data-[variant=auth]/field:px-3.5",
        className,
      )}
      {...props}
    />
  );
  if (!leadingIcon && !suffix) return control;
  return (
    <span className="relative block min-w-0 w-full">
      {leadingIcon && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground [&>svg]:size-4"
        >
          {leadingIcon}
        </span>
      )}
      {control}
      {suffix && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground"
        >
          {suffix}
        </span>
      )}
    </span>
  );
}

export { Input, inputVariants };
export type { InputProps };
