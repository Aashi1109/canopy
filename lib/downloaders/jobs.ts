import { createHash } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import { sqlClient } from "../../db/runtime.ts";
import { readLockedDownloadPolicy, validateDownloadPolicyInput, withDownloadTransaction } from "./policy.ts";
import { getPlatformService, parsePlatformUrl } from "./platformRegistry.ts";
import {
  DownloadError,
  downloadFormatIdSchema,
  downloadInspectionSchema,
  type CreateDownload,
  type DownloadArtifact,
  type DownloadFormat,
  type DownloadFailure,
  type DownloadJob,
  type DownloadInspection,
  type DownloadOwner,
  type DownloadState,
  type PlatformId,
} from "./contracts.ts";

export type DownloadRuntimeLimits = Readonly<{
  enabled: boolean;
  enabledPlatforms: readonly string[];
  globalDailyJobs: number;
  networkDailyJobs: number;
  globalQueued: number;
  platformActive: number;
  platformStartsPerMinute: number;
  globalDailyBytes: number;
  globalMonthlyBytes: number;
  globalDailyCostMicros: number;
  jobSourceBytes: number;
  jobCostMicros: number;
  maxWorkMs: number;
  maxEngineStarts: number;
  maxQueueAgeMs: number;
  retentionMs: number;
  leaseMs: number;
}>;
export type DownloadAttemptToken = Readonly<{
  jobId: string;
  attemptId: string;
  generation: number;
  slotId: string;
  slotGeneration: number;
}>;
export type DownloadClaim =
  | {
      status: "claimed";
      token: DownloadAttemptToken;
      input: CreateDownload;
      owner: DownloadOwner;
      deadline: string;
      remaining: { workMs: number; sourceBytes: number; engineStarts: number };
    }
  | { status: "terminal" | "stale" | "busy" | "deferred"; retryAfterSeconds?: number };
