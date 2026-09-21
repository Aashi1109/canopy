"use client";

import { useState } from "react";
import { Autocomplete } from "@base-ui/react/autocomplete";

import { Input, type InputProps } from "./input.tsx";
import { cn } from "../lib/utils.ts";

type AutocompleteInputProps = Omit<InputProps, "value" | "defaultValue" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  suggestions: readonly string[];
};

function AutocompleteInput({
  value,
  onValueChange,
  suggestions,
  disabled,
  code = false,
  ...inputProps
}: AutocompleteInputProps) {
  const [open, setOpen] = useState(false);

  return (
    <Autocomplete.Root
      items={suggestions}
      filter={null}
      value={value}
      onValueChange={(nextValue, details) => {
        if (details.reason === "input-change") setOpen(true);
        onValueChange(nextValue);
      }}
      disabled={disabled}
      open={open && suggestions.length > 0}
      onOpenChange={setOpen}
      openOnInputClick
      autoHighlight
    >
      <Autocomplete.Input onBlur={() => setOpen(false)} render={<Input {...inputProps} code={code} />} />
      <Autocomplete.Portal>
        <Autocomplete.Positioner sideOffset={4} className="z-50 outline-none">
          <Autocomplete.Popup className="w-[var(--anchor-width)] max-w-[var(--available-width)] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md">
            <Autocomplete.List className="max-h-[min(16rem,var(--available-height))] scroll-py-1 overflow-y-auto overscroll-contain p-1 outline-none">
              {(suggestion: string) => (
                <Autocomplete.Item
                  key={suggestion}
                  value={suggestion}
                  className={cn(
                    "min-h-9 cursor-default rounded-md px-3 py-2 text-[13px] break-words outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-text",
                    code && "font-mono",
                  )}
                >
                  {suggestion}
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}

export { AutocompleteInput };
export type { AutocompleteInputProps };
