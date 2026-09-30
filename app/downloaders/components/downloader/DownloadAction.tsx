"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/components/button";

interface DownloadActionProps {
  label?: string;
  onDownload: () => void;
  disabled?: boolean;
  busy?: boolean;
}

export function DownloadAction({
  label = "Download video",
  onDownload,
  disabled = false,
  busy = false,
}: DownloadActionProps) {
  return (
    <Button
      size="md"
      className="w-full min-w-0 md:w-fit"
      disabled={disabled || busy}
      loading={busy}
      onClick={onDownload}
    >
      <Download aria-hidden="true" />
      {label}
    </Button>
  );
}
