import { DownloadError, MAX_DOWNLOAD_DURATION_SECONDS, type PlatformId } from "./contracts.ts";
import { getPlatformService, parsePlatformUrl } from "./platformRegistry.ts";
import { containerStatusSchema, type AttemptIdentity, type ContainerStart, type ContainerStatus } from "./execution.ts";
import {
  claimDownloadJob,
  consumeDownloadEngineStart,
  heartbeatDownloadAttempt,
  finishDownloadAttempt,
  type DownloadAttemptToken,
  type DownloadRuntimeLimits,
  type DownloadUsage,
  type FinishDownloadAttempt,
  type SealedDownloadArtifact,
} from "./jobs.ts";

export interface DownloadDispatchRuntime {
  // Open a database operation for each short transaction, never across native work.
  database<T>(operation: () => Promise<T>): Promise<T>;
  now(): number;
  sleep(milliseconds: number): Promise<void>;
  resolveShortLink(url: string, platformId: PlatformId, deadline: string): Promise<string>;
  createStagingArtifacts(token: DownloadAttemptToken): Promise<ContainerStart["stagingArtifacts"]>;
  sealArtifacts(
    token: DownloadAttemptToken,
    staged: ContainerStart["stagingArtifacts"],
    artifacts: ContainerStatus["artifacts"],
    progress: { deadline: string; heartbeat: () => Promise<void> },
  ): Promise<readonly SealedDownloadArtifact[]>;
  // Implementations bound every call by the attempt deadline. Usage is trusted,
  // cumulative for this attempt (including earlier starts), not native self-report.
  start(token: DownloadAttemptToken, start: ContainerStart): Promise<unknown>;
  status(token: DownloadAttemptToken, identity: AttemptIdentity): Promise<unknown>;
  cancel(token: DownloadAttemptToken, identity: AttemptIdentity): Promise<unknown>;
}

export type DownloadDispatchResult = { status: "ack" } | { status: "retry"; delaySeconds: number };
const FILE_BYTES = 250 * 1024 * 1024;
const OUTPUT_BYTES = 500 * 1024 * 1024;
const SCRATCH_BYTES = 2 * 1024 * 1024 * 1024;
const FALLBACK_CODES = new Set(["extraction_failed", "upstream_failure"]);
const PHASES = new Set([
  "starting",
  "inspecting",
  "extracting",
  "downloading",
  "validating",
  "uploading",
  "promoting",
  "processing",
]);
const SOURCE_FAILURES = new Map<string, [string, string]>([
  [
    "source_challenge",
    ["SOURCE_VERIFICATION_REQUIRED", "The source requires verification. Try a different public video."],
  ],
  [
    "source_unavailable",
    ["SOURCE_UNAVAILABLE", "This video is unavailable or requires sign-in. Try a public video link."],
  ],
  ["source_denied", ["SOURCE_ACCESS_DENIED", "The source refused this download. Try a different public video."]],
  [
    "source_duration_limit",
    [
      "SOURCE_TOO_LONG",
      `This video exceeds the current ${MAX_DOWNLOAD_DURATION_SECONDS / 60}-minute length limit. Choose a shorter video.`,
    ],
  ],
  ["format_unavailable", ["FORMAT_UNAVAILABLE", "That format is no longer available. Check the link's formats again."]],
  ["no_video_formats", ["NO_VIDEO_FORMATS", "No supported video formats are available within the download limits."]],
  [
    "unsupported_source",
    ["UNSUPPORTED_MEDIA", "Use a public video post. Photos, mixed-media posts and external embeds are not supported."],
  ],
  [
    "multiple_videos_unsupported",
    ["MULTIPLE_VIDEOS", "Only posts containing one video are supported. Choose a different post."],
  ],
  [
    "tls_failed",
    ["SOURCE_CONNECTION_FAILED", "A secure connection to the video source failed. Please try again later."],
  ],
]);

function failure(code: string, message: string): DownloadError {
  return new DownloadError(code, message, 400, false);
}

