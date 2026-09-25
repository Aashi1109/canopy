"use client";

import { DiffWorkspace } from "@/components/DiffWorkspace";
import type { WorkspaceProps } from "@/components/ToolWorkspace";

export default function TextDiffWorkspace(props: WorkspaceProps) {
  return <DiffWorkspace {...props} editLabel="Edit text" />;
}
