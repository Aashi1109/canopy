"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, RotateCw } from "lucide-react";
import type { ToolPageProps } from "@/components/ToolPage";
import { ToolPageLayout } from "@/components/tool-workbench/ToolPageLayout";
import { Button, Caption, ContentState, Toaster, WorkbenchShell, toast } from "@/components/ui/index.tsx";
import { ToolIcon } from "@/components/ToolIcon";
import type { DownloadArtifact } from "@/lib/downloaders/contracts";
import { downloadArtifactPath, isActiveDownload, validateDownloadUrl } from "@/lib/tool-runtime/downloadJobClient";
import { useDownloadJob } from "@/lib/tool-runtime/useDownloadJob";
import { DownloaderEntry } from "./downloader/DownloaderEntry";
import { DownloaderResults } from "./downloader/DownloaderResults";
import { DownloaderFormats } from "./downloader/DownloaderFormats";

const STAGES: Record<string, string> = {
  inspecting: "Checking available video formats",
  resolving: "Checking the public video link",
  downloading: "Retrieving the video",
  validating: "Checking the video file",
  uploading: "Preparing your download",
  publishing: "Preparing your download",
};

/** One family workspace; the server supplies only its safe platform capability. */
export default function DownloaderWorkspace(props: ToolPageProps) {
  const capability = props.spec.job;
  if (!capability) return null;
  const identity = props.account.user ? `account:${props.account.user.id ?? props.account.user.name}` : "guest";
  return <DownloaderPage key={`${capability.platform}:${identity}`} {...props} capability={capability} />;
}