/** One claimed attempt, at most one approved alternate, and one fenced settlement. */
export async function dispatchDownloadJob(
  message: { jobId: string; dispatchVersion: number },
  options: { slotIds: readonly string[]; limits: DownloadRuntimeLimits },
  runtime: DownloadDispatchRuntime,
): Promise<DownloadDispatchResult> {
  const dispatchStarted = performance.now();
  const timings = new Map<string, { durationMs: number; count: number }>();
  let requestId: string | undefined;
  async function measure<T>(stage: string, operation: () => Promise<T>): Promise<T> {
    const started = performance.now();
    try {
      return await operation();
    } finally {
      const total = timings.get(stage) ?? { durationMs: 0, count: 0 };
      total.durationMs += Math.max(0, performance.now() - started);
      total.count += 1;
      timings.set(stage, total);
    }
  }
  try {
    const claim = await measure("claim_db", () =>
      runtime.database(() => claimDownloadJob(message.jobId, message.dispatchVersion, options)),
    );
    if (claim.status !== "claimed") {
      return claim.status === "busy" || claim.status === "deferred"
        ? { status: "retry", delaySeconds: claim.retryAfterSeconds ?? 10 }
        : { status: "ack" };
    }

    requestId = claim.input.requestId;
    const { token, remaining } = claim;
    const startedAt = runtime.now();
    const deadline = Date.parse(claim.deadline);
    let usage: DownloadUsage = { workMs: 0, sourceBytes: 0 };
    let identity: AttemptIdentity | undefined;
    let stopped = true;
    let uncertainUsage = false;
    let result: FinishDownloadAttempt;
    let renewedAt = runtime.now();
    const heartbeatInterval = Math.max(1, Math.min(5_000, Math.floor(options.limits.leaseMs / 3)));

    function currentUsage(): DownloadUsage {
      usage = { ...usage, workMs: Math.max(usage.workMs, Math.max(0, runtime.now() - startedAt)) };
      return usage;
    }
    function readStatus(value: unknown): ContainerStatus {
      const parsed = containerStatusSchema.safeParse(value);
      if (!parsed.success || (parsed.data.state === "running" && parsed.data.stopped)) {
        throw failure("ENGINE_CONTRACT", "The downloader returned an invalid execution result.");
      }
      const status = parsed.data;
      // Work includes control-plane wall time as well as the trusted native meter.
      usage = {
        workMs: Math.max(usage.workMs, status.usage.workMs),
        sourceBytes: Math.max(usage.sourceBytes, status.usage.sourceBytes),
      };
      stopped = status.stopped;
      return status;
    }
    function checkBudget(): DownloadUsage {
      const measured = currentUsage();
      if (
        !Number.isFinite(deadline) ||
        runtime.now() >= deadline ||
        measured.workMs >= remaining.workMs ||
        measured.sourceBytes >= remaining.sourceBytes
      ) {
        throw failure("DOWNLOAD_STOPPED", "This download was stopped or reached its processing limit.");
      }
      return measured;
    }
    async function pulse(phase: string): Promise<void> {
      const measured = checkBudget();
      const started = runtime.now();
      const heartbeat = await measure("heartbeat_db", () =>
        runtime.database(() =>
          heartbeatDownloadAttempt(token, { ...measured, phase: PHASES.has(phase) ? phase : "processing" }),
        ),
      );
      if (!heartbeat.accepted || heartbeat.shouldStop) {
        throw failure("DOWNLOAD_STOPPED", "This download was stopped or reached its processing limit.");
      }
      renewedAt = started;
      checkBudget();
    }

    try {
      const service = getPlatformService(claim.input.platform);
      let parsed = parsePlatformUrl(claim.input.platform, claim.input.url);
      if (parsed.status === "short-link") {
        const shortLink = parsed.url;
        const resolved = await measure("shortlink_resolution", () =>
          runtime.resolveShortLink(shortLink, claim.input.platform, claim.deadline),
        );
        parsed = parsePlatformUrl(claim.input.platform, resolved);
      }
      if (!service || parsed.status !== "supported") {
        throw failure("UNSUPPORTED_SOURCE", "Use a supported public video link for this platform.");
      }
      const source = parsed.source;
      const inspecting = claim.input.inspect === true && !claim.input.selectedFormat;
      const engines = service.enginesFor(source, claim.input.selectedFormat);
      if (!engines.length)
        throw failure("PLATFORM_UNAVAILABLE", "Downloads for this source are temporarily unavailable.");

      for (let index = 0; index < engines.length; index += 1) {
        const stagingArtifacts = inspecting
          ? []
          : await measure("artifact_signing", () => runtime.createStagingArtifacts(token));
        const measured = checkBudget();
        renewedAt = runtime.now();
        // Renew the lease, check cancellation and debit the start atomically.
        const debit = await measure("engine_debit_db", () =>
          runtime.database(() =>
            consumeDownloadEngineStart(token, { ...measured, phase: inspecting ? "inspecting" : "starting" }),
          ),
        );
        if (!debit.allowed)
          throw failure(
            debit.shouldStop ? "DOWNLOAD_STOPPED" : "WORK_BUDGET",
            "This download was stopped or reached its processing limit.",
          );
        checkBudget();
        identity = {
          jobId: token.jobId,
          attemptGeneration: token.generation,
          slotGeneration: token.slotGeneration,
          startOrdinal: debit.ordinal,
        };
        const request = service.buildEngineRequest(source, engines[index], {
          quality: claim.input.quality,
          ...(claim.input.inspect === undefined ? {} : { inspect: claim.input.inspect }),
          ...(claim.input.selectedFormat === undefined ? {} : { selectedFormat: claim.input.selectedFormat }),
          ...(claim.input.expectedFormat === undefined ? {} : { expectedFormat: claim.input.expectedFormat }),
        });
        stopped = false; // A lost response cannot prove that /start did not execute.
        let status = readStatus(
          await measure("container_start_rpc", () =>
            runtime.start(token, {
              ...identity!,
              protocolVersion: 1,
              deadline: claim.deadline,
              request,
              stagingArtifacts,
              limits: {
                workMs: Math.max(1, claim.remaining.workMs - usage.workMs),
                sourceBytes: Math.max(1, claim.remaining.sourceBytes - usage.sourceBytes),
                outputBytes: OUTPUT_BYTES,
                fileBytes: FILE_BYTES,
                scratchBytes: SCRATCH_BYTES,
                durationSeconds: MAX_DOWNLOAD_DURATION_SECONDS,
                maxItems: 5,
              },
            }),
          ),
        );
        for (;;) {
          checkBudget();
          // A stopped result is fenced and charged by settlement itself.
          if (status.state !== "running" && status.stopped) break;
          await runtime.sleep(
            Math.max(1, Math.min(inspecting ? 250 : 1_000, heartbeatInterval, deadline - runtime.now())),
          );
          checkBudget();
          if (runtime.now() - renewedAt >= heartbeatInterval) await pulse(inspecting ? "inspecting" : status.phase);
          status = readStatus(await measure("container_status_rpc", () => runtime.status(token, identity!)));
        }

        if (status.state === "succeeded") {
          const classification = service.classifySource(source, status.evidence);
          if (classification.status !== "supported") throw failure("UNSUPPORTED_MEDIA", classification.message);
          if (inspecting) {
            if (
              status.error ||
              status.artifacts.length ||
              !status.inspection ||
              classification.items.length !== 1 ||
              status.inspection.formats.some(
                (format) =>
                  Math.min(format.width, format.height) > Number(claim.input.quality) ||
                  (format.bytes !== null && format.bytes > FILE_BYTES),
              )
            )
              throw failure("ENGINE_CONTRACT", "The source returned invalid video formats.");
            result = {
              outcome: "ready",
              stopped: true,
              inspection: status.inspection,
              sourceUrl: source.url,
              usage: currentUsage(),
            };
            break;
          }
          if (status.inspection) throw failure("ENGINE_CONTRACT", "The downloader returned formats instead of a file.");
          const allocated = new Map(stagingArtifacts.map((file) => [file.artifactId, file.storageKey]));
          if (
            status.error ||
            status.artifacts.length !== classification.items.length ||
            new Set(status.artifacts.map((file) => file.id)).size !== status.artifacts.length ||
            status.artifacts.reduce((total, file) => total + file.bytes, 0) > OUTPUT_BYTES ||
            status.artifacts.some(
              (file) =>
                allocated.get(file.id) !== file.storageKey ||
                file.bytes > FILE_BYTES ||
                Math.min(file.width, file.height) > Number(claim.input.quality),
            )
          )
            throw failure("INVALID_ARTIFACT", "The complete output could not be verified within the requested limits.");
          await pulse("promoting");
          const artifacts = await measure("artifact_publish", () =>
            runtime.sealArtifacts(token, stagingArtifacts, status.artifacts, {
              deadline: claim.deadline,
              heartbeat: () => pulse("promoting"),
            }),
          );
          if (
            artifacts.length !== status.artifacts.length ||
            new Set(artifacts.map((file) => file.id)).size !== artifacts.length ||
            artifacts.some(
              (file) =>
                !status.artifacts.some(
                  (expected) =>
                    expected.id === file.id && expected.bytes === file.sizeBytes && expected.mime === file.mimeType,
                ),
            )
          ) {
            throw failure("INVALID_ARTIFACT", "The completed files could not be stored in full.");
          }
          await pulse("promoting");
          result = { outcome: "succeeded", stopped: true, artifacts, usage: currentUsage() };
          break;
        }
        if (status.state === "cancelled") throw failure("DOWNLOAD_STOPPED", "This download was stopped.");
        const mayFallback =
          index === 0 &&
          engines.length > 1 &&
          debit.remaining > 0 &&
          status.error?.retryable === true &&
          FALLBACK_CODES.has(status.error.code);
        if (!mayFallback) {
          const known = SOURCE_FAILURES.get(status.error?.code ?? "");
          throw failure(
            known?.[0] ?? "DOWNLOAD_FAILED",
            status.error?.message.trim() ||
              known?.[1] ||
              "This public video could not be downloaded. Try another supported link.",
          );
        }
      }
      result ??= {
        outcome: "failed",
        stopped,
        usage: currentUsage(),
        error: { code: "DOWNLOAD_FAILED", message: "The download could not be completed.", retryable: false },
      };
    } catch (error: unknown) {
      if (!stopped && identity) {
        try {
          const confirmationUntil = runtime.now() + 5_000;
          // Native cancel returns a snapshot before cleanup necessarily finishes.
          // Confirm briefly without detached requests. A final RPC can outlast this
          // window by its existing 20-second control timeout; uncertainty quarantines.
          for (let checks = 0; checks < 20 && !stopped; checks += 1) {
            if (checks > 0 && runtime.now() >= confirmationUntil) break;
            let ownsAttempt = true;
            try {
              const measured = currentUsage();
              const heartbeat = await measure("heartbeat_db", () =>
                runtime.database(() => heartbeatDownloadAttempt(token, { ...measured, phase: "stopping" })),
              );
              ownsAttempt = heartbeat.accepted;
            } catch {
              // Losing the database must not prevent the native stop request.
            }
            if (!ownsAttempt) break;
            readStatus(await measure("container_cancel_rpc", () => runtime.cancel(token, identity!)));
            const remaining = confirmationUntil - runtime.now();
            if (!stopped && remaining > 0) await runtime.sleep(Math.min(250, remaining));
          }
          uncertainUsage = !stopped;
        } catch {
          stopped = false;
          uncertainUsage = true;
        }
      }
      const safe =
        error instanceof DownloadError
          ? { code: error.code, message: error.message, retryable: error.retryable }
          : {
              code: "DOWNLOAD_FAILED",
              message: "The download could not be completed. Please try again later.",
              retryable: false,
            };
      result = { outcome: "failed", stopped, usage: currentUsage(), error: safe, uncertainUsage };
    }

    // A lost commit response must propagate. Never re-settle or delete final files:
    // the transaction may already have published them. Reconciliation owns orphans.
    await measure("settlement_db", () => runtime.database(() => finishDownloadAttempt(token, result)));
    return { status: "ack" };
  } finally {
    for (const [stage, timing] of timings) {
      console.info(
        JSON.stringify({
          event: "downloader_timing",
          stage: `dispatcher.${stage}`,
          durationMs: Math.round(timing.durationMs),
          count: timing.count,
          jobId: message.jobId,
          requestId,
        }),
      );
    }
    console.info(
      JSON.stringify({
        event: "downloader_timing",
        stage: "dispatcher.total",
        durationMs: Math.round(Math.max(0, performance.now() - dispatchStarted)),
        jobId: message.jobId,
        requestId,
      }),
    );
  }
}
