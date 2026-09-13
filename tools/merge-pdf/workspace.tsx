"use client";

/**
 * The generic file-processor surface, plus the reorderable file list: Pages are merged in this file order.
 * The order is `input.files` itself, which `run.worker.ts` reads directly.
 */

import {
  FileProcessorWorkspace,
} from "@/components/FileProcessorWorkspace";
import type { WorkspaceProps } from "@/components/ToolWorkspace";

export default function Workspace(props: WorkspaceProps) {
  return (
    <FileProcessorWorkspace
      {...props}
      orderFiles
    />
  );
}
