import * as React from "react";

import { typographyStyles } from "#components/typography";

import { cn } from "#lib/utils";

function Textarea({ className, code = false, ...props }: React.ComponentProps<"textarea"> & { code?: boolean }) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-[88px] w-full resize-y rounded-lg border border-input bg-card px-[13px] py-3 font-sans group-data-[variant=auth]/field:px-3.5 text-sm leading-[1.45] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-on-ink-muted disabled:opacity-70 aria-invalid:border-validation aria-invalid:ring-2 aria-invalid:ring-validation/15",
        code && typographyStyles.codeBlock,
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
