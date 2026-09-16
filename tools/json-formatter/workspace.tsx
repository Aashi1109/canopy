"use client";

import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";

export default function JsonFormatterWorkspace(props: WorkspaceProps) {
  return (
    <ToolWorkspace
      {...props}
      initialJsonView={(props.settings.operation ?? "format") === "format" ? "read-only" : undefined}
    />
  );
}
