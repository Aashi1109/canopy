"use client";

import ColorConversionWorkspace from "@/app/devtools/components/color-design/ColorConversionWorkspace";
import type { WorkspaceProps } from "@/components/ToolWorkspace";

export default function HexToHslWorkspace(props: WorkspaceProps) {
  return <ColorConversionWorkspace {...props} inputFormat="hex" outputFunction="hsl" />;
}
