import { z } from "zod";
import {
  downloadFormatIdSchema,
  downloadInspectionSchema,
  type DownloadJob,
  type DownloadOwner,
  type DownloadQuality,
  type PlatformId,
} from "@/lib/downloaders/contracts";
import { getPlatformService, parsePlatformUrl } from "@/lib/downloaders/platformRegistry";

const reference = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9_-]+$/);
const ownerSchema = z.object({ kind: z.enum(["guest", "account"]), id: reference });
const failureSchema = z.object({ code: z.string().max(100), message: z.string().max(1000), retryable: z.boolean() });
const date = z.string().datetime({ offset: true });
const jobSchema = z
  .object({
    id: reference,
    requestId: reference,
    platform: z.string(),
    state: z.enum(["queued", "running", "ready", "cancelling", "succeeded", "failed", "cancelled", "expired"]),
    phase: z.string().max(120).nullable(),
    createdAt: date,
    updatedAt: date,
    expiresAt: date.nullable(),
    error: failureSchema.nullable(),
    inspect: z.boolean().optional(),
    inspection: downloadInspectionSchema.nullable().optional(),
    selectedFormat: downloadFormatIdSchema.nullable().optional(),
    artifacts: z
      .array(
        z.object({
          id: reference,
          name: z.string().min(1).max(500),
          mime: z.string().max(100),
          bytes: z.number().int().nonnegative(),
          width: z.number().positive().nullable(),
          height: z.number().positive().nullable(),
          durationSeconds: z.number().nonnegative().nullable(),
          hasAudio: z.boolean(),
        }),
      )
      .max(5),
  })
  .refine((job) => job.state !== "ready" || !!job.inspection, { message: "Ready jobs require inspected formats" });
const savedSchema = z
  .object({
    requestId: reference,
    jobId: reference.optional(),
    formatId: downloadFormatIdSchema.optional(),
    inspect: z.boolean().optional(),
  })
  .refine((saved) => !saved.formatId || !!saved.jobId);
type SavedSubmission = z.infer<typeof savedSchema>;
type RecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export class DownloadClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 0,
    readonly retryable = true,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "DownloadClientError";
  }
}

export type DownloadJobSnapshot = Readonly<{
  owner: DownloadOwner | null;
  job: DownloadJob | null;
  busy: boolean;
  operation: "observe" | "start" | "select" | "cancel" | null;
  pendingFormatId: string | null;
  intent: "inspect" | "download" | null;
  error: DownloadClientError | null;
  recoverable: boolean;
  storageWarning: boolean;
}>;
const INITIAL: DownloadJobSnapshot = {
  owner: null,
  job: null,
  busy: false,
  operation: null,
  pendingFormatId: null,
  intent: null,
  error: null,
  recoverable: false,
  storageWarning: false,
};
export const isActiveDownload = (job: DownloadJob | null) =>
  !!job && ["queued", "running", "cancelling"].includes(job.state);

export function validateDownloadUrl(value: string, platform: PlatformId): string | null {
  const input = value.trim();
  if (!input) return "Paste a public video link to continue.";
  if (input.length > 4096) return "This link is too long. Copy the video's share link instead.";
  let url: URL;
  try {
    url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password) {
      return "Use a public HTTPS video link without login details.";
    }
  } catch {
    return "Enter a complete video link, starting with https://.";
  }
  const service = getPlatformService(platform);
  if (!service) return "This platform is not supported.";
  if (!service.descriptor.hosts.includes(url.hostname)) {
    return `Use a video link from ${service.descriptor.hosts[0]}, or its official share link.`;
  }
  const result = parsePlatformUrl(platform, input);
  if (result.status !== "unsupported") return null;
  return result.code === "unsupported_url"
    ? "This is not a supported video link. Open the video and use Share → Copy link. Profile, channel and playlist links are not supported."
    : result.message;
}

function clientError(error: unknown): DownloadClientError {
  return error instanceof DownloadClientError
    ? error
    : new DownloadClientError(
        "connection",
        "Connection interrupted. Check your connection, then check the download status.",
      );
}