export type SealedDownloadArtifact = Readonly<{
  id: string;
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  etag: string;
  metadata?: Record<string, unknown>;
}>;
export type DownloadUsage = Readonly<{ workMs: number; sourceBytes: number; costMicros?: number }>;
type DownloadAdmissionOptions = { networkHash: string; limits: DownloadRuntimeLimits };
type PreparedInspection = { value: DownloadInspection; expiresAt: Date };
type Budget = {
  workMs: number;
  sourceBytes: number;
  engineStarts: number;
  costMicros: number;
  retentionMs: number;
  leaseMs: number;
};
type JobRow = QueryResultRow & {
  id: string;
  owner_kind: DownloadOwner["kind"];
  owner_id: string;
  request_id: string;
  input_hash: string;
  platform: PlatformId;
  source_url: string | null;
  quality: CreateDownload["quality"];
  inspect: boolean;
  inspection: unknown;
  selected_format: string | null;
  network_hash: string;
  state: DownloadState;
  phase: string | null;
  generation: number;
  dispatch_version: number;
  next_eligible_at: Date;
  queue_expires_at: Date;
  admission_day: string;
  admission_month: string;
  budget: Budget;
  work_ms: string;
  source_bytes: string;
  cost_micros: string;
  engine_starts: number;
  created_at: Date;
  updated_at: Date;
  expires_at: Date | null;
  error: DownloadFailure | null;
};
type AttemptRow = QueryResultRow & {
  id: string;
  job_id: string;
  generation: number;
  slot_id: string;
  slot_generation: number;
  deadline: Date;
  heartbeat_at: Date;
  stopped_at: Date | null;
  work_ms: string;
  source_bytes: string;
  cost_micros: string;
  phase: string;
};
type SlotRow = QueryResultRow & {
  id: string;
  generation: number;
  state: "idle" | "busy" | "quarantined" | "draining";
  attempt_id: string | null;
  lease_expires_at: Date | null;
};
type ArtifactRow = QueryResultRow & {
  id: string;
  storage_key: string;
  filename: string;
  mime_type: string;
  size_bytes: string;
  etag: string;
  metadata: Record<string, unknown>;
  expires_at: Date;
  deleted_at: Date | null;
};
type Bucket = {
  scope: string;
  period: string;
  admitted: number;
  queued: number;
  active: number;
  reserved_bytes: string;
  reserved_cost_micros: string;
};
type BucketKey = { scope: string; period: string };
const terminal = new Set<DownloadState>(["succeeded", "failed", "cancelled", "expired"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const phases = new Set([
  "starting",
  "extracting",
  "inspecting",
  "downloading",
  "validating",
  "uploading",
  "promoting",
  "stopping",
  "recovering",
  "processing",
]);

function validateOwner(owner: DownloadOwner): void {
  if (
    !owner ||
    !["guest", "account"].includes(owner.kind) ||
    typeof owner.id !== "string" ||
    !owner.id ||
    owner.id.length > 200
  )
    throw new DownloadError("INVALID_OWNER", "A valid download owner is required.", 401);
}
function checkLimits(limits: DownloadRuntimeLimits): void {
  if (!limits || typeof limits.enabled !== "boolean" || !Array.isArray(limits.enabledPlatforms))
    throw new DownloadError("DOWNLOADS_UNAVAILABLE", "Downloads are not configured.", 503, true);
  for (const key of [
    "globalDailyJobs",
    "networkDailyJobs",
    "globalQueued",
    "platformActive",
    "platformStartsPerMinute",
    "globalDailyBytes",
    "globalMonthlyBytes",
    "globalDailyCostMicros",
    "jobSourceBytes",
    "jobCostMicros",
    "maxWorkMs",
    "maxEngineStarts",
    "maxQueueAgeMs",
    "retentionMs",
    "leaseMs",
  ] as const) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1)
      throw new DownloadError("DOWNLOADS_UNAVAILABLE", "Download capacity is not configured.", 503, true);
  }
  if (limits.maxWorkMs >= 840_000 || limits.maxEngineStarts > 2)
    throw new DownloadError("DOWNLOADS_UNAVAILABLE", "Download execution limits are invalid.", 503);
}
function checkInput(input: CreateDownload): void {
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    throw new DownloadError("INVALID_URL", "Enter a valid supported video URL.");
  }
  if (
    !uuid.test(input.requestId) ||
    !["720", "1080"].includes(input.quality) ||
    !/^[a-z][a-z0-9-]{0,63}$/.test(input.platform) ||
    input.url.length > 4096 ||
    (input.inspect !== undefined && typeof input.inspect !== "boolean") ||
    input.selectedFormat !== undefined ||
    input.expectedFormat !== undefined ||
    url.protocol !== "https:" ||
    url.username ||
    url.password
  )
    throw new DownloadError("INVALID_INPUT", "The download request is invalid.");
}
function validateAdmissionInput(
  owner: DownloadOwner,
  input: CreateDownload,
  options: DownloadAdmissionOptions,
): string {
  validateOwner(owner);
  checkInput(input);
  checkLimits(options.limits);
  if (typeof options.networkHash !== "string" || !options.networkHash || options.networkHash.length > 128)
    throw new DownloadError("INVALID_NETWORK", "Trusted network identification is required.", 503);
  return createHash("sha256")
    .update(JSON.stringify([input.platform, input.url, input.quality, ...(input.inspect ? [true] : [])]))
    .digest("hex");
}
function canonicalInspectionSource(input: CreateDownload): boolean {
  const source = parsePlatformUrl(input.platform, input.url);
  return (
    input.inspect === true &&
    source.status === "supported" &&
    source.source.url === input.url &&
    (getPlatformService(input.platform)?.enginesFor(source.source).length ?? 0) > 0
  );
}
function inspectionMetadata(
  value: unknown,
  input: CreateDownload,
  limits: DownloadRuntimeLimits,
): DownloadInspection | null {
  const parsed = downloadInspectionSchema.safeParse(value);
  return parsed.success &&
    parsed.data.formats.every(
      (format) =>
        Math.min(format.width, format.height) <= Number(input.quality) &&
        (format.bytes === null || format.bytes <= Math.min(250 * 1024 * 1024, limits.jobSourceBytes)),
    )
    ? parsed.data
    : null;
}
function inspectionExpiry(expiresAt: Date, now: Date): Date | null {
  const expiry = new Date(
    Math.min(
      expiresAt.getTime(),
      now.getTime() + 120_000,
      Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`) + 86_400_000,
    ),
  );
  return expiry.getTime() > now.getTime() + 15_000 ? expiry : null;
}
const quotaError = (message: string) => new DownloadError("DOWNLOAD_QUOTA", message, 429, true);
const ownerScope = (owner: DownloadOwner) => `owner:${owner.kind}:${owner.id}`;
const rowOwner = (row: JobRow): DownloadOwner => ({ kind: row.owner_kind, id: row.owner_id });
async function clock(client: PoolClient): Promise<Date> {
  return (await client.query<{ now: Date }>("SELECT clock_timestamp() AS now")).rows[0].now;
}
function keys(
  owner: DownloadOwner,
  platform: string,
  networkHash: string,
  day: string,
  month: string,
  minute?: string,
): BucketKey[] {
  return [
    { scope: "global", period: "live" },
    { scope: "global", period: `day:${day}` },
    { scope: "global", period: `month:${month}` },
    { scope: `network:${networkHash}`, period: `day:${day}` },
    { scope: `platform:${platform}`, period: "live" },
    { scope: ownerScope(owner), period: "live" },
    { scope: ownerScope(owner), period: `day:${day}` },
    ...(minute ? [{ scope: `platform:${platform}`, period: `minute:${minute}` }] : []),
  ];
}
async function lockBuckets(client: PoolClient, requested: BucketKey[]): Promise<Map<string, Bucket>> {
  // Quota mutations use this stable scope/period order before locking job/slot rows.
  const rank = (scope: string) =>
    scope === "global" ? 0 : scope.startsWith("platform:") ? 1 : scope.startsWith("network:") ? 2 : 3;
  const ordered = [...new Map(requested.map((key) => [`${key.scope}\0${key.period}`, key])).values()].sort(
    (a, b) => rank(a.scope) - rank(b.scope) || a.scope.localeCompare(b.scope) || a.period.localeCompare(b.period),
  );
  const values = [ordered.map((key) => key.scope), ordered.map((key) => key.period)];
  await client.query(
    `INSERT INTO download_quota_buckets(scope,period)
     SELECT scope,period FROM unnest($1::text[],$2::text[]) WITH ORDINALITY AS requested(scope,period,ordinal)
     ORDER BY ordinal ON CONFLICT DO NOTHING`,
    values,
  );
  const { rows } = await client.query<Bucket>(
    `SELECT bucket.* FROM download_quota_buckets bucket
     JOIN unnest($1::text[],$2::text[]) WITH ORDINALITY AS requested(scope,period,ordinal)
     USING(scope,period) ORDER BY requested.ordinal FOR UPDATE OF bucket`,
    values,
  );
  return new Map(rows.map((row) => [`${row.scope}\0${row.period}`, row]));
}
const bucket = (rows: Map<string, Bucket>, scope: string, period: string) => rows.get(`${scope}\0${period}`)!;
async function toolEnabled(client: PoolClient, platform: string): Promise<boolean> {
  const { rows } = await client.query("SELECT enabled,archived FROM managed_tools WHERE tool_id=$1 FOR SHARE", [
    `media.${platform}-video-downloader`,
  ]);
  return rows[0]?.enabled === true && rows[0]?.archived === false;
}
function publicArtifact(row: ArtifactRow): DownloadArtifact {
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {};
  const number = (key: string) =>
    typeof metadata[key] === "number" &&
    Number.isFinite(metadata[key]) &&
    metadata[key] > 0 &&
    (key === "durationSeconds" || Number.isInteger(metadata[key]))
      ? Number(metadata[key])
      : null;
  return {
    id: row.id,
    name: row.filename,
    mime: row.mime_type,
    bytes: Number(row.size_bytes),
    width: number("width"),
    height: number("height"),
    durationSeconds: number("durationSeconds"),
    hasAudio: metadata.hasAudio === true,
  };
}
async function publicJob(
  client: Pick<PoolClient, "query">,
  row: JobRow,
  knownArtifacts?: ArtifactRow[],
): Promise<DownloadJob> {
  const expired =
    ["succeeded", "ready"].includes(row.state) && row.expires_at !== null && row.expires_at.getTime() <= Date.now();
  const inspection = !expired && row.inspection ? downloadInspectionSchema.safeParse(row.inspection) : null;
  const artifacts =
    row.state === "succeeded" && !expired
      ? (
          knownArtifacts ??
          (
            await client.query<ArtifactRow>(
              "SELECT * FROM download_artifacts WHERE job_id=$1 AND deleted_at IS NULL ORDER BY created_at,id",
              [row.id],
            )
          ).rows
        ).map(publicArtifact)
      : [];
  return {
    id: row.id,
    requestId: row.request_id,
    platform: row.platform,
    state: expired ? "expired" : row.state,
    phase: row.phase,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    expiresAt: row.expires_at?.toISOString() ?? null,
    error: row.error,
    artifacts,
    inspect: row.inspect,
    inspection: inspection?.success ? inspection.data : null,
    selectedFormat: row.selected_format,
  };
}

/** A read-only abuse precheck; only admitDownloadJob can consume admission quotas. */
export async function checkDownloadInspectionAdmission(
  owner: DownloadOwner,
  input: CreateDownload,
  options: DownloadAdmissionOptions,
): Promise<{ job?: DownloadJob; inspection?: PreparedInspection }> {
  const inputHash = validateAdmissionInput(owner, input, options);
  const canonical = canonicalInspectionSource(input);
  const { rows } = await sqlClient.query<{
    policy: unknown;
    enabled: boolean | null;
    archived: boolean | null;
    owner_admitted: number;
    network_admitted: number;
    global_admitted: number;
    global_day_bytes: string;
    global_month_bytes: string;
    job: JobRow | null;
    artifacts: ArtifactRow[];
    now: Date;
    inspection: unknown;
    expires_at: Date | null;
    updated_at: Date | null;
  }>(
    `SELECT jsonb_build_object('expectedVersion',p.version,
       'guest',jsonb_build_object('daily',p.guest_daily,'active',p.guest_active,'queued',p.guest_queued),
       'account',jsonb_build_object('daily',p.account_daily,'active',p.account_active,'queued',p.account_queued)) AS policy,
       tool.enabled,tool.archived,COALESCE(own.admitted,0) AS owner_admitted,
       COALESCE(network.admitted,0) AS network_admitted,COALESCE(global_day.admitted,0) AS global_admitted,
       COALESCE(global_day.reserved_bytes,0) AS global_day_bytes,COALESCE(global_month.reserved_bytes,0) AS global_month_bytes,
       to_jsonb(job) AS job,COALESCE((SELECT jsonb_agg(a ORDER BY a.created_at,a.id) FROM download_artifacts a
         WHERE job.state='succeeded' AND a.job_id=job.id AND a.deleted_at IS NULL),'[]'::jsonb) AS artifacts,
       clock_timestamp() AS now,cached.inspection,cached.expires_at,cached.updated_at
     FROM (SELECT 'day:'||to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD') AS period,
                  'month:'||to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM') AS month_period) utc
     LEFT JOIN download_policies p ON p.id='default'
     LEFT JOIN managed_tools tool ON tool.tool_id=$1
     LEFT JOIN download_quota_buckets own ON own.scope=$2 AND own.period=utc.period
     LEFT JOIN download_quota_buckets network ON network.scope=$3 AND network.period=utc.period
     LEFT JOIN download_quota_buckets global_day ON global_day.scope='global' AND global_day.period=utc.period
     LEFT JOIN download_quota_buckets global_month ON global_month.scope='global' AND global_month.period=utc.month_period
     LEFT JOIN download_jobs job ON job.owner_kind=$4 AND job.owner_id=$5 AND job.request_id=$6
     LEFT JOIN LATERAL (
       SELECT inspection,expires_at,updated_at FROM download_jobs
       WHERE $7::boolean AND input_hash=$8 AND platform=$9 AND source_url=$10 AND quality=$11
         AND state='ready' AND inspect=true AND selected_format IS NULL
         AND expires_at>clock_timestamp()+INTERVAL '15 seconds'
         AND updated_at>statement_timestamp()-INTERVAL '105 seconds' AND updated_at<=clock_timestamp()
       ORDER BY updated_at DESC LIMIT 1
     ) cached ON true`,
    [
      `media.${input.platform}-video-downloader`,
      ownerScope(owner),
      `network:${options.networkHash}`,
      owner.kind,
      owner.id,
      input.requestId,
      canonical,
      inputHash,
      input.platform,
      input.url,
      input.quality,
    ],
  );
  const row = rows[0];
  if (row.job) {
    if (row.job.input_hash !== inputHash)
      throw new DownloadError("IDEMPOTENCY_CONFLICT", "This submission ID was already used for different input.", 409);
    return {
      job: await publicJob(
        sqlClient,
        {
          ...row.job,
          created_at: new Date(row.job.created_at),
          updated_at: new Date(row.job.updated_at),
          expires_at: row.job.expires_at ? new Date(row.job.expires_at) : null,
        },
        row.artifacts,
      ),
    };
  }
  if (!canonical) throw new DownloadError("INVALID_INSPECTION", "Use a canonical supported video link for inspection.");
  let policy;
  try {
    policy = validateDownloadPolicyInput(row.policy);
  } catch {
    throw new DownloadError("DOWNLOADS_UNAVAILABLE", "Downloader limits are unavailable. Try again later.", 503, true);
  }
  const limits = options.limits;
  if (
    !limits.enabled ||
    !limits.enabledPlatforms.includes(input.platform) ||
    row.enabled !== true ||
    row.archived !== false
  )
    throw new DownloadError("PLATFORM_UNAVAILABLE", "This downloader is currently unavailable.", 503, true);
  if (row.owner_admitted >= policy[owner.kind].daily)
    throw quotaError("Your daily download allowance has been reached. It resets at 00:00 UTC.");
  if (row.global_admitted >= limits.globalDailyJobs || row.network_admitted >= limits.networkDailyJobs)
    throw quotaError("The current download allowance has been reached. Try again later.");
  const value = inspectionMetadata(row.inspection, input, limits);
  const expiresAt =
    row.expires_at && row.updated_at
      ? inspectionExpiry(new Date(Math.min(row.expires_at.getTime(), row.updated_at.getTime() + 120_000)), row.now)
      : null;
  if (value && expiresAt) return { inspection: { value, expiresAt } };
  if (
    Number(row.global_day_bytes) >= limits.globalDailyBytes ||
    Number(row.global_month_bytes) >= limits.globalMonthlyBytes
  )
    throw quotaError("Download capacity has reached its configured budget. Try again later.");
  return {};
}

export async function admitDownloadJob(
  owner: DownloadOwner,
  input: CreateDownload,
  options: DownloadAdmissionOptions & {
    inspection?: PreparedInspection;
    inspectionUsage?: { sourceBytes: number; workMs: number };
  },
): Promise<DownloadJob> {
  const inputHash = validateAdmissionInput(owner, input, options);
  const limits = options.limits;
  return withDownloadTransaction(async (client) => {
    const policy = await readLockedDownloadPolicy(client);
    const now = await clock(client);
    const day = now.toISOString().slice(0, 10),
      month = day.slice(0, 7);
    const buckets = await lockBuckets(client, keys(owner, input.platform, options.networkHash, day, month));
    const existing = (
      await client.query<JobRow>(
        "SELECT * FROM download_jobs WHERE owner_kind=$1 AND owner_id=$2 AND request_id=$3 FOR UPDATE",
        [owner.kind, owner.id, input.requestId],
      )
    ).rows[0];
    if (existing) {
      if (existing.input_hash !== inputHash)
        throw new DownloadError(
          "IDEMPOTENCY_CONFLICT",
          "This submission ID was already used for different input.",
          409,
        );
      return publicJob(client, existing);
    }
    const source = parsePlatformUrl(input.platform, input.url);
    const service = getPlatformService(input.platform);
    if (source.status === "supported" && !service?.enginesFor(source.source).length)
      throw new DownloadError("METHOD_UNAVAILABLE", "Downloads for this type of post are not yet available.", 503);
    if (
      !limits.enabled ||
      !limits.enabledPlatforms.includes(input.platform) ||
      !(await toolEnabled(client, input.platform))
    )
      throw new DownloadError("PLATFORM_UNAVAILABLE", "This downloader is currently unavailable.", 503, true);
    const personal = policy[owner.kind];
    if (bucket(buckets, ownerScope(owner), `day:${day}`).admitted >= personal.daily)
      throw quotaError("Your daily download allowance has been reached. It resets at 00:00 UTC.");
    if (
      bucket(buckets, "global", `day:${day}`).admitted >= limits.globalDailyJobs ||
      bucket(buckets, `network:${options.networkHash}`, `day:${day}`).admitted >= limits.networkDailyJobs
    )
      throw quotaError("The current download allowance has been reached. Try again later.");
    let cached: { inspection: DownloadInspection; expiresAt: Date } | undefined;
    const canonical = canonicalInspectionSource(input);
    const suppliedUsage = options.inspectionUsage;
    if (
      suppliedUsage !== undefined &&
      (!canonical ||
        !suppliedUsage ||
        !Number.isSafeInteger(suppliedUsage.sourceBytes) ||
        suppliedUsage.sourceBytes < 0 ||
        suppliedUsage.sourceBytes > limits.jobSourceBytes ||
        !Number.isSafeInteger(suppliedUsage.workMs) ||
        suppliedUsage.workMs < 0 ||
        suppliedUsage.workMs > limits.maxWorkMs)
    )
      throw new DownloadError("INVALID_USAGE", "Invalid inspection usage report.");
    const inspectionUsage = suppliedUsage ?? { sourceBytes: 0, workMs: 0 };
    if (inspectionUsage.sourceBytes >= limits.jobSourceBytes || inspectionUsage.workMs >= limits.maxWorkMs)
      throw new DownloadError("WORK_BUDGET", "This download reached its processing limit.", 409);
    if (options.inspection !== undefined) {
      const supplied = options.inspection;
      const value = inspectionMetadata(supplied?.value, input, limits);
      if (
        !canonical ||
        !value ||
        !(supplied?.expiresAt instanceof Date) ||
        !Number.isFinite(supplied.expiresAt.getTime())
      )
        throw new DownloadError("INVALID_INSPECTION", "The supplied video formats could not be verified.");
      const expiresAt = inspectionExpiry(supplied.expiresAt, now);
      if (expiresAt) cached = { inspection: value, expiresAt };
    }
    if (!cached && canonical) {
      const candidate = (
        await client.query<{ inspection: unknown; expires_at: Date; updated_at: Date }>(
          `SELECT inspection,expires_at,updated_at FROM download_jobs
           WHERE input_hash=$1 AND platform=$2 AND source_url=$3 AND quality=$4
             AND state='ready' AND inspect=true AND selected_format IS NULL
             AND expires_at>clock_timestamp()+INTERVAL '15 seconds'
             AND updated_at>$5 AND updated_at>clock_timestamp()-INTERVAL '105 seconds' AND updated_at<=clock_timestamp()
           ORDER BY updated_at DESC LIMIT 1`,
          [inputHash, input.platform, input.url, input.quality, new Date(now.getTime() - 105_000)],
        )
      ).rows[0];
      const value = candidate ? inspectionMetadata(candidate.inspection, input, limits) : null;
      if (candidate && value) {
        // Inheriting expires_at prevents copies from extending an older result's freshness.
        const expiresAt = inspectionExpiry(
          new Date(Math.min(candidate.expires_at.getTime(), candidate.updated_at.getTime() + 120_000)),
          now,
        );
        if (expiresAt) cached = { inspection: value, expiresAt };
      }
    }
    if (!cached && bucket(buckets, ownerScope(owner), "live").queued >= personal.queued)
      throw quotaError("Your download queue is full. Wait for a queued job to start.");
    if (!cached && bucket(buckets, "global", "live").queued >= limits.globalQueued)
      throw quotaError("The download queue is full. Try again later.");
    const daily = bucket(buckets, "global", `day:${day}`),
      monthly = bucket(buckets, "global", `month:${month}`);
    const reserveBytes = cached ? inspectionUsage.sourceBytes : limits.jobSourceBytes;
    const reserveCost = cached ? 0 : limits.jobCostMicros;
    if (
      (reserveBytes > 0 &&
        (Number(daily.reserved_bytes) + reserveBytes > limits.globalDailyBytes ||
          Number(monthly.reserved_bytes) + reserveBytes > limits.globalMonthlyBytes)) ||
      (reserveCost > 0 && Number(daily.reserved_cost_micros) + reserveCost > limits.globalDailyCostMicros)
    )
      throw quotaError("Download capacity has reached its configured budget. Try again later.");
    await client.query(
      "UPDATE download_quota_buckets SET admitted=admitted+1 WHERE scope=ANY($1::text[]) AND period=$2",
      [["global", `network:${options.networkHash}`, ownerScope(owner)], `day:${day}`],
    );
    if (reserveBytes || reserveCost) await adjustGlobalBudget(client, day, month, reserveBytes, reserveCost);
    if (!cached) {
      await client.query(
        "UPDATE download_quota_buckets SET queued=queued+1 WHERE scope=ANY($1::text[]) AND period='live'",
        [["global", `platform:${input.platform}`, ownerScope(owner)]],
      );
    }
    const budget: Budget = {
      workMs: limits.maxWorkMs,
      sourceBytes: limits.jobSourceBytes,
      engineStarts: limits.maxEngineStarts,
      costMicros: limits.jobCostMicros,
      retentionMs: limits.retentionMs,
      leaseMs: limits.leaseMs,
    };
    const { rows } = await client.query<JobRow>(
      `INSERT INTO download_jobs(id,owner_kind,owner_id,request_id,input_hash,platform,source_url,quality,network_hash,state,phase,dispatch_due_at,queue_expires_at,admission_policy_version,budget,admission_day,admission_month,inspect,inspection,expires_at,work_ms,source_bytes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
      [
        crypto.randomUUID(),
        owner.kind,
        owner.id,
        input.requestId,
        inputHash,
        input.platform,
        input.url,
        input.quality,
        options.networkHash,
        cached ? "ready" : "queued",
        cached ? null : "queued",
        cached ? null : now,
        new Date(now.getTime() + limits.maxQueueAgeMs),
        policy.version,
        JSON.stringify(budget),
        day,
        month,
        input.inspect === true,
        cached ? JSON.stringify(cached.inspection) : null,
        cached?.expiresAt ?? null,
        inspectionUsage.workMs,
        inspectionUsage.sourceBytes,
      ],
    );
    return publicJob(client, rows[0]);
  });
}

async function ownedRow(owner: DownloadOwner, id: string): Promise<JobRow> {
  validateOwner(owner);
  const row = (
    await sqlClient.query<JobRow>("SELECT * FROM download_jobs WHERE id=$1 AND owner_kind=$2 AND owner_id=$3", [
      id,
      owner.kind,
      owner.id,
    ])
  ).rows[0];
  if (!row) throw new DownloadError("NOT_FOUND", "This download is unavailable.", 404);
  return row;
}
export async function getDownloadJob(owner: DownloadOwner, id: string): Promise<DownloadJob> {
  return publicJob(sqlClient, await ownedRow(owner, id));
}
export async function findDownloadSubmission(owner: DownloadOwner, requestId: string): Promise<DownloadJob | null> {
  validateOwner(owner);
  const row = (
    await sqlClient.query<JobRow>("SELECT * FROM download_jobs WHERE owner_kind=$1 AND owner_id=$2 AND request_id=$3", [
      owner.kind,
      owner.id,
      requestId,
    ])
  ).rows[0];
  return row ? publicJob(sqlClient, row) : null;
}
export async function getArtifactForOwner(owner: DownloadOwner, jobId: string, artifactId: string) {
  const job = await ownedRow(owner, jobId);
  if (job.state === "expired" || (job.expires_at && job.expires_at.getTime() <= Date.now()))
    throw new DownloadError("ARTIFACT_EXPIRED", "This download has expired. Submit the link again.", 410);
  if (job.state !== "succeeded") throw new DownloadError("NOT_READY", "This download is not ready.", 409, true);
  const row = (
    await sqlClient.query<ArtifactRow>(
      "SELECT * FROM download_artifacts WHERE id=$1 AND job_id=$2 AND deleted_at IS NULL AND expires_at>NOW()",
      [artifactId, jobId],
    )
  ).rows[0];
  if (!row) throw new DownloadError("NOT_FOUND", "This file is unavailable.", 404);
  return {
    ...publicArtifact(row),
    storageKey: row.storage_key,
    etag: row.etag,
    expiresAt: row.expires_at.toISOString(),
  };
}

async function lockJob(
  client: PoolClient,
  id: string,
  minute?: string,
): Promise<{ job: JobRow; buckets: Map<string, Bucket> } | null> {
  const snapshot = (await client.query<JobRow>("SELECT * FROM download_jobs WHERE id=$1", [id])).rows[0];
  if (!snapshot) return null;
  const buckets = await lockBuckets(
    client,
    keys(
      rowOwner(snapshot),
      snapshot.platform,
      snapshot.network_hash,
      snapshot.admission_day,
      snapshot.admission_month,
      minute,
    ),
  );
  const job = (await client.query<JobRow>("SELECT * FROM download_jobs WHERE id=$1 FOR UPDATE", [id])).rows[0];
  return { job, buckets };
}
async function movePermits(client: PoolClient, job: JobRow, from: "queued" | "active", to?: "queued" | "active") {
  await client.query(
    `UPDATE download_quota_buckets SET ${from}=${from}-1${to ? `,${to}=${to}+1` : ""} WHERE scope=ANY($1::text[]) AND period='live'`,
    [["global", `platform:${job.platform}`, ownerScope(rowOwner(job))]],
  );
}
async function adjustGlobalBudget(client: PoolClient, day: string, month: string, bytes: number, cost: number) {
  // Both rows are already locked; cost is tracked only in the daily bucket.
  await client.query(
    "UPDATE download_quota_buckets SET reserved_bytes=reserved_bytes+$1,reserved_cost_micros=reserved_cost_micros+CASE WHEN period=$3 THEN $2::bigint ELSE 0 END WHERE scope='global' AND period=ANY($4::text[])",
    [bytes, cost, `day:${day}`, [`day:${day}`, `month:${month}`]],
  );
}
// Reservations are conservatively retained for the original UTC day/month unless trusted measured usage is supplied.
async function settleBudget(client: PoolClient, job: JobRow, usage?: DownloadUsage) {
  const bytes = usage ? Math.max(Number(job.source_bytes), usage.sourceBytes) : job.budget.sourceBytes;
  const cost =
    usage?.costMicros === undefined ? job.budget.costMicros : Math.max(Number(job.cost_micros), usage.costMicros);
  await adjustGlobalBudget(
    client,
    job.admission_day,
    job.admission_month,
    bytes - job.budget.sourceBytes,
    cost - job.budget.costMicros,
  );
}
/** Resume an inspected job without creating another admission or resetting its cumulative budget. */
export async function selectDownloadFormat(
  owner: DownloadOwner,
  id: string,
  formatId: string,
  limits: DownloadRuntimeLimits,
): Promise<DownloadJob> {
  validateOwner(owner);
  checkLimits(limits);
  if (!downloadFormatIdSchema.safeParse(formatId).success)
    throw new DownloadError("INVALID_FORMAT", "Choose an available video format.");
  return withDownloadTransaction(async (client) => {
    const policy = await readLockedDownloadPolicy(client);
    const locked = await lockJob(client, id);
    const job = locked?.job;
    if (!job || job.owner_kind !== owner.kind || job.owner_id !== owner.id)
      throw new DownloadError("NOT_FOUND", "This download is unavailable.", 404);
    if (job.selected_format) {
      if (job.selected_format !== formatId)
        throw new DownloadError(
          "SELECTION_CONFLICT",
          "A different format was already selected for this download.",
          409,
        );
      return publicJob(client, job);
    }
    const now = await clock(client);
    if (
      job.state === "expired" ||
      (job.state === "ready" &&
        (!job.expires_at || job.expires_at <= now || job.admission_day !== now.toISOString().slice(0, 10)))
    )
      throw new DownloadError("INSPECTION_EXPIRED", "These formats have expired. Submit the link again.", 410);
    if (job.state !== "ready" || !job.inspect)
      throw new DownloadError("NOT_READY", "This download is not ready for format selection.", 409);
    const inspection = downloadInspectionSchema.safeParse(job.inspection);
    const format = inspection.success ? inspection.data.formats.find((option) => option.id === formatId) : undefined;
    if (!format || Math.min(format.width, format.height) > Number(job.quality))
      throw new DownloadError("INVALID_FORMAT", "Choose a format from this video's available options.", 409);
    if (
      !limits.enabled ||
      !limits.enabledPlatforms.includes(job.platform) ||
      !(await toolEnabled(client, job.platform))
    )
      throw new DownloadError("PLATFORM_UNAVAILABLE", "This downloader is currently unavailable.", 503, true);
    if (Number(job.work_ms) >= job.budget.workMs || Number(job.source_bytes) >= job.budget.sourceBytes)
      throw new DownloadError("WORK_BUDGET", "This download reached its processing limit.", 409);
    const buckets = locked!.buckets;
    if (bucket(buckets, ownerScope(owner), "live").queued >= policy[owner.kind].queued)
      throw quotaError("Your download queue is full. Wait for a queued job to start.");
    if (bucket(buckets, "global", "live").queued >= limits.globalQueued)
      throw quotaError("The download queue is full. Try again later.");
    const bytes = Math.max(0, job.budget.sourceBytes - Number(job.source_bytes));
    const cost = Math.max(0, job.budget.costMicros - Number(job.cost_micros));
    const daily = bucket(buckets, "global", `day:${job.admission_day}`);
    const monthly = bucket(buckets, "global", `month:${job.admission_month}`);
    if (
      Number(daily.reserved_bytes) + bytes > limits.globalDailyBytes ||
      Number(monthly.reserved_bytes) + bytes > limits.globalMonthlyBytes ||
      Number(daily.reserved_cost_micros) + cost > limits.globalDailyCostMicros
    )
      throw quotaError("Download capacity has reached its configured budget. Try again later.");
    await client.query(
      "UPDATE download_quota_buckets SET queued=queued+1 WHERE scope=ANY($1::text[]) AND period='live'",
      [["global", `platform:${job.platform}`, ownerScope(owner)]],
    );
    await adjustGlobalBudget(client, job.admission_day, job.admission_month, bytes, cost);
    const { rows } = await client.query<JobRow>(
      "UPDATE download_jobs SET state='queued',phase='queued',selected_format=$2,expires_at=NULL,error=NULL,dispatch_version=dispatch_version+1,dispatch_due_at=$3,next_eligible_at=$3,queue_expires_at=$4,budget=$5::jsonb,updated_at=$3 WHERE id=$1 RETURNING *",
      [
        id,
        formatId,
        now,
        new Date(now.getTime() + limits.maxQueueAgeMs),
        // The selected download has its own bounded engine allowance. The
        // locked selected_format guard makes this grant happen only once.
        JSON.stringify({ ...job.budget, engineStarts: Math.min(4, job.engine_starts + limits.maxEngineStarts) }),
      ],
    );
    return publicJob(client, rows[0]);
  });
}
export async function cancelDownloadJob(owner: DownloadOwner, id: string): Promise<DownloadJob> {
  validateOwner(owner);
  return withDownloadTransaction(async (client) => {
    const locked = await lockJob(client, id);
    const job = locked?.job;
    if (!job || job.owner_kind !== owner.kind || job.owner_id !== owner.id)
      throw new DownloadError("NOT_FOUND", "This download is unavailable.", 404);
    if (terminal.has(job.state) || job.state === "cancelling") return publicJob(client, job);
    if (job.state === "queued") {
      await movePermits(client, job, "queued");
      await settleBudget(client, job, {
        workMs: 0,
        sourceBytes: Number(job.source_bytes),
        costMicros: Number(job.cost_micros),
      });
    }
    const state = job.state === "queued" || job.state === "ready" ? "cancelled" : "cancelling";
    const { rows } = await client.query<JobRow>(
      "UPDATE download_jobs SET state=$2,phase=$3,source_url=CASE WHEN $2='cancelled' THEN NULL ELSE source_url END,inspection=CASE WHEN $2='cancelled' THEN NULL ELSE inspection END,expires_at=CASE WHEN $2='cancelled' THEN NULL ELSE expires_at END,dispatch_due_at=NULL,updated_at=NOW() WHERE id=$1 RETURNING *",
      [id, state, state === "cancelling" ? (job.phase === "recovering" ? "recovering" : "stopping") : null],
    );
    return publicJob(client, rows[0]);
  });
}

/** Queue and idle inspection expiry do not depend on the queue provider delivering a message. */
export async function expireQueuedDownloadJobs(limit = 100): Promise<number> {
  const { rows } = await sqlClient.query<{ id: string }>(
    "SELECT id FROM download_jobs WHERE (state='queued' AND queue_expires_at<=NOW()) OR (state='ready' AND expires_at<=NOW()) ORDER BY COALESCE(expires_at,queue_expires_at),id LIMIT $1",
    [Math.max(1, Math.min(500, limit))],
  );
  let expired = 0;
  for (const { id } of rows) {
    expired += await withDownloadTransaction(async (client) => {
      const locked = await lockJob(client, id);
      const job = locked?.job;
      const now = await clock(client);
      if (job?.state === "ready" && job.expires_at && job.expires_at <= now) {
        // Inspection already released permits and settled usage when its attempt stopped.
        await client.query(
          "UPDATE download_jobs SET state='expired',phase=NULL,source_url=NULL,inspection=NULL,dispatch_due_at=NULL,updated_at=NOW() WHERE id=$1",
          [id],
        );
        return 1;
      }
      if (!job || job.state !== "queued" || job.queue_expires_at > now) return 0;
      if ((await client.query("SELECT 1 FROM download_attempts WHERE job_id=$1 AND stopped_at IS NULL", [id])).rowCount)
        return 0;
      await movePermits(client, job, "queued");
      await settleBudget(client, job, {
        workMs: Number(job.work_ms),
        sourceBytes: Number(job.source_bytes),
        costMicros: Number(job.cost_micros),
      });
      await client.query(
        "UPDATE download_jobs SET state='failed',phase=NULL,source_url=NULL,dispatch_due_at=NULL,error=$2,updated_at=NOW() WHERE id=$1",
        [
          id,
          JSON.stringify({
            code: "QUEUE_EXPIRED",
            message: "The download waited too long. Try again.",
            retryable: true,
          }),
        ],
      );
      return 1;
    });
  }
  return expired;
}
/** Lease outbox rows before sending; an interrupted publication becomes due again in thirty seconds. */
export async function claimDueDownloadDispatches(
  limit = 100,
  jobId?: string,
): Promise<{ jobId: string; dispatchVersion: number; platform: PlatformId }[]> {
  const { rows } = await sqlClient.query<{ id: string; dispatch_version: number; platform: PlatformId }>(
    `WITH due AS (
      SELECT id FROM download_jobs
      WHERE state='queued' AND dispatch_due_at<=NOW() AND next_eligible_at<=NOW() AND ($2::text IS NULL OR id=$2)
      ORDER BY dispatch_due_at,id FOR UPDATE SKIP LOCKED LIMIT $1
    ) UPDATE download_jobs j SET dispatch_due_at=NOW()+INTERVAL '30 seconds'
      FROM due WHERE j.id=due.id RETURNING j.id,j.dispatch_version,j.platform`,
    [Math.max(1, Math.min(500, limit)), jobId ?? null],
  );
  return rows.map((row) => ({ jobId: row.id, dispatchVersion: row.dispatch_version, platform: row.platform }));
}
export async function markDownloadDispatched(id: string, dispatchVersion: number): Promise<void> {
  // Redeliver if a provider loses delivery; repeats are safe and never reset queue age.
  await sqlClient.query(
    "UPDATE download_jobs SET dispatch_due_at=GREATEST(next_eligible_at,NOW()+INTERVAL '1 minute') WHERE id=$1 AND dispatch_version=$2 AND state='queued'",
    [id, dispatchVersion],
  );
}
export async function deferDownloadJob(id: string, dispatchVersion: number, delaySeconds: number): Promise<void> {
  if (!Number.isFinite(delaySeconds) || delaySeconds < 0)
    throw new DownloadError("INVALID_DELAY", "Invalid retry delay.");
  await sqlClient.query(
    "UPDATE download_jobs SET next_eligible_at=NOW()+($3 * INTERVAL '1 second'),dispatch_due_at=NOW()+($3 * INTERVAL '1 second'),updated_at=NOW() WHERE id=$1 AND dispatch_version=$2 AND state='queued'",
    [id, dispatchVersion, Math.min(delaySeconds, 600)],
  );
}

export async function claimDownloadJob(
  id: string,
  dispatchVersion: number,
  options: { slotIds: readonly string[]; limits: DownloadRuntimeLimits },
): Promise<DownloadClaim> {
  checkLimits(options.limits);
  const limits = options.limits;
  if (
    !options.slotIds.length ||
    options.slotIds.length > 250 ||
    new Set(options.slotIds).size !== options.slotIds.length ||
    options.slotIds.some((id) => !/^[a-zA-Z0-9_-]{1,80}$/.test(id))
  )
    throw new DownloadError("DOWNLOADS_UNAVAILABLE", "The download pool is not configured.", 503);
  return withDownloadTransaction(async (client) => {
    const policy = await readLockedDownloadPolicy(client);
    const now = await clock(client);
    const minute = now.toISOString().slice(0, 16);
    const locked = await lockJob(client, id, minute);
    if (!locked) return { status: "stale" };
    const { job, buckets } = locked;
    if (terminal.has(job.state) || job.state === "ready") return { status: "terminal" };
    if (job.dispatch_version !== dispatchVersion) return { status: "stale" };
    if (job.state !== "queued") return { status: "busy", retryAfterSeconds: 10 };
    const failQueued = async (error: DownloadFailure): Promise<DownloadClaim> => {
      await movePermits(client, job, "queued");
      await settleBudget(client, job, {
        workMs: Number(job.work_ms),
        sourceBytes: Number(job.source_bytes),
        costMicros: Number(job.cost_micros),
      });
      await client.query(
        "UPDATE download_jobs SET state='failed',phase=NULL,error=$2,source_url=NULL,dispatch_due_at=NULL,updated_at=NOW() WHERE id=$1",
        [id, JSON.stringify(error)],
      );
      return { status: "terminal" };
    };
    if (job.queue_expires_at <= now)
      return failQueued({
        code: "QUEUE_EXPIRED",
        message: "The download waited too long. Try again.",
        retryable: true,
      });
    if (!limits.enabled) return { status: "deferred", retryAfterSeconds: 30 };
    if (!limits.enabledPlatforms.includes(job.platform) || !(await toolEnabled(client, job.platform)))
      return failQueued({
        code: "PLATFORM_UNAVAILABLE",
        message: "This downloader is currently unavailable.",
        retryable: true,
      });
    if (
      job.next_eligible_at > now ||
      bucket(buckets, "global", "live").active >= options.slotIds.length ||
      bucket(buckets, ownerScope(rowOwner(job)), "live").active >= policy[job.owner_kind].active ||
      bucket(buckets, `platform:${job.platform}`, "live").active >= limits.platformActive ||
      bucket(buckets, `platform:${job.platform}`, `minute:${minute}`).admitted >= limits.platformStartsPerMinute
    )
      return { status: "deferred", retryAfterSeconds: 10 };
    const remaining = {
      workMs: job.budget.workMs - Number(job.work_ms),
      sourceBytes: job.budget.sourceBytes - Number(job.source_bytes),
      engineStarts: job.budget.engineStarts - job.engine_starts,
    };
    if (remaining.workMs <= 0 || remaining.sourceBytes <= 0 || remaining.engineStarts <= 0)
      return failQueued({
        code: "WORK_BUDGET",
        message: "This download reached its processing limit.",
        retryable: false,
      });
    let expectedFormat: DownloadFormat | undefined;
    if (job.selected_format) {
      const inspection = downloadInspectionSchema.safeParse(job.inspection);
      expectedFormat = inspection.success
        ? inspection.data.formats.find((format) => format.id === job.selected_format)
        : undefined;
      if (
        !job.inspect ||
        !expectedFormat ||
        Math.min(expectedFormat.width, expectedFormat.height) > Number(job.quality)
      )
        return failQueued({
          code: "FORMAT_UNAVAILABLE",
          message: "The selected format could not be verified. Check the link's formats again.",
          retryable: false,
        });
    }
    await client.query(
      "INSERT INTO download_slots(id) SELECT id FROM unnest($1::text[]) AS slots(id) ORDER BY id ON CONFLICT DO NOTHING",
      [options.slotIds],
    );
    const slot = (
      await client.query<{ id: string; generation: number }>(
        "SELECT id,generation FROM download_slots WHERE id=ANY($1::text[]) AND state='idle' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1",
        [options.slotIds],
      )
    ).rows[0];
    if (!slot) return { status: "deferred", retryAfterSeconds: 10 };
    const token = {
      jobId: id,
      attemptId: crypto.randomUUID(),
      generation: job.generation + 1,
      slotId: slot.id,
      slotGeneration: slot.generation + 1,
    };
    const deadline = new Date(now.getTime() + remaining.workMs);
    await movePermits(client, job, "queued", "active");
    await client.query("UPDATE download_quota_buckets SET admitted=admitted+1 WHERE scope=$1 AND period=$2", [
      `platform:${job.platform}`,
      `minute:${minute}`,
    ]);
    await client.query(
      "UPDATE download_jobs SET state='running',phase='starting',generation=$2,dispatch_due_at=NULL,updated_at=NOW() WHERE id=$1",
      [id, token.generation],
    );
    await client.query(
      "UPDATE download_slots SET state='busy',attempt_id=$2,generation=$3,lease_expires_at=$4,updated_at=NOW() WHERE id=$1",
      [slot.id, token.attemptId, token.slotGeneration, new Date(now.getTime() + job.budget.leaseMs)],
    );
    await client.query(
      "INSERT INTO download_attempts(id,job_id,generation,slot_id,slot_generation,execution_policy_version,phase,deadline) VALUES($1,$2,$3,$4,$5,$6,'starting',$7)",
      [token.attemptId, id, token.generation, slot.id, token.slotGeneration, policy.version, deadline],
    );
    return {
      status: "claimed",
      token,
      input: {
        platform: job.platform,
        url: job.source_url!,
        quality: job.quality,
        requestId: job.request_id,
        ...(job.inspect ? { inspect: true } : {}),
        ...(job.selected_format ? { selectedFormat: job.selected_format } : {}),
        ...(expectedFormat ? { expectedFormat } : {}),
      },
      owner: rowOwner(job),
      deadline: deadline.toISOString(),
      remaining,
    };
  });
}

async function lockAttempt(
  client: PoolClient,
  token: DownloadAttemptToken,
  quotaLocks = true,
): Promise<{ job: JobRow; attempt: AttemptRow; slot: SlotRow } | null> {
  // Heartbeats and start debits never mutate quota buckets. Their transactions
  // skip those locks entirely and must not acquire them after locking the job.
  const job = quotaLocks
    ? (await lockJob(client, token.jobId))?.job
    : (await client.query<JobRow>("SELECT * FROM download_jobs WHERE id=$1 FOR UPDATE", [token.jobId])).rows[0];
  if (!job || job.generation !== token.generation || terminal.has(job.state)) return null;
  const slot = (await client.query<SlotRow>("SELECT * FROM download_slots WHERE id=$1 FOR UPDATE", [token.slotId]))
    .rows[0];
  if (!slot || slot.attempt_id !== token.attemptId || slot.generation !== token.slotGeneration) return null;
  const attempt = (
    await client.query<AttemptRow>(
      "SELECT * FROM download_attempts WHERE id=$1 AND job_id=$2 AND generation=$3 AND slot_id=$4 AND slot_generation=$5 FOR UPDATE",
      [token.attemptId, token.jobId, token.generation, token.slotId, token.slotGeneration],
    )
  ).rows[0];
  return attempt && !attempt.stopped_at ? { job, attempt, slot } : null;
}
/** Fence the ordinary runner before performing stop/recovery I/O outside this transaction. */
export async function beginDownloadRecovery(token: DownloadAttemptToken): Promise<boolean> {
  return withDownloadTransaction(async (client) => {
    const locked = await lockAttempt(client, token);
    if (!locked) return false;
    const { job, attempt, slot } = locked;
    const now = await clock(client);
    if (
      job.phase !== "recovering" &&
      job.state !== "cancelling" &&
      slot.state !== "quarantined" &&
      attempt.deadline > now &&
      slot.lease_expires_at !== null &&
      slot.lease_expires_at > now
    )
      return false;
    await client.query("UPDATE download_jobs SET phase='recovering',updated_at=NOW() WHERE id=$1", [job.id]);
    await client.query("UPDATE download_attempts SET phase='recovering' WHERE id=$1", [attempt.id]);
    await client.query("UPDATE download_slots SET state='quarantined',updated_at=NOW() WHERE id=$1", [slot.id]);
    return true;
  });
}
function checkUsage(usage: DownloadUsage): void {
  for (const value of [usage.workMs, usage.sourceBytes, ...(usage.costMicros === undefined ? [] : [usage.costMicros])])
    if (!Number.isSafeInteger(value) || value < 0)
      throw new DownloadError("INVALID_USAGE", "Invalid download usage report.");
}
async function recordUsage(
  client: PoolClient,
  job: JobRow,
  attempt: AttemptRow,
  usage: DownloadUsage,
  heartbeat?: { now: Date; phase?: string },
): Promise<boolean> {
  checkUsage(usage);
  // Reports are cumulative within this attempt; duplicate/out-of-order heartbeats never refund usage.
  const work = Math.max(Number(attempt.work_ms), usage.workMs),
    bytes = Math.max(Number(attempt.source_bytes), usage.sourceBytes),
    cost = Math.max(Number(attempt.cost_micros), usage.costMicros ?? 0);
  const deltaWork = work - Number(attempt.work_ms),
    deltaBytes = bytes - Number(attempt.source_bytes),
    deltaCost = cost - Number(attempt.cost_micros);
  job.work_ms = String(Number(job.work_ms) + deltaWork);
  job.source_bytes = String(Number(job.source_bytes) + deltaBytes);
  job.cost_micros = String(Number(job.cost_micros) + deltaCost);
  const shouldStop =
    heartbeat !== undefined &&
    (job.state !== "running" ||
      job.phase === "stopping" ||
      job.phase === "recovering" ||
      attempt.deadline <= heartbeat.now ||
      Number(job.work_ms) >= job.budget.workMs ||
      Number(job.source_bytes) >= job.budget.sourceBytes);
  const phase = heartbeat ? (shouldStop ? "stopping" : (heartbeat.phase ?? job.phase)) : null;
  await client.query(
    "UPDATE download_attempts SET work_ms=$2,source_bytes=$3,cost_micros=$4,heartbeat_at=NOW(),phase=CASE WHEN $5 THEN $6 ELSE phase END WHERE id=$1",
    [attempt.id, work, bytes, cost, heartbeat !== undefined, phase],
  );
  await client.query(
    "UPDATE download_jobs SET work_ms=work_ms+$2,source_bytes=source_bytes+$3,cost_micros=cost_micros+$4,updated_at=NOW(),phase=CASE WHEN $5 THEN $6 ELSE phase END WHERE id=$1",
    [job.id, deltaWork, deltaBytes, deltaCost, heartbeat !== undefined, phase],
  );
  return shouldStop;
}
export async function consumeDownloadEngineStart(
  token: DownloadAttemptToken,
  usage?: DownloadUsage & { phase?: string },
): Promise<
  { allowed: true; remaining: number; ordinal: 1 | 2 | 3 | 4 } | { allowed: false; remaining: 0; shouldStop?: true }
> {
  if (usage) {
    checkUsage(usage);
    if (usage.phase && !phases.has(usage.phase)) throw new DownloadError("INVALID_PHASE", "Invalid download stage.");
  }
  return withDownloadTransaction(async (client) => {
    const locked = await lockAttempt(client, token, false);
    const denied = { allowed: false, remaining: 0 } as const;
    const stopped = usage ? ({ ...denied, shouldStop: true } as const) : denied;
    if (!locked || locked.job.phase === "recovering") return stopped;
    const { job, attempt } = locked;
    if (usage) {
      if (await refreshAttempt(client, token, job, attempt, usage)) return stopped;
    } else {
      const now = await clock(client);
      if (
        job.state !== "running" ||
        job.phase === "stopping" ||
        attempt.deadline <= now ||
        Number(job.work_ms) >= job.budget.workMs ||
        Number(job.source_bytes) >= job.budget.sourceBytes
      )
        return denied;
    }
    if (job.engine_starts >= job.budget.engineStarts) return denied;
    await client.query("UPDATE download_jobs SET engine_starts=engine_starts+1,updated_at=NOW() WHERE id=$1", [job.id]);
    return {
      allowed: true,
      remaining: job.budget.engineStarts - job.engine_starts - 1,
      ordinal: (job.engine_starts + 1) as 1 | 2 | 3 | 4,
    };
  });
}
async function refreshAttempt(
  client: PoolClient,
  token: DownloadAttemptToken,
  job: JobRow,
  attempt: AttemptRow,
  usage: DownloadUsage & { phase?: string },
): Promise<boolean> {
  const now = await clock(client);
  const shouldStop = await recordUsage(client, job, attempt, usage, { now, phase: usage.phase });
  await client.query("UPDATE download_slots SET lease_expires_at=$2,updated_at=NOW() WHERE id=$1", [
    token.slotId,
    new Date(now.getTime() + job.budget.leaseMs),
  ]);
  return shouldStop;
}
export async function heartbeatDownloadAttempt(
  token: DownloadAttemptToken,
  usage: DownloadUsage & { phase?: string },
): Promise<{ accepted: boolean; shouldStop: boolean }> {
  checkUsage(usage);
  if (usage.phase && !phases.has(usage.phase)) throw new DownloadError("INVALID_PHASE", "Invalid download stage.");
  return withDownloadTransaction(async (client) => {
    const locked = await lockAttempt(client, token, false);
    if (!locked) return { accepted: false, shouldStop: true };
    const { job, attempt } = locked;
    if (job.phase === "recovering") return { accepted: false, shouldStop: true };
    const shouldStop = await refreshAttempt(client, token, job, attempt, usage);
    return { accepted: true, shouldStop };
  });
}
export type FinishDownloadAttempt = Readonly<{
  outcome: "succeeded" | "failed" | "cancelled" | "retry" | "ready";
  stopped: boolean;
  artifacts?: readonly SealedDownloadArtifact[];
  inspection?: DownloadInspection;
  sourceUrl?: string;
  error?: DownloadFailure;
  usage: DownloadUsage;
  uncertainUsage?: boolean;
  recovery?: boolean;
}>;
export async function finishDownloadAttempt(
  token: DownloadAttemptToken,
  result: FinishDownloadAttempt,
): Promise<{ accepted: boolean; state?: DownloadState }> {
  checkUsage(result.usage);
  return withDownloadTransaction(async (client) => {
    const locked = await lockAttempt(client, token);
    if (!locked) return { accepted: false };
    const { job, attempt } = locked;
    if ((job.phase === "recovering") !== (result.recovery === true)) return { accepted: false };
    const usage = result.uncertainUsage
      ? {
          ...result.usage,
          workMs: Math.max(result.usage.workMs, Number(attempt.work_ms) + job.budget.workMs - Number(job.work_ms)),
          sourceBytes: Math.max(
            result.usage.sourceBytes,
            Number(attempt.source_bytes) + job.budget.sourceBytes - Number(job.source_bytes),
          ),
          costMicros: Math.max(
            result.usage.costMicros ?? 0,
            Number(attempt.cost_micros) + job.budget.costMicros - Number(job.cost_micros),
          ),
        }
      : result.usage;
    await recordUsage(client, job, attempt, usage);
    if (result.stopped && usage.costMicros === undefined) {
      // A retired attempt with unknown cost must not be refunded by a later measured retry.
      job.cost_micros = String(Math.max(Number(job.cost_micros), job.budget.costMicros));
      await client.query("UPDATE download_jobs SET cost_micros=$2 WHERE id=$1", [job.id, job.cost_micros]);
    }
    if (!result.stopped) {
      const phase = result.recovery ? "recovering" : "stopping";
      await client.query("UPDATE download_jobs SET phase=$2,updated_at=NOW() WHERE id=$1", [job.id, phase]);
      await client.query("UPDATE download_attempts SET phase=$2 WHERE id=$1", [attempt.id, phase]);
      await client.query("UPDATE download_slots SET state='quarantined',updated_at=NOW() WHERE id=$1", [token.slotId]);
      return { accepted: true, state: job.state };
    }
    const now = await clock(client);
    const cancel = job.state === "cancelling" || result.outcome === "cancelled";
    const inspectionExpires = new Date(
      Math.min(now.getTime() + 600_000, Date.parse(`${job.admission_day}T00:00:00.000Z`) + 86_400_000),
    );
    const exhausted =
      Number(job.work_ms) > job.budget.workMs ||
      Number(job.source_bytes) > job.budget.sourceBytes ||
      attempt.deadline <= now ||
      (result.outcome === "ready" &&
        (Number(job.work_ms) >= job.budget.workMs ||
          Number(job.source_bytes) >= job.budget.sourceBytes ||
          inspectionExpires <= now));
    const retry =
      !cancel &&
      result.outcome === "retry" &&
      !exhausted &&
      Number(job.work_ms) < job.budget.workMs &&
      Number(job.source_bytes) < job.budget.sourceBytes &&
      job.engine_starts < job.budget.engineStarts &&
      job.queue_expires_at > now;
    const succeed =
      !cancel && !exhausted && result.outcome === "succeeded" && job.phase !== "stopping" && job.phase !== "recovering";
    const ready =
      !cancel && !exhausted && result.outcome === "ready" && job.phase !== "stopping" && job.phase !== "recovering";
    let inspection: DownloadInspection | null = null;
    if (ready) {
      const parsed = downloadInspectionSchema.safeParse(result.inspection);
      const source = parsePlatformUrl(job.platform, result.sourceUrl ?? "");
      const original = parsePlatformUrl(job.platform, job.source_url ?? "");
      if (
        !job.inspect ||
        job.selected_format ||
        result.artifacts?.length ||
        !parsed.success ||
        source.status !== "supported" ||
        source.source.url !== result.sourceUrl ||
        original.status === "unsupported" ||
        (original.status === "supported" && original.source.id !== source.source.id) ||
        parsed.data.formats.some((format) => Math.min(format.width, format.height) > Number(job.quality))
      )
        throw new DownloadError("INVALID_INSPECTION", "No valid video formats were provided.");
      inspection = parsed.data;
    }
    const state: DownloadState = cancel
      ? "cancelled"
      : retry
        ? "queued"
        : succeed
          ? "succeeded"
          : ready
            ? "ready"
            : "failed";
    const expires = succeed ? new Date(now.getTime() + job.budget.retentionMs) : ready ? inspectionExpires : null;
    if (succeed) {
      if (
        !result.artifacts?.length ||
        result.artifacts.length > 5 ||
        result.artifacts.reduce((sum, file) => sum + file.sizeBytes, 0) > 500 * 1024 * 1024 ||
        new Set(result.artifacts.map((file) => file.id)).size !== result.artifacts.length ||
        new Set(result.artifacts.map((file) => file.storageKey)).size !== result.artifacts.length
      )
        throw new DownloadError("INVALID_ARTIFACT", "No valid completed files were provided.");
      for (const artifact of result.artifacts) {
        if (
          !uuid.test(artifact.id) ||
          !artifact.storageKey.startsWith(`sealed/${job.id}/${token.generation}/`) ||
          !/^sealed\/[a-zA-Z0-9_/-]+$/.test(artifact.storageKey) ||
          artifact.storageKey.length > 256 ||
          !artifact.filename ||
          artifact.filename.length > 240 ||
          /[\x00-\x1f\x7f/\\]/.test(artifact.filename) ||
          !["video/mp4", "video/webm", "video/quicktime"].includes(artifact.mimeType) ||
          !Number.isSafeInteger(artifact.sizeBytes) ||
          artifact.sizeBytes <= 0 ||
          artifact.sizeBytes > 250 * 1024 * 1024 ||
          !artifact.etag ||
          artifact.etag.length > 200 ||
          /[\x00-\x1f\x7f]/.test(artifact.etag)
        )
          throw new DownloadError("INVALID_ARTIFACT", "The completed file is invalid.");
        const metadata = {
          width: artifact.metadata?.width ?? null,
          height: artifact.metadata?.height ?? null,
          durationSeconds: artifact.metadata?.durationSeconds ?? null,
          hasAudio: artifact.metadata?.hasAudio === true,
        };
        await client.query(
          "INSERT INTO download_artifacts(id,job_id,attempt_id,storage_key,filename,mime_type,size_bytes,etag,metadata,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
          [
            artifact.id,
            job.id,
            attempt.id,
            artifact.storageKey,
            artifact.filename,
            artifact.mimeType,
            artifact.sizeBytes,
            artifact.etag,
            JSON.stringify(metadata),
            expires,
          ],
        );
      }
    }
    await movePermits(client, job, "active", retry ? "queued" : undefined);
    if (!retry) await settleBudget(client, job, { ...usage, sourceBytes: Number(job.source_bytes) });
    await client.query("UPDATE download_attempts SET stopped_at=NOW(),phase=$2 WHERE id=$1", [attempt.id, state]);
    await client.query(
      "UPDATE download_slots SET state=CASE WHEN state='draining' THEN 'draining' ELSE 'idle' END,attempt_id=NULL,lease_expires_at=NULL,updated_at=NOW() WHERE id=$1",
      [token.slotId],
    );
    const error =
      state === "failed"
        ? (result.error ?? {
            code: exhausted ? "WORK_BUDGET" : "DOWNLOAD_FAILED",
            message: exhausted ? "This download reached its processing limit." : "The download could not be completed.",
            retryable: !exhausted,
          })
        : null;
    await client.query(
      "UPDATE download_jobs SET state=$2,phase=$3,error=$4,expires_at=$5,dispatch_version=dispatch_version+$6,dispatch_due_at=$7,next_eligible_at=$8,source_url=CASE WHEN $2='ready' THEN $10 WHEN $2='queued' THEN source_url ELSE NULL END,inspection=CASE WHEN $2='ready' THEN $9::jsonb WHEN $2 IN ('failed','cancelled') THEN NULL ELSE inspection END,updated_at=NOW() WHERE id=$1",
      [
        job.id,
        state,
        retry ? "queued" : null,
        error ? JSON.stringify(error) : null,
        expires,
        retry ? 1 : 0,
        retry ? new Date(now.getTime() + 10_000) : null,
        retry ? new Date(now.getTime() + 10_000) : now,
        inspection ? JSON.stringify(inspection) : null,
        ready ? result.sourceUrl : null,
      ],
    );
    return { accepted: true, state };
  });
}
export async function listStaleDownloadAttempts(
  limit = 100,
): Promise<{ token: DownloadAttemptToken; deadline: string; heartbeatAt: string; phase: string }[]> {
  const { rows } = await sqlClient.query<AttemptRow>(
    "SELECT a.* FROM download_attempts a JOIN download_slots s ON s.attempt_id=a.id JOIN download_jobs j ON j.id=a.job_id AND j.generation=a.generation WHERE a.stopped_at IS NULL AND (s.lease_expires_at<=NOW() OR a.deadline<=NOW() OR j.state='cancelling' OR s.state='quarantined') ORDER BY a.heartbeat_at LIMIT $1",
    [Math.max(1, Math.min(500, limit))],
  );
  return rows.map((row) => ({
    token: {
      jobId: row.job_id,
      attemptId: row.id,
      generation: row.generation,
      slotId: row.slot_id,
      slotGeneration: row.slot_generation,
    },
    deadline: row.deadline.toISOString(),
    heartbeatAt: row.heartbeat_at.toISOString(),
    phase: row.phase,
  }));
}
export async function expireDownloadArtifacts(limit = 100): Promise<{ artifactId: string; storageKey: string }[]> {
  // Authorization always checks timestamps; this transition and deletion can safely lag.
  await sqlClient.query(
    "UPDATE download_jobs SET state='expired',phase=NULL,source_url=NULL,updated_at=NOW() WHERE state='succeeded' AND expires_at<=NOW()",
  );
  const { rows } = await sqlClient.query<{ id: string; storage_key: string }>(
    "SELECT id,storage_key FROM download_artifacts WHERE expires_at<=NOW() AND deleted_at IS NULL ORDER BY expires_at LIMIT $1",
    [Math.max(1, Math.min(500, limit))],
  );
  return rows.map((row) => ({ artifactId: row.id, storageKey: row.storage_key }));
}
export async function markDownloadArtifactDeleted(artifactId: string): Promise<void> {
  await sqlClient.query("UPDATE download_artifacts SET deleted_at=NOW() WHERE id=$1 AND expires_at<=NOW()", [
    artifactId,
  ]);
}

/** Retain safe completed-job/idempotency metadata for thirty days; never prune unsettled ownership. */
export async function pruneDownloadHistory(limit = 100): Promise<{ jobs: number; buckets: number }> {
  const maximum = Math.max(1, Math.min(500, limit));
  const jobs = await withDownloadTransaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT j.id FROM download_jobs j
       WHERE j.state IN ('failed','cancelled','expired') AND j.updated_at<NOW()-INTERVAL '30 days'
         AND NOT EXISTS (SELECT 1 FROM download_attempts a WHERE a.job_id=j.id AND a.stopped_at IS NULL)
         AND NOT EXISTS (SELECT 1 FROM download_artifacts f WHERE f.job_id=j.id AND f.deleted_at IS NULL)
       ORDER BY j.updated_at,j.id FOR UPDATE OF j SKIP LOCKED LIMIT $1`,
      [maximum],
    );
    const ids = rows.map((row) => row.id);
    if (!ids.length) return 0;
    await client.query("DELETE FROM download_artifacts WHERE job_id=ANY($1::text[])", [ids]);
    await client.query("DELETE FROM download_attempts WHERE job_id=ANY($1::text[])", [ids]);
    await client.query("DELETE FROM download_jobs WHERE id=ANY($1::text[])", [ids]);
    return ids.length;
  });
  // A separate phase preserves quota-before-job lock ordering for concurrent cancellation/settlement.
  const { rowCount } = await sqlClient.query(
    `WITH obsolete AS (
      SELECT b.scope,b.period FROM download_quota_buckets b WHERE b.active=0 AND b.queued=0 AND (
        (b.period LIKE 'day:%' AND b.period<'day:'||to_char((NOW() AT TIME ZONE 'UTC')-INTERVAL '32 days','YYYY-MM-DD')
          AND NOT EXISTS (SELECT 1 FROM download_jobs j WHERE j.admission_day=substring(b.period FROM 5) AND j.state IN ('queued','running','ready','cancelling')))
        OR (b.period LIKE 'month:%' AND b.period<'month:'||to_char((NOW() AT TIME ZONE 'UTC')-INTERVAL '2 months','YYYY-MM')
          AND NOT EXISTS (SELECT 1 FROM download_jobs j WHERE j.admission_month=substring(b.period FROM 7) AND j.state IN ('queued','running','ready','cancelling')))
        OR (b.period LIKE 'minute:%' AND b.period<'minute:'||to_char((NOW() AT TIME ZONE 'UTC')-INTERVAL '1 day','YYYY-MM-DD"T"HH24:MI'))
        OR (b.period='live' AND b.scope LIKE 'owner:%'
          AND NOT EXISTS (SELECT 1 FROM download_jobs j WHERE b.scope='owner:'||j.owner_kind||':'||j.owner_id))
      ) ORDER BY b.scope,b.period FOR UPDATE OF b SKIP LOCKED LIMIT $1
    ) DELETE FROM download_quota_buckets b USING obsolete o WHERE b.scope=o.scope AND b.period=o.period`,
    [maximum],
  );
  return { jobs, buckets: rowCount ?? 0 };
}
