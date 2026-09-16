import type { ComponentProps } from "react";

import { cn } from "#lib/utils";

// Shared owners use these recipes when their required element is a control or editor layer.
export const typographyStyles = {
  h1: "font-heading text-heading-1 font-semibold tracking-tight",
  h2: "font-heading text-heading-2 font-semibold tracking-tight",
  h3: "font-heading text-heading-3 font-semibold tracking-tight",
  h4: "font-heading text-heading-4 font-semibold",
  h5: "font-heading text-heading-5 font-semibold",
  h6: "font-heading text-heading-6 font-semibold",
  display: "font-heading text-display font-bold tracking-tight text-balance",
  p: "font-sans text-body",
  text: "font-sans text-body",
  lead: "font-sans text-body-large text-muted-foreground",
  large: "font-sans text-body-large font-semibold",
  small: "font-caption text-caption font-medium",
  muted: "font-sans text-caption text-muted-foreground",
  caption: "font-caption text-caption tabular-nums",
  overline: "font-caption text-overline font-semibold uppercase tracking-wider",
  metric: "font-heading text-heading-1 font-semibold tabular-nums",
  strong: "font-semibold",
  blockquote: "border-l-2 border-border pl-4 font-sans text-body italic",
  list: "list-disc space-y-2 pl-6 font-sans text-body",
  orderedList: "list-decimal space-y-2 pl-6 font-sans text-body",
  inlineCode: "rounded bg-muted px-1 py-0.5 font-mono text-code font-medium",
  textLink:
    "font-sans text-inherit text-primary underline underline-offset-4 rounded-sm outline-none transition-colors hover:text-primary-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  codeBlock: "font-mono text-code whitespace-pre",
} as const;

export function H1({ className, ...props }: ComponentProps<"h1">) {
  return <h1 data-slot="typography-h1" className={cn(typographyStyles.h1, className)} {...props} />;
}

export function H2({ className, ...props }: ComponentProps<"h2">) {
  return <h2 data-slot="typography-h2" className={cn(typographyStyles.h2, className)} {...props} />;
}

export function H3({ className, ...props }: ComponentProps<"h3">) {
  return <h3 data-slot="typography-h3" className={cn(typographyStyles.h3, className)} {...props} />;
}

export function H4({ className, ...props }: ComponentProps<"h4">) {
  return <h4 data-slot="typography-h4" className={cn(typographyStyles.h4, className)} {...props} />;
}

export function H5({ className, ...props }: ComponentProps<"h5">) {
  return <h5 data-slot="typography-h5" className={cn(typographyStyles.h5, className)} {...props} />;
}

export function H6({ className, ...props }: ComponentProps<"h6">) {
  return <h6 data-slot="typography-h6" className={cn(typographyStyles.h6, className)} {...props} />;
}

export function Display({ className, ...props }: ComponentProps<"h1">) {
  return <h1 data-slot="typography-display" className={cn(typographyStyles.display, className)} {...props} />;
}

export function P({ className, ...props }: ComponentProps<"p">) {
  return <p data-slot="typography-p" className={cn(typographyStyles.p, className)} {...props} />;
}

export function Text({ className, ...props }: ComponentProps<"span">) {
  return <span data-slot="typography-text" className={cn(typographyStyles.text, className)} {...props} />;
}

export function Lead({ className, ...props }: ComponentProps<"p">) {
  return <p data-slot="typography-lead" className={cn(typographyStyles.lead, className)} {...props} />;
}

export function Large({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="typography-large" className={cn(typographyStyles.large, className)} {...props} />;
}

export function Small({ className, ...props }: ComponentProps<"small">) {
  return <small data-slot="typography-small" className={cn(typographyStyles.small, className)} {...props} />;
}

export function Muted({ className, ...props }: ComponentProps<"p">) {
  return <p data-slot="typography-muted" className={cn(typographyStyles.muted, className)} {...props} />;
}

export function Caption({ className, ...props }: ComponentProps<"span">) {
  return <span data-slot="typography-caption" className={cn(typographyStyles.caption, className)} {...props} />;
}

export function Overline({ className, ...props }: ComponentProps<"span">) {
  return <span data-slot="typography-overline" className={cn(typographyStyles.overline, className)} {...props} />;
}

export function Metric({ className, ...props }: ComponentProps<"span">) {
  return <span data-slot="typography-metric" className={cn(typographyStyles.metric, className)} {...props} />;
}

export function Strong({ className, ...props }: ComponentProps<"strong">) {
  return <strong data-slot="typography-strong" className={cn(typographyStyles.strong, className)} {...props} />;
}

export function Blockquote({ className, ...props }: ComponentProps<"blockquote">) {
  return (
    <blockquote data-slot="typography-blockquote" className={cn(typographyStyles.blockquote, className)} {...props} />
  );
}

export function List({ className, ...props }: ComponentProps<"ul">) {
  return <ul data-slot="typography-list" className={cn(typographyStyles.list, className)} {...props} />;
}

export function OrderedList({ className, ...props }: ComponentProps<"ol">) {
  return <ol data-slot="typography-orderedList" className={cn(typographyStyles.orderedList, className)} {...props} />;
}

export function InlineCode({ className, ...props }: ComponentProps<"code">) {
  return <code data-slot="typography-inlineCode" className={cn(typographyStyles.inlineCode, className)} {...props} />;
}

export function TextLink({ className, ...props }: ComponentProps<"a">) {
  return <a data-slot="typography-textLink" className={cn(typographyStyles.textLink, className)} {...props} />;
}

export function CodeBlock({ children, className, ...props }: ComponentProps<"pre"> & { "data-language"?: string }) {
  return (
    <pre data-slot="typography-code-block" className={cn(typographyStyles.codeBlock, className)} {...props}>
      <code className="font-[inherit]" data-language={props["data-language"]}>
        {children}
      </code>
    </pre>
  );
}
