"use client";

import { useEffect, useId, useState } from "react";
import { BackButton } from "@/components/ui/components/BackButton";
import { Button } from "@/components/ui/components/button";
import { Card } from "@/components/ui/components/card";
import { formatFileSize } from "@/components/ui/components/file-chip";
import { Input } from "@/components/ui/components/input";
import { Label } from "@/components/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/components/radio-group";
import type { DownloadFormat, DownloadJob, DownloadInspection } from "@/lib/downloaders/contracts";
import { DownloadAction } from "./DownloadAction";

function sizeLabel(format: DownloadFormat) {
  return format.bytes === null
    ? "Size unavailable"
    : `${format.estimatedBytes ? "Estimated " : ""}${formatFileSize(format.bytes)}`;
}

function durationLabel(duration: number) {
  const rounded = Math.round(duration * 10) / 10;
  const minutes = Math.floor(rounded / 60);
  const seconds = Number((rounded - minutes * 60).toFixed(1));
  return minutes ? `${minutes} min ${seconds} sec` : `${seconds} sec`;
}

export function DownloaderFormats({
  job,
  inspection,
  source,
  platformName,
  pendingFormatId,
  busy,
  onBack,
  onSelect,
  onCheck,
}: {
  job: DownloadJob;
  inspection: DownloadInspection;
  source: string;
  platformName: string;
  pendingFormatId: string | null;
  busy: boolean;
  onBack: () => void;
  onSelect: (formatId: string) => void;
  onCheck: () => void;
}) {
  const id = useId();
  const [selected, setSelected] = useState(pendingFormatId ?? job.selectedFormat ?? "");
  useEffect(() => {
    if (pendingFormatId || job.selectedFormat) setSelected(pendingFormatId ?? job.selectedFormat ?? "");
    else if (!inspection.formats.some((format) => format.id === selected)) setSelected("");
  }, [pendingFormatId, job.selectedFormat, inspection.formats, selected]);
  const chosen = inspection.formats.find((format) => format.id === selected);
  const choices = new Map<string, DownloadFormat>();
  for (const format of inspection.formats) {
    const key = JSON.stringify([
      format.container,
      format.width,
      format.height,
      format.fps,
      sizeLabel(format),
      format.hasAudio,
    ]);
    // Keep one choice for identical visible details, retaining an existing selection for retries.
    if (!choices.has(key) || format.id === selected) choices.set(key, format);
  }
  const formats = [...choices.values()];

  return (
    <section aria-labelledby={`${id}-heading`} className="min-w-0 space-y-4">
      <header className="flex items-start gap-3">
        <BackButton
          label="Back to video link"
          onClick={onBack}
          disabled={busy || !!pendingFormatId}
          className="shrink-0 hover:bg-transparent active:bg-transparent"
        />
        <div className="min-w-0 space-y-1">
          <h2 id={`${id}-heading`} className="font-heading text-xl font-semibold leading-snug">
            Choose your video format
          </h2>
          <p className="text-sm text-muted-foreground">
            {formats.length} available {formats.length === 1 ? "format" : "formats"}. Choose one, then prepare your
            download.
          </p>
        </div>
      </header>
      <Card className="grid min-w-0 gap-0 overflow-hidden p-0 shadow-none md:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)]">
        <aside className="min-w-0 space-y-4 border-b border-border bg-muted p-4 md:border-b-0 md:border-r">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{platformName} video</p>
            <h3 className="font-semibold [overflow-wrap:anywhere]">{inspection.title}</h3>
            {inspection.durationSeconds !== null && (
              <p className="text-sm text-muted-foreground">Duration: {durationLabel(inspection.durationSeconds)}</p>
            )}
          </div>
          {source && (
            <div className="space-y-2">
              <Label htmlFor={`${id}-source`}>Source link</Label>
              <Input id={`${id}-source`} value={source} readOnly size="md" />
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            These options come from the video. File sizes marked “Estimated” may change.
          </p>
          {job.expiresAt && (
            <p className="text-sm text-muted-foreground">
              Choose before{" "}
              <time dateTime={job.expiresAt}>
                {new Date(job.expiresAt).toLocaleString(undefined, { timeZoneName: "short" })}
              </time>
              . After that, check formats again.
            </p>
          )}
        </aside>
        <div className="flex min-h-0 min-w-0 flex-col">
          <RadioGroup
            aria-label="Available video formats"
            value={selected}
            onValueChange={setSelected}
            disabled={busy || !!pendingFormatId}
            className="m-3 grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] content-start gap-2 overflow-y-auto overscroll-contain p-0.5 max-h-[min(44dvh,24rem)]"
          >
            {formats.map((format, index) => (
              <Label
                key={format.id}
                htmlFor={`${id}-format-${index}`}
                className="flex min-w-0 cursor-pointer items-start gap-2 rounded-md border border-border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
              >
                <RadioGroupItem id={`${id}-format-${index}`} value={format.id} className="mt-0.5" />
                <span className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
                  <span className="block font-medium">
                    {Math.min(format.width, format.height)}p · {format.container.toUpperCase()}
                  </span>
                  <span className="block text-sm font-normal text-muted-foreground">{sizeLabel(format)}</span>
                  {format.fps && (
                    <span className="block text-sm font-normal text-muted-foreground">{format.fps} frames/sec</span>
                  )}
                  {!format.hasAudio && <span className="block text-sm font-normal">No audio</span>}
                </span>
              </Label>
            ))}
          </RadioGroup>
          <div className="mt-auto shrink-0 space-y-3 border-t border-border bg-card p-3">
            {pendingFormatId && (
              <p role="status" className="text-sm text-muted-foreground">
                {busy
                  ? "Starting your selected download…"
                  : "Your earlier selection was not confirmed. Retry the same format or check its status before choosing another."}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <DownloadAction onDownload={() => chosen && onSelect(chosen.id)} disabled={!chosen} busy={busy} />
              {pendingFormatId && !busy && (
                <Button variant="outline" size="md" onClick={onCheck} disabled={busy}>
                  Check status
                </Button>
              )}
              {!chosen && <p className="text-sm text-muted-foreground">Choose a format to continue.</p>}
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}