/** One controller per mounted workspace. Navigation aborts observation, never the durable job. */
export function createDownloadJobController({
  platform,
  fetcher = fetch,
  storage,
  requestId = () => crypto.randomUUID(),
}: {
  platform: PlatformId;
  fetcher?: typeof fetch;
  storage?: RecoveryStorage;
  requestId?: () => string;
}) {
  let snapshot = INITIAL;
  let inspectionTiming: { requestId: string; startedAt: number } | undefined;
  let revision = 0;
  let abort: AbortController | null = null;
  let saved: SavedSubmission | null = null;
  let savedOwner: DownloadOwner | null = null;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<DownloadJobSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };
  const key = (owner: DownloadOwner) => `canopy:downloads:v1:${platform}:${owner.kind}:${owner.id}`;
  const guestReferenceKey = `canopy:downloads:v1:${platform}:guest-reference`;
  const persist = () => {
    const owner = savedOwner ?? snapshot.owner;
    if (!owner) return;
    try {
      if (!storage) {
        publish({ storageWarning: true });
        return;
      }
      if (saved) {
        storage.setItem(key(owner), JSON.stringify(saved));
        if (owner.kind === "guest") storage.setItem(guestReferenceKey, owner.id);
      } else {
        storage.removeItem(key(owner));
        if (owner.kind === "guest" && storage.getItem(guestReferenceKey) === owner.id) {
          storage.removeItem(guestReferenceKey);
        }
      }
    } catch {
      publish({ storageWarning: true });
    }
  };
  const current = (version: number) => revision === version && !abort?.signal.aborted;
  const begin = (operation: NonNullable<DownloadJobSnapshot["operation"]>) => {
    abort?.abort();
    abort = new AbortController();
    publish({ busy: true, operation, error: null });
    return ++revision;
  };
  const finish = (version: number) => {
    if (current(version)) {
      publish({ busy: false, operation: null });
    }
  };
  const request = async (url: string, signal: AbortSignal, body?: unknown): Promise<unknown> => {
    const startedAt = performance.now();
    let status: number | undefined;
    try {
      const response = await fetcher(url, {
        method: body === undefined ? "GET" : "POST",
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
        ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      });
      status = response.status;
      let value: unknown;
      try {
        value = await response.json();
      } catch {
        throw new DownloadClientError(
          "invalid-response",
          "The download service returned an unreadable response. Check status before trying again.",
          response.status,
        );
      }
      if (!response.ok) {
        const parsed = z.object({ error: failureSchema }).safeParse(value);
        const retry = response.headers.get("Retry-After");
        const retrySeconds =
          retry && /^\d+$/.test(retry)
            ? Number(retry)
            : retry
              ? Math.max(0, Math.ceil((Date.parse(retry) - Date.now()) / 1000))
              : null;
        throw new DownloadClientError(
          parsed.success ? parsed.data.error.code : "service-error",
          parsed.success
            ? parsed.data.error.message
            : "The download service could not complete this request. Try again shortly.",
          response.status,
          parsed.success ? parsed.data.error.retryable : response.status >= 500,
          retrySeconds !== null && Number.isFinite(retrySeconds) ? retrySeconds : null,
        );
      }
      return value;
    } finally {
      if (process.env.NODE_ENV === "development")
        console.info(
          JSON.stringify({
            event: "downloader_timing",
            stage: "browser.request",
            action: url.endsWith("/guest") ? "identity" : body === undefined ? "status" : snapshot.operation,
            requestId: saved?.requestId,
            jobId: saved?.jobId,
            status,
            durationMs: Math.round(performance.now() - startedAt),
          }),
        );
    }
  };
  const readJob = (value: unknown): DownloadJob => {
    const result = z.object({ job: jobSchema }).safeParse(value);
    if (!result.success || result.data.job.platform !== platform)
      throw new DownloadClientError(
        "invalid-response",
        "The download service returned an unexpected result. Check its status again.",
      );
    return { ...result.data.job, platform };
  };
  const establishOwner = async (version: number, signal: AbortSignal) => {
    const result = z.object({ owner: ownerSchema }).safeParse(await request("/api/downloads/guest", signal, {}));
    if (!result.success)
      throw new DownloadClientError("invalid-response", "Your download session could not be verified. Try again.");
    if (!current(version)) return false;
    const owner = result.data.owner;
    if (!snapshot.owner || key(owner) !== key(snapshot.owner)) {
      // Old account references are not carried into a new owner's workspace.
      if (snapshot.owner?.kind === "account") {
        try {
          storage?.removeItem(key(snapshot.owner));
        } catch {
          /* Best effort; references grant no access. */
        }
      }
      const previousGuest = savedOwner?.kind === "guest" ? { owner: savedOwner, saved } : null;
      saved = null;
      savedOwner = owner;
      try {
        const raw = storage?.getItem(key(owner));
        if (raw) {
          const parsed = savedSchema.safeParse(JSON.parse(raw));
          if (parsed.success) saved = parsed.data;
        }
        // A guest cookie still authorizes its jobs after sign-in. The pointer contains
        // no result data; resume must obtain an authorized server response first.
        if (!saved && owner.kind === "account") {
          const guestId = reference.safeParse(storage?.getItem(guestReferenceKey));
          if (guestId.success) {
            const guestOwner: DownloadOwner = { kind: "guest", id: guestId.data };
            const guestRaw = storage?.getItem(key(guestOwner));
            const parsed = savedSchema.safeParse(guestRaw ? JSON.parse(guestRaw) : null);
            if (parsed.success) {
              saved = parsed.data;
              savedOwner = guestOwner;
            }
          } else if (previousGuest?.saved) {
            saved = previousGuest.saved;
            savedOwner = previousGuest.owner;
          }
        }
      } catch {
        publish({ storageWarning: true });
      }
      const intent = saved
        ? saved.inspect && !saved.formatId
          ? "inspect"
          : "download"
        : snapshot.operation === "start"
          ? snapshot.intent
          : null;
      publish({ owner, job: null, pendingFormatId: saved?.formatId ?? null, intent, recoverable: !!saved });
    }
    return true;
  };
  const accept = (job: DownloadJob) => {
    if (inspectionTiming?.requestId === job.requestId && !isActiveDownload(job)) {
      if (process.env.NODE_ENV === "development")
        console.info(
          JSON.stringify({
            event: "downloader_timing",
            stage: "browser.inspection_total",
            jobId: job.id,
            requestId: job.requestId,
            state: job.state,
            durationMs: Math.round(performance.now() - inspectionTiming.startedAt),
          }),
        );
      inspectionTiming = undefined;
    }
    const formatId = job.state === "ready" ? saved?.formatId : undefined;
    // The server's selected format takes priority over the original inspection
    // flag. Stored intent covers lost create responses; a phase alone cannot.
    const inspect =
      !job.selectedFormat &&
      !formatId &&
      (job.inspect === true || job.state === "ready" || (job.inspect === undefined && saved?.inspect === true));
    saved = {
      requestId: job.requestId,
      jobId: job.id,
      ...(formatId ? { formatId } : {}),
      ...(inspect ? { inspect: true } : {}),
    };
    persist();
    publish({
      job,
      pendingFormatId: formatId ?? null,
      intent: inspect ? "inspect" : "download",
      recoverable: false,
      error: null,
    });
  };
  const fail = (error: unknown, version: number, preserveSubmission = false) => {
    if (!current(version)) return;
    const issue = clientError(error);
    if (!preserveSubmission && [401, 403, 404, 410].includes(issue.status)) {
      saved = null;
      persist();
      publish({ job: null, pendingFormatId: null, intent: null, recoverable: false });
    }
    publish({ error: issue });
  };
  const resume = async () => {
    if (snapshot.operation) return;
    const version = begin("observe");
    const signal = abort!.signal;
    let pendingSubmission = false;
    try {
      if (!(await establishOwner(version, signal)) || !saved) return;
      pendingSubmission = !saved.jobId;
      const ref = saved;
      const value = await request(
        ref.jobId
          ? `/api/downloads/jobs/${encodeURIComponent(ref.jobId)}`
          : `/api/downloads/submissions/${encodeURIComponent(ref.requestId)}`,
        signal,
      );
      if (current(version)) {
        const job = readJob(value);
        if (job.requestId !== ref.requestId || (ref.jobId && job.id !== ref.jobId))
          throw new DownloadClientError(
            "invalid-response",
            "The download reference did not match. Check status again.",
          );
        accept(job);
      }
    } catch (error) {
      if (current(version) && pendingSubmission && error instanceof DownloadClientError && error.status === 404) {
        const sameOwner = savedOwner && snapshot.owner && key(savedOwner) === key(snapshot.owner);
        // A lookup can race the original POST. Keep its idempotency key even when
        // it is not visible yet; a different owner must never resubmit that key.
        publish({
          job: null,
          recoverable: !sameOwner,
          error: new DownloadClientError(
            "submission-unconfirmed",
            sameOwner
              ? "The submission was not found yet. Check status again or retry the link using the original request."
              : "The guest submission was not found yet. Check status again, or return to the original guest session before retrying.",
            404,
            false,
          ),
        });
      } else {
        fail(error, version);
      }
    } finally {
      finish(version);
    }
  };
  const create = async (url: string, quality: DownloadQuality, inspect = false) => {
    if (snapshot.operation || isActiveDownload(snapshot.job) || snapshot.recoverable || snapshot.pendingFormatId)
      return;
    const validation = validateDownloadUrl(url, platform);
    if (validation) {
      publish({ error: new DownloadClientError("invalid-url", validation, 400, false) });
      return;
    }
    const version = begin("start");
    const startedAt = performance.now();
    inspectionTiming = undefined;
    publish({ intent: inspect ? "inspect" : "download" });
    const signal = abort!.signal;
    let submitted = false;
    let retriedPending = false;
    const previousOwner = snapshot.owner;
    try {
      if (!(await establishOwner(version, signal))) return;
      if (previousOwner && snapshot.owner && key(previousOwner) !== key(snapshot.owner)) {
        publish({
          error: new DownloadClientError(
            "session-changed",
            "Your download session changed. Review the video link and try again.",
            401,
            false,
          ),
        });
        return;
      }
      const retryPending =
        saved &&
        !saved.jobId &&
        !snapshot.recoverable &&
        savedOwner &&
        snapshot.owner &&
        key(savedOwner) === key(snapshot.owner);
      // A stored request must be recovered before admitting another attempt.
      if (saved && !snapshot.job && !retryPending) {
        publish({ recoverable: true });
        return;
      }
      retriedPending = !!retryPending;
      const id = retryPending ? saved!.requestId : requestId();
      const requestInspect = retryPending ? saved!.inspect === true : inspect;
      saved = { requestId: id, ...(requestInspect ? { inspect: true } : {}) };
      savedOwner = snapshot.owner;
      persist();
      publish({ job: null, intent: requestInspect ? "inspect" : "download", recoverable: true });
      if (requestInspect) inspectionTiming = { requestId: id, startedAt };
      submitted = true;
      const value = await request("/api/downloads/jobs", signal, {
        platform,
        url: url.trim(),
        quality,
        requestId: id,
        ...(requestInspect ? { inspect: true } : {}),
      });
      if (current(version)) {
        const job = readJob(value);
        if (job.requestId !== id)
          throw new DownloadClientError(
            "invalid-response",
            "The download reference did not match. Check status before retrying.",
          );
        accept(job);
      }
    } catch (error) {
      if (
        current(version) &&
        submitted &&
        !retriedPending &&
        error instanceof DownloadClientError &&
        ((error.status >= 400 && error.status < 500 && error.status !== 409) ||
          // This specific response guarantees the create was never forwarded.
          // Other 5xx responses can follow admission and must retain recovery.
          (error.status === 503 && error.code === "DOWNLOADS_NOT_CONFIGURED" && !error.retryable))
      ) {
        saved = null;
        persist();
        publish({ recoverable: false });
      }
      fail(error, version, retriedPending);
    } finally {
      finish(version);
    }
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    resume,
    start: (url: string, quality: DownloadQuality) => create(url, quality),
    inspect: (url: string) => create(url, "1080", true),
    async selectFormat(formatId: string) {
      const initial = snapshot.job;
      if (snapshot.operation || snapshot.recoverable || initial?.state !== "ready") return;
      if (!initial.inspection?.formats.some((format) => format.id === formatId)) {
        publish({
          error: new DownloadClientError("invalid-format", "Choose an available format from this video.", 400, false),
        });
        return;
      }
      if (snapshot.pendingFormatId && snapshot.pendingFormatId !== formatId) {
        publish({
          error: new DownloadClientError(
            "selection-unconfirmed",
            "Retry the previous format or check its status before choosing another.",
            409,
            false,
          ),
        });
        return;
      }
      if (initial.expiresAt && Date.parse(initial.expiresAt) <= Date.now()) {
        publish({
          error: new DownloadClientError(
            "inspection-expired",
            "These formats have expired. Check the video link again.",
            410,
            false,
          ),
        });
        return;
      }
      publish({ intent: "download" });
      const version = begin("select");
      const signal = abort!.signal;
      const retriedPending = !!snapshot.pendingFormatId;
      let submitted = false;
      try {
        if (!(await establishOwner(version, signal)) || snapshot.job?.id !== initial.id) return;
        saved = { requestId: initial.requestId, jobId: initial.id, formatId };
        persist();
        publish({ pendingFormatId: formatId });
        submitted = true;
        const value = await request(`/api/downloads/jobs/${encodeURIComponent(initial.id)}/select`, signal, {
          formatId,
        });
        if (current(version)) {
          const job = readJob(value);
          if (
            job.id !== initial.id ||
            job.requestId !== initial.requestId ||
            (job.selectedFormat && job.selectedFormat !== formatId)
          )
            throw new DownloadClientError(
              "invalid-response",
              "The format selection could not be confirmed. Check its status again.",
            );
          accept(job);
        }
      } catch (error) {
        if (current(version) && submitted) {
          const issue = clientError(error);
          const definitive = !retriedPending && issue.status >= 400 && issue.status < 500 && issue.status !== 409;
          if (definitive) {
            saved = { requestId: initial.requestId, jobId: initial.id, inspect: true };
            persist();
            publish({ pendingFormatId: null, intent: "inspect", recoverable: false });
          } else {
            publish({ recoverable: true });
          }
        }
        fail(error, version);
      } finally {
        finish(version);
      }
    },
    async cancel() {
      if (
        (snapshot.operation && snapshot.operation !== "observe") ||
        !isActiveDownload(snapshot.job) ||
        snapshot.job?.state === "cancelling"
      )
        return;
      const jobId = snapshot.job!.id;
      const submissionId = snapshot.job!.requestId;
      const version = begin("cancel");
      const signal = abort!.signal;
      try {
        if (!(await establishOwner(version, signal)) || snapshot.job?.id !== jobId) return;
        const value = await request(`/api/downloads/jobs/${encodeURIComponent(jobId)}/cancel`, signal, {});
        if (current(version)) {
          const job = readJob(value);
          if (job.id !== jobId || job.requestId !== submissionId)
            throw new DownloadClientError(
              "invalid-response",
              "Cancellation could not be confirmed. Check the download status.",
            );
          accept(job);
        }
      } catch (error) {
        fail(error, version);
      } finally {
        finish(version);
      }
    },
    reset() {
      if (snapshot.operation || isActiveDownload(snapshot.job) || snapshot.recoverable || snapshot.pendingFormatId)
        return;
      // Resetting the form must not create a new admission identity while an
      // earlier POST could still commit. Its reference can be reused on retry.
      if (saved?.jobId) {
        saved = null;
        persist();
      }
      inspectionTiming = undefined;
      publish({ job: null, pendingFormatId: null, intent: null, error: null });
    },
    stop(clearPrivate = false) {
      inspectionTiming = undefined;
      revision += 1;
      abort?.abort();
      abort = null;
      publish({
        busy: false,
        operation: null,
        ...(clearPrivate ? { job: null, pendingFormatId: null, recoverable: !!saved } : {}),
      });
    },
  };
}

export function downloadArtifactPath(jobId: string, artifactId: string): string {
  return `/api/downloads/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(artifactId)}/download`;
}
