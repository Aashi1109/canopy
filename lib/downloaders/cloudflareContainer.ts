import { Container, type OutboundHandler } from "@cloudflare/containers";
import { matchesEgressHost, type DownloadSettingsEnv } from "./config";
import { containerStatusSchema, type AttemptIdentity, type ContainerStart, type ContainerStatus } from "./execution";
import { readDownloadJson, signCapability } from "./security";
import { handleLocalStorageRequest, LOCAL_STORAGE_ORIGIN, type LocalStorageEnv } from "./localStorage";

export { ContainerProxy } from "@cloudflare/containers";
type ContainerEnv = DownloadSettingsEnv &
  LocalStorageEnv & { DOWNLOAD_CONTAINERS: DurableObjectNamespace<DownloaderContainer> };
type ActiveExecution = {
  identity: AttemptIdentity;
  deadline: number;
  startedAt: number;
  sourceBytes: number;
  sourceLimit: number;
  transferBytes: number;
  requests: number;
  hosts: string[];
  staging: { putUrl: string; getUrl: string }[];
  stopped: boolean;
  stoppedAt?: number;
  budgetExceeded: boolean;
};
type RecoveryFence = {
  identity: Omit<AttemptIdentity, "startOrdinal">;
  recovering: boolean;
  sourceBytes: number;
  workMs: number;
};
const sameAttempt = (a: RecoveryFence["identity"], b: RecoveryFence["identity"]) =>
  a.jobId === b.jobId && a.attemptGeneration === b.attemptGeneration && a.slotGeneration === b.slotGeneration;
const measuredWork = (active: ActiveExecution) => Math.max(0, (active.stoppedAt ?? Date.now()) - active.startedAt);
function timing(stage: string, durationMs: number, jobId?: string, count?: number) {
  console.info(
    JSON.stringify({
      event: "downloader_timing",
      stage: `container.${stage}`,
      durationMs: Math.round(Math.max(0, durationMs)),
      jobId,
      ...(count === undefined ? {} : { count }),
    }),
  );
}

/** One named Durable Object is one native slot; its short storage operations fence outbound work. */
export class DownloaderContainer extends Container<ContainerEnv> {
  defaultPort = 8080;
  sleepAfter = "10m";
  enableInternet = false;
  interceptHttps = true;
  deniedHosts = ["localhost", "*.localhost", "169.254.169.254", "metadata.google.internal"];
  private startupJobId?: string;
  private statusTiming?: { jobId: string; durationMs: number; count: number };

  constructor(ctx: DurableObjectState<{}>, env: ContainerEnv) {
    super(ctx, env);
    this.envVars = {
      DOWNLOADERS_CONTROL_SECRET: env.DOWNLOADERS_CONTROL_SECRET ?? "",
      DOWNLOADERS_LOCAL: env.DOWNLOADERS_LOCAL ?? "",
    };
  }
  override async fetch(): Promise<Response> {
    return new Response("Not found", { status: 404 });
  }
  override async startAndWaitForPorts(
    ...args: Parameters<Container<ContainerEnv>["startAndWaitForPorts"]>
  ): Promise<void> {
    const started = performance.now();
    try {
      await super.startAndWaitForPorts(...args);
    } finally {
      timing("startup", performance.now() - started, this.startupJobId);
    }
  }

  async cleanupCursor(prefix: string): Promise<string | undefined> {
    return this.ctx.storage.get(`cleanup:${prefix}`);
  }
  async advanceCleanupCursor(prefix: string, cursor?: string): Promise<void> {
    if (cursor) await this.ctx.storage.put(`cleanup:${prefix}`, cursor);
    else await this.ctx.storage.delete(`cleanup:${prefix}`);
  }

  private lifecycleGuard<T>(operation: () => Promise<T>): Promise<T> {
    return this.ctx.blockConcurrencyWhile(async () => {
      // Evict the object instead of releasing this guard while a start/destroy
      // may still be in flight. Durable fences survive the eviction.
      const timeout = setTimeout(() => this.ctx.abort("Downloader lifecycle timed out."), 25_000);
      try {
        return await operation();
      } finally {
        clearTimeout(timeout);
      }
    });
  }

