import { z } from "zod";
import { createHash } from "node:crypto";
import { withDatabaseOperation } from "../../db/runtime";
import { downloadConfiguration, matchesEgressHost, type DownloadSettingsEnv } from "./config";
import { DownloadError, downloadFormatIdSchema, type DownloadInspection, type DownloadOwner } from "./contracts";
import { DownloaderContainer } from "./cloudflareContainer";
import { dispatchDownloadJob } from "./dispatcher";
import {
  admitDownloadJob,
  beginDownloadRecovery,
  cancelDownloadJob,
  checkDownloadInspectionAdmission,
  claimDueDownloadDispatches,
  expireQueuedDownloadJobs,
  pruneDownloadHistory,
  expireDownloadArtifacts,
  findDownloadSubmission,
  finishDownloadAttempt,
  getArtifactForOwner,
  getDownloadJob,
  listStaleDownloadAttempts,
  markDownloadArtifactDeleted,
  markDownloadDispatched,
  selectDownloadFormat,
} from "./jobs";
import { getPlatformService, platformServices, parsePlatformUrl } from "./platformRegistry";
import { downloadErrorResponse, readDownloadJson, verifyCapability } from "./security";
import { handleLocalStorageRequest } from "./localStorage";
import { createStagingArtifacts, sealDownloadArtifacts, signStorageUrl, type DownloadStorageEnv } from "./storage";
import { inspectYouTube } from "./youtubeInspection";
import { inspectInstagram } from "./instagramInspection";

export { DownloaderContainer, ContainerProxy } from "./cloudflareContainer";
type DownloadMessage = { jobId: string; dispatchVersion: number };
export type DownloaderEnv = DownloadSettingsEnv &
  DownloadStorageEnv & {
    DB: { connectionString: string };
    DOWNLOAD_QUEUE: Queue<DownloadMessage>;
    DOWNLOAD_FILES: R2Bucket;
    DOWNLOAD_CONTAINERS: DurableObjectNamespace<DownloaderContainer>;
    DOWNLOAD_INSPECTION_RATE_LIMITER?: RateLimit;
  };
const messageSchema = z.object({ jobId: z.uuid(), dispatchVersion: z.number().int().positive() }).strict();
const inputSchema = z
  .object({
    platform: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    url: z.string().max(4096),
    quality: z.enum(["720", "1080"]),
    requestId: z.uuid(),
    inspect: z.boolean().optional(),
  })
  .strict();
