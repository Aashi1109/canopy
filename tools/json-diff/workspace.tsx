"use client";

import { DiffWorkspace } from "@/components/DiffWorkspace";
import { highlightJson } from "@/components/content/jsonHighlight";
import type { WorkspaceProps } from "@/components/ToolWorkspace";

export default function JsonDiffWorkspace(props: WorkspaceProps) {
  return (
    <DiffWorkspace
      {...props}
      editLabel="Edit JSON"
      renderLine={highlightJson}
      settingsNote="JSON A is the baseline. Red lines are removed; green lines are added in JSON B. Whitespace and object-key order are ignored."
    />
  );
}