  async startExecution(input: ContainerStart, hosts: string[]): Promise<ContainerStatus> {
    // Keep startup inside the same concurrency gate as recovery: an in-flight
    // cold start must finish (or abort) before destruction can prove quiescence.
    const started = performance.now();
    try {
      return await this.lifecycleGuard(async () => {
        const fence = await this.ctx.storage.get<RecoveryFence>("recovery");
        if (fence && (fence.recovering || input.slotGeneration <= fence.identity.slotGeneration))
          throw new Error("Slot is recovering or fenced.");
        const old = await this.ctx.storage.get<ActiveExecution>("execution");
        if (
          old &&
          !sameAttempt(old.identity, input) &&
          (!old.stopped || input.slotGeneration <= old.identity.slotGeneration)
        )
          throw new Error("Slot is occupied.");
        if (old && sameAttempt(old.identity, input)) {
          if (
            input.startOrdinal < old.identity.startOrdinal ||
            input.startOrdinal > old.identity.startOrdinal + 1 ||
            (input.startOrdinal !== old.identity.startOrdinal && !old.stopped)
          )
            throw new Error("Stale execution ordinal.");
          if (input.startOrdinal === old.identity.startOrdinal) return this.control("status", input);
          if (old.budgetExceeded || old.sourceBytes >= old.sourceLimit || old.deadline <= Date.now())
            throw new Error("Execution budget exhausted.");
        }
        const continuing = old && sameAttempt(old.identity, input);
        const deadline = continuing ? Math.min(old.deadline, Date.parse(input.deadline)) : Date.parse(input.deadline);
        if (
          !Number.isFinite(deadline) ||
          deadline <= Date.now() ||
          !Number.isSafeInteger(input.limits.sourceBytes) ||
          input.limits.sourceBytes <= 0
        )
          throw new Error("Invalid execution budget.");
        await this.ctx.storage.put<ActiveExecution>("execution", {
          identity: {
            jobId: input.jobId,
            attemptGeneration: input.attemptGeneration,
            slotGeneration: input.slotGeneration,
            startOrdinal: input.startOrdinal,
          },
          deadline,
          startedAt: continuing ? old.startedAt : Date.now(),
          sourceBytes: continuing ? old.sourceBytes : 0,
          sourceLimit: continuing
            ? Math.min(old.sourceLimit, old.sourceBytes + input.limits.sourceBytes)
            : input.limits.sourceBytes,
          transferBytes: continuing ? old.transferBytes : 0,
          requests: continuing ? old.requests : 0,
          hosts,
          staging: input.stagingArtifacts.map(({ putUrl, getUrl }) => ({ putUrl, getUrl })),
          stopped: false,
          budgetExceeded: false,
        });
        return this.control("start", input);
      });
    } finally {
      timing("start_total", performance.now() - started, input.jobId);
    }
  }
  async statusExecution(identity: AttemptIdentity): Promise<ContainerStatus> {
    return this.control("status", identity);
  }
  async cancelExecution(identity: AttemptIdentity): Promise<ContainerStatus> {
    return this.control("cancel", identity);
  }

