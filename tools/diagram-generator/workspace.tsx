"use client";

import { useMemo } from "react";
import { ArtifactDownloadMenu, CopyButton, ResultActions, type DownloadableArtifact } from "@/components/ResultView";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";

export default function DiagramWorkspace(props: WorkspaceProps) {
  const svg = props.result?.render === "html" ? props.result.html : null;
  const artifacts = useMemo<readonly DownloadableArtifact[] | undefined>(
    () =>
      svg === null
        ? undefined
        : [
            { storage: "inline", name: "diagram.svg", mimeType: "image/svg+xml;charset=utf-8", content: svg },
            {
              storage: "deferred",
              name: "diagram.png",
              mimeType: "image/png",
              getContent: async () => {
                const { diagramPng } = await import("@/lib/markdown/diagramExport");
                return diagramPng(svg);
              },
            },
          ],
    [svg],
  );

  return (
    <ToolWorkspace
      {...props}
      renderResultActions={(result) =>
        result.render === "html" ? (
          <>
            <CopyButton content={result.html} iconOnly label="Copy SVG" />
            <ArtifactDownloadMenu artifacts={artifacts} />
          </>
        ) : (
          <ResultActions result={result} canCopy canDownload />
        )
      }
    />
  );
}
