import { typographyStyles, Caption } from "@canopy/ui";
import type { ToolRender } from "@/lib/tool-framework/result";

export interface DiffViewProps {
  result: Extract<ToolRender, { render: "diff" }>;
}

export function DiffView({ result }: DiffViewProps) {
  return (
    <div className={`${typographyStyles.codeBlock} min-h-0 flex-1 overflow-auto whitespace-normal`}>
      {result.leftLabel || result.rightLabel ? (
        <div className="grid grid-cols-2 border-b border-border bg-muted/50 px-4 py-2">
          <Caption>{result.leftLabel ?? "Before"}</Caption>
          <Caption>{result.rightLabel ?? "After"}</Caption>
        </div>
      ) : null}
      {result.lines.map((line, index) => (
        <div
          className={
            line.kind === "added"
              ? "bg-success/10 text-foreground"
              : line.kind === "removed"
                ? "bg-destructive/10 text-foreground"
                : undefined
          }
          key={`${index}-${line.text}`}
        >
          <span className="sr-only">
            {line.kind === "added" ? "Added: " : line.kind === "removed" ? "Removed: " : "Unchanged: "}
          </span>
          <span aria-hidden="true" className="inline-block w-8 select-none text-center text-muted-foreground">
            {line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}
          </span>
          <span className="whitespace-pre-wrap break-all">{line.text}</span>
        </div>
      ))}
    </div>
  );
}
