"use client";

import { CopyButton } from "@/components/ResultView";
import type { ToolFact } from "@/lib/tool-framework/result";

/** Compact, individually copyable values shared by color previews and sampling. */
export function ColorValueList({ entries, disabled = false }: { entries: readonly ToolFact[]; disabled?: boolean }) {
  return (
    <dl className="min-h-0 divide-y divide-border overflow-y-auto">
      {entries.map((entry) => (
        <div className="flex min-w-0 items-center gap-3 px-3 py-1.5" key={entry.label}>
          <dt className="w-10 shrink-0 text-xs text-muted-foreground">{entry.label}</dt>
          <dd className="min-w-0 flex-1 break-all font-mono text-sm">{entry.value}</dd>
          <CopyButton disabled={disabled} content={String(entry.value)} iconOnly label={`Copy ${entry.label}`} />
        </div>
      ))}
    </dl>
  );
}
