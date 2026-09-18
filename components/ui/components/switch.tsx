"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { cn } from "../lib/utils.ts";

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "xs" | "sm" | "default" | "lg";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-transparent p-[3px] transition-[background-color,box-shadow] outline-none before:absolute before:content-[''] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-border disabled:opacity-70 data-[size=default]:h-[26px] data-[size=default]:w-11 data-[size=default]:before:inset-y-[-9px] data-[size=default]:before:inset-x-0 data-[size=lg]:h-8 data-[size=lg]:w-[52px] data-[size=lg]:before:inset-y-[-6px] data-[size=lg]:before:inset-x-0 data-[size=sm]:h-6 data-[size=sm]:w-10 data-[size=sm]:before:inset-y-[-10px] data-[size=sm]:before:inset-x-[-2px] data-[size=xs]:h-[18px] data-[size=xs]:w-8 data-[size=xs]:p-0.5 data-[size=xs]:before:inset-y-[-13px] data-[size=xs]:before:inset-x-[-6px] data-[state=checked]:justify-end data-[state=checked]:bg-primary data-[state=unchecked]:justify-start data-[state=unchecked]:bg-input",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full bg-white shadow-[0_1px_2px_#00000026] ring-0 group-data-[size=default]/switch:size-5 group-data-[size=lg]/switch:size-6 group-data-[size=sm]/switch:size-[18px] group-data-[size=xs]/switch:size-3.5",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