const envelope = z
  .object({
    owners: z
      .array(z.object({ kind: z.enum(["guest", "account"]), id: z.string().min(1).max(200) }).strict())
      .min(1)
      .max(2),
    input: inputSchema.optional(),
    networkHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    jobId: z.uuid().optional(),
    artifactId: z.uuid().optional(),
    requestId: z.uuid().optional(),
    formatId: downloadFormatIdSchema.optional(),
  })
  .strict();
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
function database<T>(env: DownloaderEnv, operation: () => Promise<T>): Promise<T> {
  if (!env.DB?.connectionString)
    throw new DownloadError("DOWNLOADS_UNAVAILABLE", "Download storage is unavailable.", 503, true);
  return withDatabaseOperation(operation, env.DB.connectionString);
}
async function timed<T>(
  stage: string,
  operation: () => Promise<T>,
  ids: { jobId?: string; requestId?: string } = {},
): Promise<T> {
  const started = performance.now();
  try {
    return await operation();
  } finally {
    console.info(
      JSON.stringify({
        event: "downloader_timing",
        stage: `worker.${stage}`,
        durationMs: Math.round(Math.max(0, performance.now() - started)),
        ...ids,
      }),
    );
  }
}
async function forOwner<T>(
  owners: readonly DownloadOwner[],
  operation: (owner: DownloadOwner) => Promise<T>,
): Promise<T> {
  for (const owner of owners) {
    try {
      return await operation(owner);
    } catch (error) {
      if (!(error instanceof DownloadError) || error.status !== 404) throw error;
    }
  }
  throw new DownloadError("NOT_FOUND", "This download is unavailable.", 404);
}
async function dispatchDue(env: DownloaderEnv, jobId?: string) {
  const due = await timed(
    "outbox_claim_db",
    () => database(env, () => claimDueDownloadDispatches(jobId ? 1 : 100, jobId)),
    { jobId },
  );
  for (const { jobId, dispatchVersion } of due) {
    await timed("outbox_enqueue", () => env.DOWNLOAD_QUEUE.send({ jobId, dispatchVersion }), { jobId });
    await timed("outbox_mark_db", () => database(env, () => markDownloadDispatched(jobId, dispatchVersion)), { jobId });
  }
}
async function publishDispatch(env: DownloaderEnv, jobId: string, context?: Pick<ExecutionContext, "waitUntil">) {
  // Admission's durable outbox can be rescued if publication is interrupted.
  const publication = dispatchDue(env, jobId).catch(() => console.warn("downloader_dispatch_deferred"));
  if (context) context.waitUntil(publication);
  else await publication;
}
async function resolveShortLink(url: string, platform: string, deadline: string): Promise<string> {
  let next = url;
  for (let hop = 0; hop < 4; hop++) {
    const parsed = parsePlatformUrl(platform, next);
    if (parsed.status === "supported") return parsed.source.url;
    if (parsed.status !== "short-link")
      throw new DownloadError("UNSUPPORTED_URL", "The shared link is not a supported public video.");
    const remaining = Math.min(5000, Date.parse(deadline) - Date.now());
    if (remaining <= 0) throw new DownloadError("WORK_BUDGET", "The shared link took too long to resolve.");
    // HEAD avoids downloading unmetered response bodies. Hosts were checked by the service.
    const response = await fetch(parsed.url, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(remaining),
    });
    await response.body?.cancel();
    const location = response.headers.get("location");
    if (![301, 302, 303, 307, 308].includes(response.status) || !location)
      throw new DownloadError("UNSUPPORTED_URL", "Use the full video link instead of this shared link.");
    next = new URL(location, parsed.url).href;
  }
  throw new DownloadError("UNSUPPORTED_URL", "This shared link redirects too many times. Use the full video link.");
}
function runtime(env: DownloaderEnv) {
  return {
    database: <T>(operation: () => Promise<T>) => database(env, operation),
    start: (
      token: Parameters<typeof createStagingArtifacts>[1],
      input: Parameters<DownloaderContainer["startExecution"]>[0],
    ) => {
      const parsed = new URL(input.request.url);
      const service = platformServices.find((value) => value?.descriptor.hosts.includes(parsed.hostname));
      if (!service) throw new DownloadError("UNSUPPORTED_URL", "Unsupported source.");
      return env.DOWNLOAD_CONTAINERS.getByName(token.slotId).startExecution(input, [...service.descriptor.egressHosts]);
    },
    status: (
      token: Parameters<typeof createStagingArtifacts>[1],
      identity: Parameters<DownloaderContainer["statusExecution"]>[0],
    ) => env.DOWNLOAD_CONTAINERS.getByName(token.slotId).statusExecution(identity),
    cancel: (
      token: Parameters<typeof createStagingArtifacts>[1],
      identity: Parameters<DownloaderContainer["cancelExecution"]>[0],
    ) => env.DOWNLOAD_CONTAINERS.getByName(token.slotId).cancelExecution(identity),
    createStagingArtifacts: (token: Parameters<typeof createStagingArtifacts>[1]) => createStagingArtifacts(env, token),
    sealArtifacts: (
      token: Parameters<typeof createStagingArtifacts>[1],
      staged: Parameters<typeof sealDownloadArtifacts>[2],
      artifacts: Parameters<typeof sealDownloadArtifacts>[3],
      progress: Parameters<typeof sealDownloadArtifacts>[4],
    ) => sealDownloadArtifacts(env, token, staged, artifacts, progress),
    resolveShortLink,
    now: () => Date.now(),
    sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  };
}

