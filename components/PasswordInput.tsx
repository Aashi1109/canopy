"use client";

import { Button, Input, type InputProps } from "@smarttools/ui";
import { cn } from "@smarttools/ui/lib/utils";
import { Eye, EyeOff } from "lucide";
import { MorphIcon } from "morphicons/react";
import { useState } from "react";

export function PasswordInput({ className, disabled, ...props }: Omit<InputProps, "type">) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="relative w-full">
      <Input {...props} className={cn("pr-12", className)} disabled={disabled} type={revealed ? "text" : "password"} />
      <Button
        aria-label={revealed ? "Hide password" : "Show password"}
        className="absolute right-0 top-0 h-full"
        disabled={disabled}
        onClick={() => setRevealed((current) => !current)}
        size="icon"
        type="button"
        variant="input-icon"
      >
        <MorphIcon icon={revealed ? EyeOff : Eye} reducedMotion="user" size={18} />
      </Button>
    </div>
  );
}
