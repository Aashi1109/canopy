import type { ReactNode } from "react";

import { typographyStyles, Caption } from "@/components/ui/index.tsx";
import type { ToolDiffLine, ToolRender } from "@/lib/tool-framework/result";

export interface DiffViewProps {
  result: Extract<ToolRender, { render: "diff" }>;
  layout?: "unified" | "split";
  header?: "visible" | "hidden";
  renderLine?: (text: string) => ReactNode;
}

type SplitLine = ToolDiffLine & { number: number };
type SplitRow = { left?: SplitLine; right?: SplitLine };

function alignLines(lines: readonly ToolDiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let leftNumber = 0;
  let rightNumber = 0;

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (line.kind === "context") {
      rows.push({
        left: { ...line, number: ++leftNumber },
        right: { ...line, number: ++rightNumber },
      });
      index++;
      continue;
    }

    const removed: SplitLine[] = [];
    const added: SplitLine[] = [];
    while (index < lines.length && lines[index].kind !== "context") {
      const changed = lines[index++];
      if (changed.kind === "removed") removed.push({ ...changed, number: ++leftNumber });
      else added.push({ ...changed, number: ++rightNumber });
    }
    for (let row = 0; row < Math.max(removed.length, added.length); row++) {
      rows.push({ left: removed[row], right: added[row] });
    }
  }

  return rows;
}

function SplitCell({
  line,
  label,
  renderLine,
}: {
  line?: SplitLine;
  label: string;
  renderLine?: DiffViewProps["renderLine"];
}) {
  return (
    <div
      aria-hidden={line ? undefined : true}
      className={`flex min-w-0 border-border py-0.5 first:border-r ${
        !line
          ? "bg-muted/50"
          : line.kind === "added"
            ? "bg-success/10"
            : line.kind === "removed"
              ? "bg-destructive/10"
              : ""
      }`}
    >
      {line ? (
        <>
          <span className="sr-only">
            {label}, line {line.number},{" "}
            {line.kind === "added" ? "added" : line.kind === "removed" ? "removed" : "unchanged"}:
          </span>
          <span
            aria-hidden="true"
            className="w-12 shrink-0 select-none pr-2 text-right tabular-nums text-muted-foreground"
          >
            {line.number}
          </span>
          <span
            aria-hidden="true"
            className={`w-6 shrink-0 select-none text-center ${line.kind === "added" ? "text-success" : line.kind === "removed" ? "text-destructive" : "text-muted-foreground"}`}
          >
            {line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}
          </span>
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-all pr-4">
            {line.text ? (renderLine?.(line.text) ?? line.text) : "\u00a0"}
          </span>
        </>
      ) : null}
    </div>
  );
}

export function DiffView({ result, layout = "unified", header = "visible", renderLine }: DiffViewProps) {
  if (layout === "split") {
    const leftLabel = result.leftLabel ?? "Before";
    const rightLabel = result.rightLabel ?? "After";

    return (
      <div
        aria-label="Side-by-side comparison"
        className={`${typographyStyles.codeBlock} min-h-0 min-w-0 flex-1 overflow-auto whitespace-normal outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`}
        role="region"
        tabIndex={0}
      >
        <div className="min-w-[40rem]">
          {header === "visible" ? (
            <div className="sticky top-0 z-10 grid grid-cols-2 border-b border-border bg-muted">
              <Caption className="border-r border-border px-4 py-2">{leftLabel}</Caption>
              <Caption className="px-4 py-2">{rightLabel}</Caption>
            </div>
          ) : null}
          {alignLines(result.lines).map((row, index) => (
            <div className="grid grid-cols-2" key={index}>
              <SplitCell label={leftLabel} line={row.left} renderLine={renderLine} />
              <SplitCell label={rightLabel} line={row.right} renderLine={renderLine} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`${typographyStyles.codeBlock} min-h-0 flex-1 overflow-auto whitespace-normal`}>
      {header === "visible" && (result.leftLabel || result.rightLabel) ? (
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
          <span
            aria-hidden="true"
            className={`inline-block w-8 select-none text-center ${line.kind === "added" ? "text-success" : line.kind === "removed" ? "text-destructive" : "text-muted-foreground"}`}
          >
            {line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}
          </span>
          <span className="whitespace-pre-wrap break-all">{renderLine?.(line.text) ?? line.text}</span>
        </div>
      ))}
    </div>
  );
}