  private async control(
    operation: "start" | "status" | "cancel",
    value: AttemptIdentity | ContainerStart,
  ): Promise<ContainerStatus> {
    const started = performance.now();
    let finished = false;
    let failed = true;
    if (operation === "start") this.startupJobId = value.jobId;
    try {
      const active = await this.ctx.storage.get<ActiveExecution>("execution");
      if (!active || !sameAttempt(active.identity, value) || active.identity.startOrdinal !== value.startOrdinal)
        throw new Error("Stale execution.");
      const fence = await this.ctx.storage.get<RecoveryFence>("recovery");
      if (fence && (fence.recovering || value.slotGeneration <= fence.identity.slotGeneration))
        throw new Error("Execution is fenced.");
      const timeoutMs = operation === "cancel" ? 20_000 : Math.min(15_000, active.deadline - Date.now());
      if (timeoutMs <= 0) throw new Error("Execution deadline exceeded.");
      const token = signCapability(
        { ...active.identity, operation, expiresAt: Math.floor(Date.now() / 1000) + 60 },
        this.env.DOWNLOADERS_CONTROL_SECRET ?? "",
      );
      const url = new URL(`http://container/${operation}`);
      const identity = active.identity;
      if (operation === "status")
        for (const [key, val] of Object.entries(identity)) url.searchParams.set(key, String(val));
      const request = new Request(url, {
        method: operation === "status" ? "GET" : "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(operation === "status" ? {} : { body: JSON.stringify(value) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      // Polling and cancellation must never recreate a stopped container.
      if (operation !== "start" && !this.ctx.container?.running) throw new Error("Container is not running.");
      if (operation !== "start") this.renewActivityTimeout();
      const response =
        operation === "start"
          ? await this.containerFetch(request)
          : await this.ctx.container!.getTcpPort(this.defaultPort).fetch(request);
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("Container control failed.");
      }
      const status = containerStatusSchema.parse(
        await readDownloadJson(
          new Request("https://container.internal/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: response.body,
            duplex: "half",
          } as RequestInit),
          65_536,
        ),
      );
      if (status.state === "running" && status.stopped) throw new Error("Invalid execution stop proof.");
      const result = await this.ctx.storage.transaction(async (transaction) => {
        const current = await transaction.get<ActiveExecution>("execution");
        const recovery = await transaction.get<RecoveryFence>("recovery");
        if (recovery && (recovery.recovering || identity.slotGeneration <= recovery.identity.slotGeneration))
          throw new Error("Execution response is fenced.");
        if (
          !current ||
          !sameAttempt(current.identity, identity) ||
          current.identity.startOrdinal !== identity.startOrdinal
        )
          throw new Error("Stale execution response.");
        if (status.stopped) {
          current.stopped = true;
          current.stoppedAt ??= Date.now();
          await transaction.put("execution", current);
        }
        return { ...status, usage: { sourceBytes: current.sourceBytes, workMs: measuredWork(current) } };
      });
      finished = result.stopped;
      failed = false;
      return result;
    } finally {
      const durationMs = Math.max(0, performance.now() - started);
      if (operation === "status") {
        if (this.statusTiming && this.statusTiming.jobId !== value.jobId) {
          timing("control_status", this.statusTiming.durationMs, this.statusTiming.jobId, this.statusTiming.count);
          this.statusTiming = undefined;
        }
        this.statusTiming ??= { jobId: value.jobId, durationMs: 0, count: 0 };
        this.statusTiming.durationMs += durationMs;
        this.statusTiming.count += 1;
      } else {
        timing(`control_${operation}`, durationMs, value.jobId);
      }
      if ((finished || failed) && this.statusTiming?.jobId === value.jobId) {
        timing("control_status", this.statusTiming.durationMs, value.jobId, this.statusTiming.count);
        this.statusTiming = undefined;
      }
      if (operation === "start") this.startupJobId = undefined;
    }
  }
  async recoverExecution(
    identity: Omit<AttemptIdentity, "startOrdinal">,
  ): Promise<{ stopped: boolean; sourceBytes: number; workMs: number }> {
    return this.lifecycleGuard(async () => {
      const current = await this.ctx.storage.get<ActiveExecution>("execution");
      const prior = await this.ctx.storage.get<RecoveryFence>("recovery");
      if (
        (current && !sameAttempt(current.identity, identity)) ||
        (prior &&
          (identity.slotGeneration < prior.identity.slotGeneration ||
            (prior.recovering && !sameAttempt(prior.identity, identity))))
      )
        return { stopped: false, sourceBytes: 0, workMs: 0 };
      if (prior && !prior.recovering && sameAttempt(prior.identity, identity))
        return { stopped: true, sourceBytes: prior.sourceBytes, workMs: prior.workMs };
      const fence: RecoveryFence = {
        identity,
        recovering: true,
        sourceBytes: current?.sourceBytes ?? 0,
        workMs: current ? measuredWork(current) : 0,
      };
      // Persist before I/O. A failed destroy or Durable Object restart must keep
      // both starts and outbound transfers blocked until recovery is retried.
      await this.ctx.storage.put("recovery", fence);
      await this.destroy();
      const state = await this.getState();
      const stopped = state.status === "stopped" || state.status === "stopped_with_code";
      if (current && stopped) {
        current.stopped = true;
        current.stoppedAt ??= Date.now();
        await this.ctx.storage.put("execution", current);
      }
      fence.recovering = !stopped;
      fence.workMs = current ? measuredWork(current) : 0;
      await this.ctx.storage.put("recovery", fence);
      return { stopped, sourceBytes: fence.sourceBytes, workMs: fence.workMs };
    });
  }
  async authorizeOutbound(
    url: string,
    method: string,
  ): Promise<{ identity: AttemptIdentity; storage: boolean; timeoutMs: number } | null> {
    return this.ctx.storage.transaction(async (transaction) => {
      const active = await transaction.get<ActiveExecution>("execution");
      const recovery = await transaction.get<RecoveryFence>("recovery");
      if (
        recovery?.recovering ||
        !active ||
        active.stopped ||
        active.budgetExceeded ||
        active.deadline <= Date.now() ||
        active.requests >= 2000
      )
        return null;
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.hash) return null;
      const storage = active.staging.some(
        (entry) => (method === "PUT" && url === entry.putUrl) || (method === "GET" && url === entry.getUrl),
      );
      if (!storage && (!["GET", "HEAD", "POST"].includes(method) || !matchesEgressHost(parsed.hostname, active.hosts)))
        return null;
      active.requests++;
      await transaction.put("execution", active);
      return { identity: active.identity, storage, timeoutMs: Math.max(1, active.deadline - Date.now()) };
    });
  }
  async debitOutbound(identity: AttemptIdentity, bytes: number, storage: boolean): Promise<boolean> {
    if (!Number.isSafeInteger(bytes) || bytes < 0) return false;
    return this.ctx.storage.transaction(async (transaction) => {
      const active = await transaction.get<ActiveExecution>("execution");
      const recovery = await transaction.get<RecoveryFence>("recovery");
      if (
        recovery?.recovering ||
        !active ||
        active.stopped ||
        active.budgetExceeded ||
        !sameAttempt(active.identity, identity) ||
        active.identity.startOrdinal !== identity.startOrdinal ||
        active.deadline <= Date.now()
      )
        return false;
      if (storage) active.transferBytes += bytes;
      else active.sourceBytes += bytes;
      const allowed = active.sourceBytes <= active.sourceLimit && active.transferBytes <= 2 * 1024 ** 3;
      if (!allowed) {
        active.budgetExceeded = true;
        active.deadline = Math.min(active.deadline, Date.now());
      }
      await transaction.put("execution", active);
      return allowed;
    });
  }
}