const downloaderWorker = {
  async fetch(request: Request, env: DownloaderEnv, context?: Pick<ExecutionContext, "waitUntil">): Promise<Response> {
    try {
      const localStorage = await handleLocalStorageRequest(request, env);
      if (localStorage) return localStorage;
      const url = new URL(request.url);
      if (request.method !== "POST") return new Response("Not found", { status: 404 });
      let body: unknown;
      if (env.DOWNLOADERS_LOCAL === "true") {
        if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.search)
          return new Response("Not found", { status: 404 });
        body = await readDownloadJson(request);
        const authorization = request.headers.get("authorization") ?? "";
        const proof = authorization.startsWith("Bearer ")
          ? verifyCapability(authorization.slice(7), [env.DOWNLOADERS_CONTROL_SECRET ?? ""])
          : null;
        if (
          proof?.purpose !== "download-local-control-v1" ||
          proof.path !== url.pathname ||
          proof.bodyHash !== createHash("sha256").update(JSON.stringify(body)).digest("hex") ||
          Number(proof.expiresAt) > Math.floor(Date.now() / 1000) + 60
        )
          throw new DownloadError("FORBIDDEN", "Invalid local download request.", 403);
        if (url.pathname === "/__download-health") return json({ ready: true, local: true });
        if (url.pathname === "/__download-maintenance") {
          await downloaderWorker.scheduled({} as ScheduledController, env);
          return json({ ok: true });
        }
      } else {
        if (url.hostname !== "downloaders.internal") return new Response("Not found", { status: 404 });
        body = await readDownloadJson(request);
      }
      const value = envelope.parse(body);
      const action = url.pathname;
      switch (action) {
        case "/create": {
          const input = inputSchema.parse(value.input);
          if (value.owners.length !== 1 || !value.networkHash)
            throw new DownloadError("INVALID_REQUEST", "Invalid submission.");
          const parsed = parsePlatformUrl(input.platform, input.url);
          if (parsed.status === "unsupported") throw new DownloadError(parsed.code, parsed.message);
          input.url = parsed.status === "supported" ? parsed.source.url : parsed.url;
          const { limits } = downloadConfiguration(env);
          const service = getPlatformService(input.platform);
          const hosts = service?.descriptor.egressHosts ?? [];
          let inspection: { value: DownloadInspection; expiresAt: Date } | undefined;
          let inspectionUsage: { sourceBytes: number; workMs: number } | undefined;
          if (
            input.inspect &&
            parsed.status === "supported" &&
            limits.enabled &&
            limits.enabledPlatforms.includes(input.platform) &&
            env.DOWNLOAD_INSPECTION_RATE_LIMITER
          ) {
            // Fast, per-location burst protection supplements the authoritative SQL daily counters.
            const ownerKey = createHash("sha256").update(JSON.stringify(value.owners[0])).digest("hex");
            const allowed = await Promise.all([
              env.DOWNLOAD_INSPECTION_RATE_LIMITER.limit({ key: `canopy:inspection:owner:${ownerKey}` }),
              env.DOWNLOAD_INSPECTION_RATE_LIMITER.limit({ key: `canopy:inspection:network:${value.networkHash}` }),
            ]);
            if (allowed.some((result) => !result.success))
              throw new DownloadError("RATE_LIMITED", "Too many format checks. Try again in a minute.", 429, true);
            const inspectionEngine = service?.inspectionEngine;
            const inspectSource =
              inspectionEngine === "youtubei" &&
              env.DOWNLOADERS_YOUTUBE_INSPECTION === "true" &&
              matchesEgressHost("www.youtube.com", hosts)
                ? inspectYouTube
                : inspectionEngine === "instagram" &&
                    env.DOWNLOADERS_INSTAGRAM_INSPECTION === "true" &&
                    matchesEgressHost("www.instagram.com", hosts)
                  ? inspectInstagram
                  : undefined;
            if (inspectSource) {
              // Native inspection is already gated by atomic admission below.
              // Only inline metadata work needs a quota check before admission.
              const preparation = await timed(
                "inspection_preflight_db",
                () =>
                  database(env, () =>
                    checkDownloadInspectionAdmission(value.owners[0], input, {
                      networkHash: value.networkHash!,
                      limits,
                    }),
                  ),
                { requestId: input.requestId },
              );
              if (preparation.job) {
                if (preparation.job.state === "queued") await publishDispatch(env, preparation.job.id, context);
                return json({ job: preparation.job }, 202);
              }
              inspection = preparation.inspection;
              if (!inspection) {
                const metadata = await timed(
                  inspectionEngine === "youtubei" ? "youtube_inspection" : "instagram_inspection",
                  () => inspectSource(parsed.source, input.quality, limits.jobSourceBytes),
                  { requestId: input.requestId },
                );
                inspectionUsage = { sourceBytes: metadata.sourceBytes, workMs: metadata.workMs };
                if (metadata.inspection)
                  inspection = { value: metadata.inspection, expiresAt: new Date(Date.now() + 120_000) };
              }
            }
          }
          const job = await timed(
            "admission_db",
            () =>
              database(env, () =>
                admitDownloadJob(value.owners[0], input, {
                  networkHash: value.networkHash!,
                  limits,
                  ...(inspection ? { inspection } : {}),
                  ...(inspectionUsage ? { inspectionUsage } : {}),
                }),
              ),
            { requestId: input.requestId },
          );
          // Durable outbox remains authoritative if queue publication fails after admission.
          if (job.state === "queued") await publishDispatch(env, job.id, context);
          return json({ job }, 202);
        }
        case "/select": {
          const jobId = z.uuid().parse(value.jobId);
          const formatId = downloadFormatIdSchema.parse(value.formatId);
          const { limits } = downloadConfiguration(env);
          const job = await timed(
            "selection_db",
            () =>
              forOwner(value.owners, (owner) =>
                database(env, () => selectDownloadFormat(owner, jobId, formatId, limits)),
              ),
            { jobId },
          );
          if (job.state === "queued") await publishDispatch(env, job.id, context);
          return json({ job }, 202);
        }
        case "/status":
          return json({
            job: await forOwner(value.owners, (owner) =>
              database(env, () => getDownloadJob(owner, z.uuid().parse(value.jobId))),
            ),
          });
        case "/submission": {
          for (const owner of value.owners) {
            const job = await database(env, () => findDownloadSubmission(owner, z.uuid().parse(value.requestId)));
            if (job) return json({ job });
          }
          throw new DownloadError("NOT_FOUND", "This submission is unavailable.", 404);
        }
        case "/cancel":
          return json({
            job: await forOwner(value.owners, (owner) =>
              database(env, () => cancelDownloadJob(owner, z.uuid().parse(value.jobId))),
            ),
          });
        case "/artifact": {
          const artifact = await forOwner(value.owners, (owner) =>
            database(env, () =>
              getArtifactForOwner(owner, z.uuid().parse(value.jobId), z.uuid().parse(value.artifactId)),
            ),
          );
          const remaining = Math.floor((Date.parse(artifact.expiresAt) - Date.now()) / 1000);
          if (remaining < 1) throw new DownloadError("ARTIFACT_EXPIRED", "This download has expired.", 410);
          const location = await signStorageUrl(env, artifact.storageKey, "GET", Math.min(300, remaining));
          return new Response(null, {
            status: 303,
            headers: { Location: location, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
          });
        }
        default:
          return new Response("Not found", { status: 404 });
      }
    } catch (error) {
      return downloadErrorResponse(error);
    }
  },
  async queue(batch: MessageBatch<DownloadMessage>, env: DownloaderEnv): Promise<void> {
    for (const message of batch.messages) {
      const input = messageSchema.safeParse(message.body);
      if (!input.success) {
        message.ack();
        continue;
      }
      const queuedAt = message.timestamp?.getTime();
      if (typeof queuedAt === "number" && Number.isFinite(queuedAt)) {
        console.info(
          JSON.stringify({
            event: "downloader_timing",
            stage: "worker.queue_age",
            durationMs: Math.max(0, Date.now() - queuedAt),
            jobId: input.data.jobId,
          }),
        );
      }
      try {
        const result = await timed(
          "queue_total",
          () => dispatchDownloadJob(input.data, downloadConfiguration(env), runtime(env)),
          { jobId: input.data.jobId },
        );
        if (result.status === "retry") message.retry({ delaySeconds: result.delaySeconds });
        else message.ack();
      } catch {
        message.retry({ delaySeconds: 30 });
        console.warn("downloader_queue_retry");
      }
    }
  },
  async scheduled(_controller: ScheduledController, env: DownloaderEnv): Promise<void> {
    let stale: Awaited<ReturnType<typeof listStaleDownloadAttempts>> = [];
    try {
      stale = await database(env, () => listStaleDownloadAttempts(10));
    } catch {
      console.warn("downloader_recovery_scan_deferred");
    }
    for (const { token } of stale) {
      try {
        if (!(await database(env, () => beginDownloadRecovery(token)))) continue;
        const stopped = await env.DOWNLOAD_CONTAINERS.getByName(token.slotId).recoverExecution({
          jobId: token.jobId,
          attemptGeneration: token.generation,
          slotGeneration: token.slotGeneration,
        });
        await database(env, () =>
          finishDownloadAttempt(token, {
            outcome: "failed",
            stopped: stopped.stopped,
            usage: stopped,
            uncertainUsage: true,
            recovery: true,
            error: {
              code: "EXECUTION_INTERRUPTED",
              message: "Processing was interrupted. Submit the link again.",
              retryable: true,
            },
          }),
        );
      } catch {
        console.warn("downloader_slot_recovery_pending");
      }
    }
    try {
      await database(env, () => expireQueuedDownloadJobs(100));
    } catch {
      console.warn("downloader_queue_expiry_deferred");
    }
    try {
      await dispatchDue(env);
    } catch {
      console.warn("downloader_dispatch_deferred");
    }
    try {
      for (const artifact of await database(env, () => expireDownloadArtifacts(100))) {
        try {
          await env.DOWNLOAD_FILES.delete(artifact.storageKey);
          await database(env, () => markDownloadArtifactDeleted(artifact.artifactId));
        } catch {
          console.warn("downloader_artifact_deletion_deferred");
        }
      }
    } catch {
      console.warn("downloader_artifact_expiry_deferred");
    }
    try {
      await database(env, () => pruneDownloadHistory(100));
    } catch {
      console.warn("downloader_history_cleanup_deferred");
    }
    for (const prefix of ["staging/", "sealed/"]) {
      try {
        const slot = env.DOWNLOAD_CONTAINERS.getByName("download-1");
        const cursor = await slot.cleanupCursor(prefix);
        const listed = await env.DOWNLOAD_FILES.list({ prefix, limit: 500, ...(cursor ? { cursor } : {}) });
        const cutoff = Date.now() - (prefix === "staging/" ? 15 * 60_000 : 25 * 60 * 60_000);
        const expired = listed.objects
          .filter((object) => object.uploaded.getTime() < cutoff)
          .map((object) => object.key);
        if (expired.length) await env.DOWNLOAD_FILES.delete(expired);
        await slot.advanceCleanupCursor(prefix, listed.truncated ? listed.cursor : undefined);
      } catch {
        console.warn("downloader_orphan_cleanup_deferred");
      }
    }
  },
};

export default downloaderWorker;
