"use client";

import ColorConversionWorkspace from "@/app/devtools/components/color-design/ColorConversionWorkspace";
import type { WorkspaceProps } from "@/components/ToolWorkspace";

export default function RgbToHexWorkspace(props: WorkspaceProps) {
  return <ColorConversionWorkspace {...props} inputFormat="rgb" />;
}