function DownloaderPage({
  account,
  category,
  definitionKey,
  description,
  icon,
  relatedTools,
  spec,
  title,
  capability,
}: ToolPageProps & { capability: NonNullable<ToolPageProps["spec"]["job"]> }) {
  const { controller, job, busy, operation, error, recoverable, owner, storageWarning, pendingFormatId, intent } =
    useDownloadJob(capability.platform);
  const [url, setUrl] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [requestedArtifactId, setRequestedArtifactId] = useState<string>();
  const [expired, setExpired] = useState(false);
  const previousOwner = useRef(owner);
  const active = isActiveDownload(job);
  const unavailable = job?.state === "expired" || expired || error?.status === 410;
  const selectionNeedsStatus = !!pendingFormatId && unavailable;
  const waiting = active || recoverable || (busy && !job) || operation === "select" || selectionNeedsStatus;
  const inspectionMode = intent === "inspect" || (intent === null && !job && !recoverable);
  const checkingFormats = waiting && inspectionMode && !selectionNeedsStatus;
  const inspectionLoading = checkingFormats && (busy || (active && !error));
  const emptyResult = job?.state === "succeeded" && job.artifacts.length === 0;
  const completed = job?.state === "succeeded" && !unavailable && !emptyResult;
  const formatsReady = job?.state === "ready" && !!job.inspection && !unavailable;
  const status = selectionNeedsStatus
    ? "Check the previous format selection"
    : !busy && error?.code === "DOWNLOADS_NOT_CONFIGURED"
      ? "Download service unavailable"
      : !busy && error && (recoverable || active)
        ? job
          ? inspectionMode
            ? "Format status unavailable"
            : "Download status unavailable"
          : inspectionMode
            ? "Format check not confirmed"
            : "Download submission not confirmed"
        : recoverable
          ? inspectionMode
            ? "Checking your format request"
            : "Checking your download request"
          : busy && !job
            ? "Checking your download session"
            : operation === "select"
              ? "Starting your selected download"
              : operation === "cancel" || job?.state === "cancelling"
                ? inspectionMode
                  ? "Stopping format check"
                  : "Cancelling download"
                : job?.state === "queued"
                  ? "Waiting for a processing slot"
                  : active
                    ? inspectionMode
                      ? "Checking available video formats"
                      : (STAGES[job?.phase ?? ""] ?? "Checking the video request")
                    : unavailable
                      ? job?.inspection && !job.selectedFormat
                        ? "Available formats expired"
                        : "Download expired"
                      : emptyResult
                        ? "No download files are available"
                        : formatsReady
                          ? "Choose an available video format"
                          : completed
                            ? "Your download is ready"
                            : job?.state === "cancelled"
                              ? "Download cancelled"
                              : job?.state === "failed"
                                ? "Download could not be prepared"
                                : "Paste a public video link to begin";

  useEffect(() => {
    if (
      previousOwner.current &&
      owner &&
      (previousOwner.current.id !== owner.id || previousOwner.current.kind !== owner.kind)
    ) {
      setUrl("");
      setFieldError("");
      setRequestedArtifactId(undefined);
    }
    previousOwner.current = owner;
  }, [owner]);

  useEffect(() => {
    setRequestedArtifactId(undefined);
    setExpired(false);
    if (!job?.expiresAt || (job.state !== "ready" && job.state !== "succeeded" && job.state !== "expired")) return;
    const remaining = Date.parse(job.expiresAt) - Date.now();
    if (remaining <= 0) {
      setExpired(true);
      return;
    }
    const timer = window.setTimeout(() => setExpired(true), Math.min(remaining, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [job?.id, job?.expiresAt, job?.state]);

  useEffect(() => {
    if (!error || error.status === 410) return;
    if (!job && !recoverable && (error.code.toLowerCase().includes("url") || error.code === "INVALID_REQUEST")) {
      setFieldError(error.message);
    } else {
      toast.error(error.message, {
        id: "downloader-operation",
        description: error.retryAfterSeconds ? `Try again in ${error.retryAfterSeconds} seconds.` : undefined,
      });
    }
  }, [error, job, recoverable]);
  useEffect(() => {
    if (job?.state === "failed")
      toast.error(job.error?.message ?? "This video could not be downloaded. Try another public video link.", {
        id: "downloader-operation",
      });
  }, [job?.state, job?.error]);

  const start = () => {
    if (checkingFormats) {
      void controller.resume();
      return true;
    }
    const issue = validateDownloadUrl(url, capability.platform);
    setFieldError(issue ?? "");
    if (issue) return false;
    toast.dismiss("downloader-operation");
    void controller.inspect(url);
    return true;
  };
  const download = (artifact: DownloadArtifact) => {
    if (!job || job.state !== "succeeded" || unavailable || busy) return;
    // Timers can be delayed in a background tab. Enforce expiry again at the
    // interaction boundary and show recovery instead of silently doing nothing.
    if (job.expiresAt && Date.parse(job.expiresAt) <= Date.now()) {
      setExpired(true);
      return;
    }
    // Native attachment navigation keeps large videos out of application memory.
    const link = document.createElement("a");
    link.href = downloadArtifactPath(job.id, artifact.id);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.append(link);
    link.click();
    link.remove();
    setRequestedArtifactId(artifact.id);
  };
  const reset = () => {
    controller.reset();
    setExpired(false);
    setFieldError("");
    setRequestedArtifactId(undefined);
  };

  return (
    <>
      <Toaster position="top-right" />
      <ToolPageLayout
        account={account}
        app="downloaders"
        category={category}
        content={spec.content}
        description={description}
        relatedTools={relatedTools}
        title={title}
        usesNetwork
        primaryAction="Download"
      >
        <WorkbenchShell
          id="tool-workspace"
          tabIndex={-1}
          data-definition-key={definitionKey}
          workspaceTitle={title}
          variant="media"
          density="comfortable"
          className="h-auto [&_[data-slot=workbench-content]]:overflow-auto [&_[data-slot=workbench-toolbar]]:px-3 sm:[&_[data-slot=workbench-toolbar]]:px-5"
          toolbar={<ToolIcon icon={icon} size={24} />}
          status={
            checkingFormats ? undefined : (
              <Caption
                role="status"
                aria-live="polite"
                className="flex min-w-0 items-center gap-2 text-muted-foreground"
              >
                {completed && <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-success" />}
                <span className="truncate">{status}</span>
              </Caption>
            )
          }
        >
          <div className="flex min-h-full min-w-0 flex-col justify-center p-3 sm:p-4">
            <div className="mx-auto w-full max-w-6xl">
              {completed && job ? (
                <DownloaderResults
                  job={job}
                  onBack={reset}
                  onDownload={download}
                  requestedArtifactId={requestedArtifactId}
                  checking={busy}
                />
              ) : formatsReady && job?.inspection && !recoverable && operation !== "select" ? (
                <DownloaderFormats
                  key={job.id}
                  job={job}
                  inspection={job.inspection}
                  source={url}
                  platformName={capability.platformName}
                  pendingFormatId={pendingFormatId}
                  busy={busy}
                  onBack={reset}
                  onSelect={(formatId) => void controller.selectFormat(formatId)}
                  onCheck={() => void controller.resume()}
                />
              ) : waiting && !checkingFormats ? (
                <ContentState
                  state={error || selectionNeedsStatus ? "waiting" : "loading"}
                  title={status}
                  description={
                    operation === "select"
                      ? "Starting the format you selected. Check status if the request cannot be confirmed."
                      : selectionNeedsStatus
                        ? "The format list expired while a selection was unconfirmed. Check its status before starting another video."
                        : error
                          ? job
                            ? "We could not check the latest download status. Check its status again before starting another download."
                            : "We could not confirm the outcome of your earlier request. Check its status before submitting again."
                          : job?.state === "cancelling"
                            ? "Waiting for the service to confirm it has stopped. You can start another video after cancellation."
                            : recoverable
                              ? "Recovering the existing request without submitting a duplicate."
                              : !job
                                ? "Verifying your session and checking for an existing download."
                                : job?.phase === "inspecting"
                                  ? "Reading the video's available formats. Choose a format before we prepare a download."
                                  : "This may take a moment. Progress has no reliable percentage. Leaving this page does not cancel the request."
                  }
                  className="min-h-72"
                  action={
                    active && job?.state !== "cancelling" ? (
                      <Button
                        size="md"
                        variant="secondary"
                        disabled={operation === "start" || operation === "select" || operation === "cancel"}
                        loading={operation === "cancel"}
                        onClick={() => void controller.cancel()}
                      >
                        Cancel download
                      </Button>
                    ) : undefined
                  }
                  secondaryAction={
                    <Button size="md" variant="outline" disabled={busy} onClick={() => void controller.resume()}>
                      <RotateCw aria-hidden="true" />
                      Check status
                    </Button>
                  }
                />
              ) : unavailable || emptyResult || job?.state === "cancelled" || job?.state === "failed" ? (
                <ContentState
                  state={
                    job?.state === "cancelled" ? "cancelled" : unavailable || emptyResult ? "unavailable" : "error"
                  }
                  title={status}
                  description={
                    unavailable
                      ? job?.inspection && !job.selectedFormat
                        ? "These format options are no longer current. Return to the video link and check formats again."
                        : "The temporary files are no longer available. Paste the video link again to prepare a new download."
                      : emptyResult
                        ? "The service returned no downloadable files. Check the request status or return to the video link."
                        : job?.state === "cancelled"
                          ? "The service confirmed that processing has stopped. Your previous link is still here if you want to try again."
                          : (job?.error?.message ?? "Try a public video that you own or have permission to save.")
                  }
                  action={
                    <Button size="md" onClick={reset}>
                      {url ? "Return to video link" : "Paste another link"}
                    </Button>
                  }
                  secondaryAction={
                    emptyResult ? (
                      <Button size="md" variant="outline" disabled={busy} onClick={() => void controller.resume()}>
                        <RotateCw aria-hidden="true" />
                        Check status
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <DownloaderEntry
                  platformName={capability.platformName}
                  value={url}
                  onChange={(value) => {
                    setUrl(value);
                    setFieldError(value && fieldError ? (validateDownloadUrl(value, capability.platform) ?? "") : "");
                  }}
                  onBlur={() => {
                    if (url.trim()) setFieldError(validateDownloadUrl(url, capability.platform) ?? "");
                  }}
                  onInspect={start}
                  error={fieldError}
                  busy={busy || inspectionLoading}
                  inputDisabled={checkingFormats}
                />
              )}
              {storageWarning && (
                <p className="mt-3 text-sm text-muted-foreground">
                  Browser storage is unavailable. Keep this tab open to find your download again.
                </p>
              )}
              {requestedArtifactId && (
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span>Check your browser’s downloads. If nothing appeared, check the file’s status.</span>
                  <Button size="md" variant="link" disabled={busy} onClick={() => void controller.resume()}>
                    Check status
                  </Button>
                </div>
              )}
              {error && !inspectionMode && !waiting && !completed && !formatsReady && !unavailable && !fieldError && (
                <Button
                  className="mt-2"
                  size="md"
                  variant="link"
                  disabled={busy}
                  onClick={() => void controller.resume()}
                >
                  Check service and session
                </Button>
              )}
            </div>
          </div>
        </WorkbenchShell>
      </ToolPageLayout>
    </>
  );
}