DownloaderContainer.outbound = (async (request, env, context) => {
  // Readiness runs during cold start, before the lifecycle guard can admit slot RPCs.
  // Only this fixed response bypasses job accounting; file transfers below require a permit.
  if (
    env.DOWNLOADERS_LOCAL === "true" &&
    request.method === "GET" &&
    request.url === `${LOCAL_STORAGE_ORIGIN}/__download-storage/health`
  )
    return (await handleLocalStorageRequest(request, env))!;
  const slot = env.DOWNLOAD_CONTAINERS.get(env.DOWNLOAD_CONTAINERS.idFromString(context.containerId));
  const permit = await slot.authorizeOutbound(request.url, request.method);
  if (!permit) {
    if (env.DOWNLOADERS_LOCAL === "true") console.warn("downloader_local_egress_denied", new URL(request.url).hostname);
    return new Response("Outbound request denied", { status: 403 });
  }
  const { identity, storage } = permit;
  const bounded = (stream: ReadableStream<Uint8Array> | null) => {
    if (!stream) return null;
    const reader = stream.getReader();
    let pending: Uint8Array | undefined;
    let offset = 0;
    let unmeteredBytes = 0;
    let ended = false;
    let cancelled = false;
    async function cancelReader(reason: unknown) {
      pending = undefined;
      try {
        await reader.cancel(reason);
      } finally {
        // An early cancellation/error can leave already-read bytes in a partial
        // batch or oversized chunk. Account for them without forwarding them.
        const bytes = unmeteredBytes;
        unmeteredBytes = 0;
        if (bytes) await slot.debitOutbound(identity, bytes, storage);
      }
    }
    return new ReadableStream<Uint8Array>(
      {
        async pull(controller) {
          try {
            // One bounded batch per consumer pull; keep only a view/offset into
            // an oversized upstream chunk instead of copying its remainder.
            const batch = new Uint8Array(256 * 1024);
            let length = 0;
            while (length < batch.byteLength && !ended) {
              if (!pending) {
                const next = await reader.read();
                if (!next.done) unmeteredBytes += next.value.byteLength;
                if (cancelled) return;
                if (next.done) {
                  ended = true;
                  break;
                }
                pending = next.value;
                offset = 0;
              }
              const count = Math.min(batch.byteLength - length, pending.byteLength - offset);
              batch.set(pending.subarray(offset, offset + count), length);
              offset += count;
              length += count;
              if (offset === pending.byteLength) pending = undefined;
            }
            if (length) {
              // Clear before awaiting so cancellation never debits this batch twice.
              unmeteredBytes -= length;
              if (!(await slot.debitOutbound(identity, length, storage))) {
                throw new Error("Transfer budget exceeded");
              }
              if (cancelled) return;
              controller.enqueue(batch.subarray(0, length));
            }
            if (ended) controller.close();
          } catch (error) {
            try {
              await cancelReader(error);
            } catch {
              /* Preserve the original transfer failure. */
            }
            if (!cancelled) controller.error(error);
          }
        },
        cancel(reason) {
          cancelled = true;
          return cancelReader(reason);
        },
      },
      { highWaterMark: 0 },
    );
  };
  const options = {
    method: request.method,
    headers: request.headers,
    body: bounded(request.body),
    redirect: "manual" as const,
    signal: AbortSignal.timeout(permit.timeoutMs),
    ...(request.body ? { duplex: "half" } : {}),
  };
  const local =
    storage && env.DOWNLOADERS_LOCAL === "true"
      ? await handleLocalStorageRequest(new Request(request.url, options), env)
      : null;
  const upstream = local ?? (await fetch(request.url, options));
  return new Response(bounded(upstream.body), { status: upstream.status, headers: upstream.headers });
}) satisfies OutboundHandler<ContainerEnv>;

// Register the synthetic name explicitly so local container DNS routes it to the interceptor.
DownloaderContainer.outboundByHost = { "download-storage.local": DownloaderContainer.outbound };
