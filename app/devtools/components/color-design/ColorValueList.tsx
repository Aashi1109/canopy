"use client";

import { CopyButton } from "@/components/ResultView";
import type { ToolFact } from "@/lib/tool-framework/result";

/** Compact, individually copyable values shared by color previews and sampling. */
export function ColorValueList({ entries, disabled = false }: { entries: readonly ToolFact[]; disabled?: boolean }) {
  return (
    <dl className="grid min-h-0 grid-cols-[minmax(2.5rem,max-content)_minmax(0,1fr)_auto] content-start divide-y divide-border overflow-y-auto">
      {entries.map((entry) => (
        <div className="col-span-3 grid min-w-0 grid-cols-subgrid items-center gap-3 px-3 py-1.5" key={entry.label}>
          <dt className="max-w-28 break-words text-xs text-muted-foreground">{entry.label}</dt>
          <dd className="min-w-0 break-all font-mono text-sm">{entry.value}</dd>
          <CopyButton disabled={disabled} content={String(entry.value)} iconOnly label={`Copy ${entry.label}`} />
        </div>
      ))}
    </dl>
  );
}
