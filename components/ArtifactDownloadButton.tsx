"use client";

import { useState } from "react";
import { Button } from "@canopy/ui";
import { Download } from "lucide-react";
import { readArtifact, type StoredToolArtifact } from "@/lib/tool-framework/artifacts";

export function useFileDownload(file: StoredToolArtifact) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string>();
  async function download() {
    if (downloading) return;
    setDownloading(true);
    setError(undefined);
    try {
      const blob = await readArtifact(file);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Download unavailable. Retry, or convert the source again.");
    } finally {
      setDownloading(false);
    }
  }
  return { download, downloading, error };
}

export function ArtifactDownloadButton({ file, label = "Download" }: { file: StoredToolArtifact; label?: string }) {
  const { download, downloading, error } = useFileDownload(file);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        aria-label={`${error ? "Retry download" : label} ${file.name}`}
        disabled={downloading}
        onClick={() => void download()}
      >
        <Download aria-hidden="true" />
        {downloading ? "Preparing…" : error ? "Retry download" : label}
      </Button>
      {error && (
        <p className="max-w-48 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
