"use client";

import { useId } from "react";
import { BackButton } from "@/components/ui/components/BackButton";
import { Card } from "@/components/ui/components/card";
import { formatFileSize } from "@/components/ui/components/file-chip";
import type { DownloadArtifact, DownloadJob } from "@/lib/downloaders/contracts";
import { DownloadAction } from "./DownloadAction";

export interface DownloaderResultsProps {
  job: DownloadJob;
  onBack: () => void;
  onDownload: (artifact: DownloadArtifact) => void;
  requestedArtifactId?: string;
  checking?: boolean;
}

function artifactFacts(artifact: DownloadArtifact) {
  const formats: Record<string, string> = {
    "video/mp4": "MP4 video",
    "video/webm": "WebM video",
    "video/quicktime": "MOV video",
    "audio/mpeg": "MP3 audio",
    "audio/mp4": "MP4 audio",
    "audio/webm": "WebM audio",
    "image/jpeg": "JPEG image",
    "image/png": "PNG image",
    "image/webp": "WebP image",
  };
  const mime = artifact.mime.split(";", 1)[0].trim().toLowerCase();
  const hasDimensions =
    artifact.width !== null &&
    artifact.height !== null &&
    Number.isFinite(artifact.width) &&
    Number.isFinite(artifact.height) &&
    artifact.width > 0 &&
    artifact.height > 0;
  const facts = [
    ["Format", formats[mime] ?? (mime || "Not reported")],
    [
      "File size",
      Number.isFinite(artifact.bytes) && artifact.bytes >= 0 ? formatFileSize(artifact.bytes) : "Not reported",
    ],
  ];
  if (!mime.startsWith("audio/")) {
    facts.push(["Dimensions", hasDimensions ? `${artifact.width} × ${artifact.height} pixels` : "Not reported"]);
  }
  if (!mime.startsWith("image/")) {
    facts.push(
      [
        "Duration",
        artifact.durationSeconds !== null && Number.isFinite(artifact.durationSeconds) && artifact.durationSeconds >= 0
          ? `${artifact.durationSeconds.toLocaleString("en-US", { maximumFractionDigits: 3 })} seconds`
          : "Not reported",
      ],
      ["Audio", artifact.hasAudio ? "Included" : "No audio track"],
    );
  }
  return facts;
}

/** Presentation only: the parent owns authorized native-browser downloads. */
export function DownloaderResults({
  job,
  onBack,
  onDownload,
  requestedArtifactId,
  checking = false,
}: DownloaderResultsProps) {
  const headingId = useId();
  const expiry = job.expiresAt ? new Date(job.expiresAt) : null;
  const validExpiry = expiry !== null && Number.isFinite(expiry.getTime());
  const count = job.artifacts.length;
  const requestedArtifact = job.artifacts.find((artifact) => artifact.id === requestedArtifactId);

  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-4 text-foreground">
      <header className="flex items-start gap-3">
        <BackButton
          label="Back to video link"
          onClick={onBack}
          disabled={checking}
          className="shrink-0 hover:bg-transparent active:bg-transparent"
        />
        <div className="min-w-0 space-y-1">
          <h2 id={headingId} className="font-heading text-xl font-semibold leading-snug">
            {count === 1 ? "Your file is" : `Your ${count} files are`} ready to download
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">Download a file, then open it on your device.</p>
        </div>
      </header>

      <Card className="min-w-0 gap-0 overflow-hidden p-0 shadow-none">
        <p className="border-b border-border bg-muted px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          In-browser preview is unavailable for these files.
        </p>
        <ul aria-label="Prepared files" className="min-w-0 divide-y divide-border">
          {job.artifacts.map((artifact, index) => (
            <li key={artifact.id} className="@container min-w-0 p-4">
              <article
                aria-labelledby={`${headingId}-file-${index}`}
                className="flex min-w-0 flex-col gap-4 @lg:flex-row @lg:items-center @lg:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-3">
                  <h3
                    id={`${headingId}-file-${index}`}
                    className="text-base font-semibold leading-relaxed [overflow-wrap:anywhere]"
                  >
                    {artifact.name || `File ${index + 1}`}
                  </h3>
                  <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 text-sm leading-relaxed @xl:grid-cols-3">
                    {artifactFacts(artifact).map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="[overflow-wrap:anywhere]">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="min-w-0 @lg:w-48 @lg:shrink-0">
                  <DownloadAction
                    label={count === 1 ? "Download file" : `Download file ${index + 1}`}
                    onDownload={() => onDownload(artifact)}
                    disabled={checking}
                  />
                </div>
              </article>
            </li>
          ))}
        </ul>
      </Card>

      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
        <p>
          {validExpiry ? (
            <>
              Available until{" "}
              <time dateTime={expiry.toISOString()}>
                {expiry.toLocaleString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: false,
                  timeZone: "UTC",
                  timeZoneName: "short",
                })}
              </time>
              .
            </>
          ) : (
            "Expiry time has not been provided."
          )}
        </p>
        {checking && <p role="status">Checking download availability. Please wait.</p>}
        <p role="status" aria-live="polite" aria-atomic="true" className="[overflow-wrap:anywhere]">
          {requestedArtifact && (
            <>
              Download requested for {requestedArtifact.name || "this file"}. Check your browser’s downloads for
              progress; this does not confirm the file was saved.
            </>
          )}
        </p>
      </div>
    </section>
  );
}
