"use client";
import { useTranslations } from "next-intl";

import { useEffect, useState } from "react";
import { Button, ToolActionButton, toast } from "@/components/ui/index.tsx";
import { Download } from "lucide-react";
import { readArtifact, type StoredToolArtifact } from "@/lib/tool-framework/artifacts";

export function useFileDownload(file: StoredToolArtifact) {
  const t = useTranslations("Workbench");
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
      setError(t("mediaArtifactDownloadFailed"));
    } finally {
      setDownloading(false);
    }
  }
  return { download, downloading, error };
}

export function ArtifactDownloadButton({
  file,
  label: labelProp,
  size,
  variant = "button",
  disabled = false,
}: {
  file: StoredToolArtifact;
  label?: string;
  size?: React.ComponentProps<typeof Button>["size"];
  variant?: "button" | "toolbar";
  disabled?: boolean;
}) {
  const t = useTranslations("Workbench");
  const label = labelProp ?? t("download");
  const { download, downloading, error } = useFileDownload(file);
  useEffect(() => {
    if (variant === "toolbar" && error) toast.error(error);
  }, [variant, error]);
  if (variant === "toolbar") {
    return (
      <ToolActionButton
        action="download"
        aria-label={t("mediaFileAction", { action: error ? t("mediaRetryDownloadAction") : label, name: file.name })}
        disabled={disabled || downloading}
        loading={downloading}
        onClick={() => void download()}
      >
        {downloading ? t("preparing") : error ? t("mediaRetryDownloadAction") : label}
      </ToolActionButton>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size={size}
        aria-label={t("mediaFileAction", { action: error ? t("mediaRetryDownloadAction") : label, name: file.name })}
        disabled={disabled || downloading}
        onClick={() => void download()}
      >
        <Download aria-hidden="true" />
        {downloading ? t("preparing") : error ? t("mediaRetryDownloadAction") : label}
      </Button>
      {error && (
        <p className="max-w-48 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
