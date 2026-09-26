"use client";

import { useMemo } from "react";
import { ArtifactDownloadMenu, ResultView, type DownloadableArtifact } from "@/components/ResultView";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";

export default function QrCodeWorkspace(props: WorkspaceProps) {
  const artifacts = useMemo<readonly DownloadableArtifact[] | undefined>(() => {
    const result = props.result;
    if (result?.render !== "image") return undefined;
    return [
      {
        storage: "deferred",
        name: result.downloadName ?? "qr-code.png",
        mimeType: result.mime,
        getContent: async () => (await fetch(result.src)).blob(),
      },
      ...(result.artifacts ?? []),
    ];
  }, [props.result]);

  return (
    <ToolWorkspace
      {...props}
      renderResult={(result) => <ResultView result={result} hideArtifacts />}
      renderResultActions={() => <ArtifactDownloadMenu artifacts={artifacts} />}
    />
  );
}
