"use client";

import { FileProcessorWorkspace } from "@/components/FileProcessorWorkspace";
import type { WorkspaceProps } from "@/components/ToolWorkspace";

export default function Workspace(props: WorkspaceProps) {
  return <FileProcessorWorkspace {...props} orderFiles />;
}
