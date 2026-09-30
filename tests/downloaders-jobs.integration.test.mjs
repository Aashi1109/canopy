import { beforeAll, afterAll, beforeEach, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { sqlClient, withDatabaseOperation } from "../db/runtime.ts";
import { getDownloadPolicy, saveDownloadPolicy } from "../lib/downloaders/policy.ts";
import {
  admitDownloadJob,
  checkDownloadInspectionAdmission,
  getDownloadJob,
  findDownloadSubmission,
  cancelDownloadJob,
  claimDownloadJob,
  finishDownloadAttempt,
  markDownloadDispatched,
  getArtifactForOwner,
  consumeDownloadEngineStart,
  heartbeatDownloadAttempt,
  listStaleDownloadAttempts,
  deferDownloadJob,
  expireDownloadArtifacts,
  markDownloadArtifactDeleted,
  beginDownloadRecovery,
  claimDueDownloadDispatches,
  pruneDownloadHistory,
  expireQueuedDownloadJobs,
  selectDownloadFormat,
} from "../lib/downloaders/jobs.ts";

// This test never reads DATABASE_URL or populated application environment files.
const disposableUrl = process.env.DOWNLOADERS_TEST_DATABASE_URL;
const verifiedPosts = [
  ["x", "https://x.com/i/status/1575560063510810624"],
  ["pinterest", "https://www.pinterest.com/pin/1084663891475263837/"],
  ["reddit", "https://www.reddit.com/r/videos/comments/1abc123/"],
  ["linkedin", "https://www.linkedin.com/feed/update/urn:li:activity:1234567890123456789/"],
];
const limits = {
  enabled: true,
  enabledPlatforms: ["youtube", "instagram", ...verifiedPosts.map(([platform]) => platform)],
  globalDailyJobs: 1000,
  networkDailyJobs: 100,
  globalQueued: 100,
  platformActive: 8,
  platformStartsPerMinute: 100,
  globalDailyBytes: 100_000_000,
  globalMonthlyBytes: 500_000_000,
  globalDailyCostMicros: 100_000,
  jobSourceBytes: 1000,
  jobCostMicros: 10,
  maxWorkMs: 180000,
  maxEngineStarts: 2,
  maxQueueAgeMs: 600000,
  retentionMs: 86400000,
  leaseMs: 60000,
};
const owner = { kind: "guest", id: "guest-one" };
const input = () => ({
  platform: "youtube",
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  quality: "1080",
  requestId: randomUUID(),
});
let admin, scopedUrl, schema;
const run = (operation) => withDatabaseOperation(operation, scopedUrl);
const admit = (body = input(), who = owner, overrides = {}) =>
  run(() => admitDownloadJob(who, body, { networkHash: "network-fixture", limits: { ...limits, ...overrides } }));
const preflight = (body = { ...input(), inspect: true }, who = owner, overrides = {}) =>
  run(() =>
    checkDownloadInspectionAdmission(who, body, {
      networkHash: "network-fixture",
      limits: { ...limits, ...overrides },
    }),
  );
const admitInspection = (
  metadata,
  body = { ...input(), inspect: true },
  who = owner,
  overrides = {},
  inspectionUsage,
) =>
  run(() =>
    admitDownloadJob(who, body, {
      networkHash: "network-fixture",
      limits: { ...limits, ...overrides },
      inspection: metadata,
      inspectionUsage,
    }),
  );
const claim = (job) => run(() => claimDownloadJob(job.id, 1, { slotIds: ["slot-0", "slot-1"], limits }));
const inspection = {
  title: "Fixture video",
  durationSeconds: 30,
  formats: [
    {
      id: "137+140",
      container: "mp4",
      width: 1920,
      height: 1080,
      fps: 30,
      bytes: 500,
      estimatedBytes: true,
      hasAudio: true,
      requiresMerge: true,
      videoCodec: "avc1",
    },
    {
      id: "18",
      container: "mp4",
      width: 640,
      height: 360,
      fps: 30,
      bytes: 300,
      estimatedBytes: false,
      hasAudio: true,
      requiresMerge: false,
      videoCodec: "avc1",
    },
  ],
};
const inspectionUsage = { workMs: 1000, sourceBytes: 100, costMicros: 3 };
async function inspectedJob(overrides = {}) {
  const job = await admit({ ...input(), inspect: true });
  const started = await claim(job);
  await run(() => consumeDownloadEngineStart(started.token));
  await run(() =>
    finishDownloadAttempt(started.token, {
      outcome: "ready",
      stopped: true,
      inspection,
      sourceUrl: input().url,
      usage: inspectionUsage,
      ...overrides,
    }),
  );
  return { job: await run(() => getDownloadJob(owner, job.id)), started };
}
const select = (job, id = "137+140", overrides = {}, who = owner) =>
  run(() => selectDownloadFormat(who, job.id, id, { ...limits, ...overrides }));
const globalBudget = async () =>
  (
    await admin.query(
      "SELECT reserved_bytes,reserved_cost_micros FROM download_quota_buckets WHERE scope='global' AND period LIKE 'day:%'",
    )
  ).rows[0];
const ownerPermits = async () =>
  (
    await admin.query(
      "SELECT active,queued FROM download_quota_buckets WHERE scope='owner:guest:guest-one' AND period='live'",
    )
  ).rows[0];

describe.skipIf(!disposableUrl)("durable downloader PostgreSQL behavior", () => {
  beforeAll(async () => {
    schema = `download_test_${randomUUID().replaceAll("-", "")}`;
    admin = new pg.Client({ connectionString: disposableUrl });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`SET search_path TO ${schema}`);
    await admin.query(
      await readFile(new URL("../db/migration/0001-baseline/0001_auth_control_plane.sql", import.meta.url), "utf8"),
    );
    await admin.query(
      await readFile(new URL("../db/migration/0001-baseline/0002_media_tools.sql", import.meta.url), "utf8"),
    );
    await admin.query(
      await readFile(
        new URL("../db/migration/0009-media-downloaders/0001_media_downloaders.sql", import.meta.url),
        "utf8",
      ),
    );
    await admin.query(
      await readFile(
        new URL("../db/migration/0010-download-format-inspection/0001_download_format_inspection.sql", import.meta.url),
        "utf8",
      ),
    );
    await admin.query(
      await readFile(
        new URL("../db/migration/0011-download-inspection-cache/0001_download_inspection_cache.sql", import.meta.url),
        "utf8",
      ),
    );
    const url = new URL(disposableUrl);
    url.searchParams.set("options", `-c search_path=${schema}`);
    scopedUrl = url.toString();
    await admin.query(
      "INSERT INTO auth_users (id,name,email) VALUES ('admin-fixture','Admin','admin-fixture@example.test')",
    );
    await admin.query(
      "INSERT INTO user_roles (user_id,role_id) VALUES ('admin-fixture','admin') ON CONFLICT DO NOTHING",
    );
    await admin.query(
      "INSERT INTO managed_tools (tool_id,app,slug,name,description,sort_order,enabled) VALUES ('media.youtube-video-downloader','media','youtube-video-downloader','YouTube','Fixture',900,true),('media.instagram-video-downloader','media','instagram-video-downloader','Instagram','Fixture',901,true)",
    );
    for (const [platform] of verifiedPosts) {
      await admin.query(
        "INSERT INTO managed_tools (tool_id,app,slug,name,description,sort_order,enabled) VALUES ($1,'media',$2,$3,'Fixture',902,true)",
        [`media.${platform}-video-downloader`, `${platform}-video-downloader`, platform],
      );
    }
  });
  beforeEach(async () => {
    await admin.query(
      "TRUNCATE download_artifacts, download_attempts, download_slots, download_jobs, download_quota_buckets CASCADE",
    );
    await admin.query(
      "UPDATE download_policies SET version=1, guest_daily=10,guest_active=1,guest_queued=2,account_daily=10,account_active=1,account_queued=2",
    );
  });
  afterAll(async () => {
    if (!admin) return;
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  test("job responses identify inspection before metadata is available", async () => {
    const direct = await admit();
    expect(direct).toMatchObject({ state: "queued", inspect: false });
    const inspecting = await admit({ ...input(), inspect: true });
    expect(inspecting).toMatchObject({ state: "queued", inspect: true, inspection: null, selectedFormat: null });
    expect(await claim(inspecting)).toMatchObject({ status: "claimed" });
    expect(await run(() => getDownloadJob(owner, inspecting.id))).toMatchObject({
      state: "running",
      inspect: true,
      inspection: null,
      selectedFormat: null,
    });
  });
  test("inspection releases its slot and selection resumes the same admission with remaining budgets", async () => {
    const { job, started } = await inspectedJob();
    expect(job).toMatchObject({ state: "ready", inspect: true, inspection, selectedFormat: null, artifacts: [] });
    expect(await ownerPermits()).toEqual({ active: 0, queued: 0 });
    expect(await globalBudget()).toEqual({ reserved_bytes: "100", reserved_cost_micros: "3" });
    expect(
      (await admin.query("SELECT state,attempt_id FROM download_slots WHERE id=$1", [started.token.slotId])).rows[0],
    ).toEqual({ state: "idle", attempt_id: null });
    const databaseNow = (await admin.query("SELECT clock_timestamp() AS now")).rows[0].now;
    expect(new Date(job.expiresAt).getTime()).toBeLessThanOrEqual(databaseNow.getTime() + 600_000);
    const midnight = Date.parse(`${job.createdAt.slice(0, 10)}T00:00:00.000Z`) + 86_400_000;
    expect(new Date(job.expiresAt).getTime()).toBeLessThanOrEqual(midnight);
    expect(await claim(job)).toEqual({ status: "terminal" });
    expect(
      await run(() =>
        finishDownloadAttempt(started.token, {
          outcome: "ready",
          stopped: true,
          inspection,
          sourceUrl: input().url,
          usage: inspectionUsage,
        }),
      ),
    ).toEqual({ accepted: false });
    const selected = await select(job, "137+140", {
      globalDailyBytes: 1000,
      globalMonthlyBytes: 1000,
      globalDailyCostMicros: 10,
    });
    expect(selected).toMatchObject({
      id: job.id,
      state: "queued",
      inspect: true,
      selectedFormat: "137+140",
      expiresAt: null,
    });
    expect(await ownerPermits()).toEqual({ active: 0, queued: 1 });
    expect(await globalBudget()).toEqual({ reserved_bytes: "1000", reserved_cost_micros: "10" });
    expect(
      (
        await admin.query(
          "SELECT admitted FROM download_quota_buckets WHERE scope='owner:guest:guest-one' AND period LIKE 'day:%'",
        )
      ).rows[0].admitted,
    ).toBe(1);
    expect(await claim(job)).toEqual({ status: "stale" });
    const second = await run(() => claimDownloadJob(job.id, 2, { slotIds: ["slot-0", "slot-1"], limits }));
    expect(second).toMatchObject({
      status: "claimed",
      remaining: { workMs: 179000, sourceBytes: 900, engineStarts: 2 },
      input: { inspect: true, selectedFormat: "137+140", expectedFormat: inspection.formats[0] },
    });
    expect(await run(() => consumeDownloadEngineStart(second.token))).toEqual({
      allowed: true,
      remaining: 1,
      ordinal: 2,
    });
    expect(await run(() => consumeDownloadEngineStart(second.token))).toEqual({
      allowed: true,
      remaining: 0,
      ordinal: 3,
    });
    expect(await run(() => consumeDownloadEngineStart(second.token))).toEqual({ allowed: false, remaining: 0 });
    await run(() =>
      finishDownloadAttempt(second.token, {
        outcome: "failed",
        stopped: true,
        usage: { workMs: 2000, sourceBytes: 200, costMicros: 4 },
      }),
    );
    expect(await globalBudget()).toEqual({ reserved_bytes: "300", reserved_cost_micros: "7" });
    expect(
      (await admin.query("SELECT work_ms,source_bytes,engine_starts FROM download_jobs WHERE id=$1", [job.id])).rows[0],
    ).toEqual({ work_ms: "3000", source_bytes: "300", engine_starts: 3 });
  });
  test("selection grants two download starts once after inspection uses both starts, without resetting cumulative budgets", async () => {
    const job = await admit({ ...input(), inspect: true });
    const inspecting = await claim(job);
    await run(() => consumeDownloadEngineStart(inspecting.token));
    expect(await run(() => consumeDownloadEngineStart(inspecting.token))).toEqual({
      allowed: true,
      remaining: 0,
      ordinal: 2,
    });
    expect(await run(() => consumeDownloadEngineStart(inspecting.token))).toEqual({ allowed: false, remaining: 0 });
    await run(() =>
      finishDownloadAttempt(inspecting.token, {
        outcome: "ready",
        stopped: true,
        inspection,
        sourceUrl: input().url,
        usage: inspectionUsage,
      }),
    );
    const before = (await admin.query("SELECT budget FROM download_jobs WHERE id=$1", [job.id])).rows[0].budget;
    const selections = await Promise.all([select(job), select(job)]);
    expect(selections[0]).toMatchObject({ state: "queued", selectedFormat: "137+140" });
    expect(selections[1]).toEqual(selections[0]);
    expect(
      (
        await admin.query(
          "SELECT budget,engine_starts,work_ms,source_bytes,cost_micros FROM download_jobs WHERE id=$1",
          [job.id],
        )
      ).rows[0],
    ).toEqual({
      budget: { ...before, engineStarts: 4 },
      engine_starts: 2,
      work_ms: "1000",
      source_bytes: "100",
      cost_micros: "3",
    });
    const first = await run(() => claimDownloadJob(job.id, 2, { slotIds: ["slot-0", "slot-1"], limits }));
    expect(first.remaining).toEqual({ workMs: 179000, sourceBytes: 900, engineStarts: 2 });
    expect(await run(() => consumeDownloadEngineStart(first.token))).toEqual({
      allowed: true,
      remaining: 1,
      ordinal: 3,
    });
    await run(() =>
      finishDownloadAttempt(first.token, {
        outcome: "retry",
        stopped: true,
        usage: { workMs: 1000, sourceBytes: 100, costMicros: 2 },
      }),
    );
    await select(job); // An idempotent selection after a retry cannot replenish the phase allowance.
    await run(() => deferDownloadJob(job.id, 3, 0));
    const last = await run(() => claimDownloadJob(job.id, 3, { slotIds: ["slot-0", "slot-1"], limits }));
    expect(last.remaining).toEqual({ workMs: 178000, sourceBytes: 800, engineStarts: 1 });
    expect(await run(() => consumeDownloadEngineStart(last.token))).toEqual({
      allowed: true,
      remaining: 0,
      ordinal: 4,
    });
    await select(job);
    expect(await run(() => consumeDownloadEngineStart(last.token))).toEqual({ allowed: false, remaining: 0 });
    await admin.query("UPDATE download_slots SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [
      last.token.slotId,
    ]);
    expect(await run(() => beginDownloadRecovery(last.token))).toBe(true);
    await select(job);
    expect(
      await run(() =>
        finishDownloadAttempt(last.token, {
          outcome: "retry",
          stopped: true,
          recovery: true,
          usage: { workMs: 2000, sourceBytes: 100, costMicros: 2 },
        }),
      ),
    ).toEqual({ accepted: true, state: "failed" });
    expect(
      (
        await admin.query(
          "SELECT budget,engine_starts,work_ms,source_bytes,cost_micros FROM download_jobs WHERE id=$1",
          [job.id],
        )
      ).rows[0],
    ).toEqual({
      budget: { ...before, engineStarts: 4 },
      engine_starts: 4,
      work_ms: "4000",
      source_bytes: "300",
      cost_micros: "7",
    });
    expect(await globalBudget()).toEqual({ reserved_bytes: "300", reserved_cost_micros: "7" });
  });
  test("recent inspection reuse creates an owned job without another attempt, permit or reservation", async () => {
    const { job: source } = await inspectedJob();
    const recipient = { kind: "guest", id: "cache-recipient" };
    const body = { ...input(), inspect: true };
    const preparation = await preflight(body, recipient);
    expect(preparation.job).toBeUndefined();
    expect(preparation.inspection.value).toEqual(inspection);
    const reused = await admitInspection(preparation.inspection, body, recipient);
    expect(reused).toMatchObject({
      requestId: body.requestId,
      state: "ready",
      phase: null,
      inspection,
      artifacts: [],
      selectedFormat: null,
    });
    expect(reused.id).not.toBe(source.id);
    await expect(run(() => getDownloadJob(owner, reused.id))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(run(() => getDownloadJob(recipient, source.id))).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(
      (
        await admin.query(
          "SELECT owner_id,work_ms,source_bytes,cost_micros,engine_starts,dispatch_due_at FROM download_jobs WHERE id=$1",
          [reused.id],
        )
      ).rows[0],
    ).toEqual({
      owner_id: recipient.id,
      work_ms: "0",
      source_bytes: "0",
      cost_micros: "0",
      engine_starts: 0,
      dispatch_due_at: null,
    });
    expect((await admin.query("SELECT count(*) FROM download_attempts")).rows[0].count).toBe("1");
    expect(await globalBudget()).toEqual({ reserved_bytes: "100", reserved_cost_micros: "3" });
    expect((await run(() => claimDueDownloadDispatches())).some((entry) => entry.jobId === reused.id)).toBe(false);
    expect((await admit(body, recipient, { enabled: false })).id).toBe(reused.id);
    expect((await preflight(body, recipient, { enabled: false, globalDailyJobs: 1, networkDailyJobs: 1 })).job).toEqual(
      reused,
    );
    await expect(preflight({ ...body, quality: "720" }, recipient, { enabled: false })).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
    expect(
      (
        await admin.query("SELECT admitted FROM download_quota_buckets WHERE scope=$1 AND period LIKE 'day:%'", [
          `owner:guest:${recipient.id}`,
        ])
      ).rows[0].admitted,
    ).toBe(1);
    expect((await select(reused, "137+140", {}, recipient)).state).toBe("queued");
    expect(await globalBudget()).toEqual({ reserved_bytes: "1100", reserved_cost_micros: "13" });
    expect(await run(() => claimDownloadJob(reused.id, 2, { slotIds: ["slot-0"], limits }))).toMatchObject({
      status: "claimed",
      remaining: { workMs: limits.maxWorkMs, sourceBytes: 1000, engineStarts: 2 },
      input: { selectedFormat: "137+140", expectedFormat: inspection.formats[0] },
    });
  });
  test("inspection preflight works in read-only transactions and changes no admission state", async () => {
    const readonlyUrl = new URL(scopedUrl);
    readonlyUrl.searchParams.set("options", `-c search_path=${schema} -c default_transaction_read_only=on`);
    await withDatabaseOperation(
      () =>
        checkDownloadInspectionAdmission(
          owner,
          { ...input(), inspect: true },
          {
            networkHash: "network-fixture",
            limits,
          },
        ),
      readonlyUrl.toString(),
    );
    expect((await admin.query("SELECT count(*) FROM download_jobs")).rows[0].count).toBe("0");
    expect((await admin.query("SELECT count(*) FROM download_quota_buckets")).rows[0].count).toBe("0");
    await expect(preflight(input())).rejects.toMatchObject({ code: "INVALID_INSPECTION" });
    await expect(
      preflight({ ...input(), inspect: true, url: `${input().url}&utm_source=fixture` }),
    ).rejects.toMatchObject({ code: "INVALID_INSPECTION" });
    await expect(
      preflight({ ...input(), inspect: true, platform: "instagram", url: "https://www.instagram.com/p/AbC123xyz/" }),
    ).rejects.toMatchObject({ code: "INVALID_INSPECTION" });
  });
  test("inspection preflight rejects unavailable tools and exhausted owner, network and global daily quotas", async () => {
    await expect(preflight(undefined, owner, { enabled: false })).rejects.toMatchObject({
      code: "PLATFORM_UNAVAILABLE",
    });
    await expect(preflight(undefined, owner, { enabledPlatforms: [] })).rejects.toMatchObject({
      code: "PLATFORM_UNAVAILABLE",
    });
    await admin.query("UPDATE managed_tools SET archived=true WHERE tool_id='media.youtube-video-downloader'");
    try {
      await expect(preflight()).rejects.toMatchObject({ code: "PLATFORM_UNAVAILABLE" });
    } finally {
      await admin.query("UPDATE managed_tools SET archived=false WHERE tool_id='media.youtube-video-downloader'");
    }
    await admit();
    await admin.query("UPDATE download_policies SET guest_daily=1");
    await expect(preflight()).rejects.toMatchObject({ code: "DOWNLOAD_QUOTA" });
    await expect(preflight(undefined, { kind: "guest", id: "other" }, { networkDailyJobs: 1 })).rejects.toMatchObject({
      code: "DOWNLOAD_QUOTA",
    });
    await expect(preflight(undefined, { kind: "guest", id: "other" }, { globalDailyJobs: 1 })).rejects.toMatchObject({
      code: "DOWNLOAD_QUOTA",
    });
    expect((await admin.query("SELECT count(*) FROM download_jobs")).rows[0].count).toBe("1");
  });
  test.each(["day", "month"])(
    "inspection preflight blocks fresh lookup at the global %s byte limit without charging admission",
    async (period) => {
      await admit();
      const capped = period === "day" ? { globalDailyBytes: 1000 } : { globalMonthlyBytes: 1000 };
      await expect(preflight(undefined, { kind: "guest", id: "byte-capped" }, capped)).rejects.toMatchObject({
        code: "DOWNLOAD_QUOTA",
      });
      expect(await globalBudget()).toEqual({ reserved_bytes: "1000", reserved_cost_micros: "10" });
      expect((await admin.query("SELECT count(*) FROM download_jobs")).rows[0].count).toBe("1");
    },
  );
  test("exhausted byte budgets still allow existing-job replay and metadata reuse that needs no transfer", async () => {
    const { job } = await inspectedJob();
    const capped = { globalDailyBytes: 100, globalMonthlyBytes: 100 };
    expect((await preflight({ ...input(), inspect: true, requestId: job.requestId }, owner, capped)).job.id).toBe(
      job.id,
    );
    const body = { ...input(), inspect: true };
    const recipient = { kind: "guest", id: "cached-at-byte-cap" };
    expect((await preflight(body, recipient, capped)).inspection.value).toEqual(inspection);
    await admin.query("UPDATE download_jobs SET expires_at=clock_timestamp()-INTERVAL '1 second' WHERE id=$1", [
      job.id,
    ]);
    await expect(preflight(body, recipient, capped)).rejects.toMatchObject({ code: "DOWNLOAD_QUOTA" });
  });
  test("supplied inspection creates an owned ready job with bounded expiry and reserves execution only on selection", async () => {
    const before = (await admin.query("SELECT clock_timestamp() AS now")).rows[0].now;
    const expiresAt = new Date(before.getTime() + 600_000);
    const body = { ...input(), inspect: true };
    const job = await admitInspection({ value: inspection, expiresAt }, body);
    expect(job).toMatchObject({ state: "ready", inspection, phase: null, artifacts: [] });
    const after = (await admin.query("SELECT clock_timestamp() AS now")).rows[0].now;
    expect(Date.parse(job.expiresAt)).toBeLessThanOrEqual(after.getTime() + 120_000);
    expect(Date.parse(job.expiresAt)).toBeLessThanOrEqual(
      Date.parse(`${job.createdAt.slice(0, 10)}T00:00:00.000Z`) + 86_400_000,
    );
    expect(Date.parse(job.expiresAt)).toBeGreaterThan(before.getTime() + 15_000);
    expect(await globalBudget()).toEqual({ reserved_bytes: "0", reserved_cost_micros: "0" });
    expect(await ownerPermits()).toEqual({ active: 0, queued: 0 });
    expect((await admin.query("SELECT count(*) FROM download_attempts")).rows[0].count).toBe("0");
    expect((await admitInspection({ value: {}, expiresAt: new Date(NaN) }, body, owner, { enabled: false })).id).toBe(
      job.id,
    );
    await expect(admitInspection({ value: inspection, expiresAt }, { ...body, quality: "720" })).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
    await select(job);
    expect(await globalBudget()).toEqual({ reserved_bytes: "1000", reserved_cost_micros: "10" });
    expect(await run(() => claimDownloadJob(job.id, 2, { slotIds: ["slot-0"], limits }))).toMatchObject({
      status: "claimed",
      remaining: { workMs: limits.maxWorkMs, sourceBytes: 1000, engineStarts: 2 },
    });
  });
  test.each(["schema", "height", "bytes", "duration", "expiry", "non-inspection", "noncanonical"])(
    "invalid supplied inspection %s fails without an admission charge",
    async (invalid) => {
      const value = structuredClone(inspection);
      let expiresAt = new Date(Date.now() + 120_000);
      const body = { ...input(), inspect: true };
      if (invalid === "schema") value.secret = "not-permitted";
      if (invalid === "height") Object.assign(value.formats[0], { width: 3840, height: 2160 });
      if (invalid === "bytes") value.formats[0].bytes = 1001;
      if (invalid === "duration") value.durationSeconds = 1801;
      if (invalid === "expiry") expiresAt = new Date(NaN);
      if (invalid === "non-inspection") body.inspect = false;
      if (invalid === "noncanonical") body.url += "&utm_source=fixture";
      await expect(admitInspection({ value, expiresAt }, body)).rejects.toMatchObject({ code: "INVALID_INSPECTION" });
      expect((await admin.query("SELECT count(*) FROM download_jobs")).rows[0].count).toBe("0");
      expect((await admin.query("SELECT count(*) FROM download_quota_buckets")).rows[0].count).toBe("0");
    },
  );
  test("supplied expiry is never extended and stale metadata falls back to cached or queued inspection", async () => {
    const expiry = new Date(Date.now() + 60_000);
    const job = await admitInspection({ value: inspection, expiresAt: expiry });
    expect(job.expiresAt).toBe(expiry.toISOString());
    const reused = await admitInspection({ value: inspection, expiresAt: new Date(Date.now() - 1) }, undefined, {
      kind: "guest",
      id: "cached-fallback",
    });
    expect(reused.state).toBe("ready");
    expect(reused.expiresAt).toBe(job.expiresAt);
    const queued = await admitInspection(
      { value: inspection, expiresAt: new Date(Date.now() + 10_000) },
      { ...input(), inspect: true, url: "https://www.youtube.com/watch?v=jNQXAC9IVRw" },
    );
    expect(queued.state).toBe("queued");
  });
  test("successful metadata preflights cannot race past final atomic daily admission", async () => {
    await admin.query("UPDATE download_policies SET guest_daily=1");
    const bodies = [
      { ...input(), inspect: true },
      { ...input(), inspect: true },
    ];
    await Promise.all(bodies.map((body) => preflight(body)));
    const results = await Promise.allSettled(
      bodies.map((body) => admitInspection({ value: inspection, expiresAt: new Date(Date.now() + 120_000) }, body)),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected").reason).toMatchObject({ code: "DOWNLOAD_QUOTA" });
    expect(
      (
        await admin.query(
          "SELECT admitted FROM download_quota_buckets WHERE scope='owner:guest:guest-one' AND period LIKE 'day:%'",
        )
      ).rows[0].admitted,
    ).toBe(1);
    expect(await ownerPermits()).toEqual({ active: 0, queued: 0 });
  });
  test("fast inspection bytes are charged once and selection reserves only the unconsumed budget", async () => {
    const body = { ...input(), inspect: true };
    const metadata = { value: inspection, expiresAt: new Date(Date.now() + 120_000) };
    const job = await admitInspection(metadata, body, owner, {}, { sourceBytes: 200, workMs: 40 });
    expect(await globalBudget()).toEqual({ reserved_bytes: "200", reserved_cost_micros: "0" });
    expect(
      (
        await admin.query(
          "SELECT reserved_bytes FROM download_quota_buckets WHERE scope='global' AND period LIKE 'month:%'",
        )
      ).rows[0].reserved_bytes,
    ).toBe("200");
    expect(
      (
        await admin.query("SELECT source_bytes,work_ms,cost_micros,engine_starts FROM download_jobs WHERE id=$1", [
          job.id,
        ])
      ).rows[0],
    ).toEqual({ source_bytes: "200", work_ms: "40", cost_micros: "0", engine_starts: 0 });
    expect(await ownerPermits()).toEqual({ queued: 0, active: 0 });
    expect((await admitInspection(metadata, body, owner, {}, { sourceBytes: -1, workMs: -1 })).id).toBe(job.id);
    expect(await globalBudget()).toEqual({ reserved_bytes: "200", reserved_cost_micros: "0" });
    await select(job);
    expect(await globalBudget()).toEqual({ reserved_bytes: "1000", reserved_cost_micros: "10" });
    const started = await run(() => claimDownloadJob(job.id, 2, { slotIds: ["slot-0"], limits }));
    expect(started.remaining).toEqual({ workMs: limits.maxWorkMs - 40, sourceBytes: 800, engineStarts: 2 });
    await run(() =>
      finishDownloadAttempt(started.token, {
        outcome: "failed",
        stopped: true,
        usage: { workMs: 100, sourceBytes: 100, costMicros: 3 },
      }),
    );
    expect((await admin.query("SELECT work_ms,source_bytes FROM download_jobs WHERE id=$1", [job.id])).rows[0]).toEqual(
      { work_ms: "140", source_bytes: "300" },
    );
    expect(await globalBudget()).toEqual({ reserved_bytes: "300", reserved_cost_micros: "3" });
  });
  test("failed fast lookup usage survives queued fallback and native inspection settlement", async () => {
    const body = { ...input(), inspect: true };
    const job = await admitInspection(undefined, body, owner, {}, { sourceBytes: 250, workMs: 1000 });
    expect(job.state).toBe("queued");
    expect(await globalBudget()).toEqual({ reserved_bytes: "1000", reserved_cost_micros: "10" });
    const started = await claim(job);
    expect(started.remaining).toEqual({ workMs: limits.maxWorkMs - 1000, sourceBytes: 750, engineStarts: 2 });
    await run(() => consumeDownloadEngineStart(started.token));
    await run(() =>
      finishDownloadAttempt(started.token, {
        outcome: "ready",
        stopped: true,
        inspection,
        sourceUrl: body.url,
        usage: { workMs: 400, sourceBytes: 50, costMicros: 1 },
      }),
    );
    expect((await admin.query("SELECT work_ms,source_bytes FROM download_jobs WHERE id=$1", [job.id])).rows[0]).toEqual(
      { work_ms: "1400", source_bytes: "300" },
    );
    expect(await globalBudget()).toEqual({ reserved_bytes: "300", reserved_cost_micros: "1" });
  });
  test.each(["day", "month"])(
    "concurrent fast inspections cannot overcharge the global %s byte quota",
    async (period) => {
      const caps = period === "day" ? { globalDailyBytes: 150 } : { globalMonthlyBytes: 150 };
      const results = await Promise.allSettled(
        [0, 1].map((index) =>
          admitInspection(
            { value: inspection, expiresAt: new Date(Date.now() + 120_000) },
            { ...input(), inspect: true },
            { kind: "guest", id: `http-bytes-${index}` },
            caps,
            { sourceBytes: 100, workMs: 10 },
          ),
        ),
      );
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.find((result) => result.status === "rejected").reason).toMatchObject({ code: "DOWNLOAD_QUOTA" });
      expect(await globalBudget()).toEqual({ reserved_bytes: "100", reserved_cost_micros: "0" });
      expect(
        (
          await admin.query(
            "SELECT reserved_bytes FROM download_quota_buckets WHERE scope='global' AND period LIKE 'month:%'",
          )
        ).rows[0].reserved_bytes,
      ).toBe("100");
      expect((await admin.query("SELECT count(*) FROM download_jobs")).rows[0].count).toBe("1");
    },
  );
  test.each([
    { sourceBytes: -1, workMs: 0 },
    { sourceBytes: 1001, workMs: 0 },
    { sourceBytes: 0.5, workMs: 0 },
    { sourceBytes: 0, workMs: -1 },
    { sourceBytes: 0, workMs: limits.maxWorkMs + 1 },
    { sourceBytes: 0, workMs: 0.5 },
  ])("invalid fast inspection usage %j is rejected without charging admission", async (usage) => {
    await expect(admitInspection(undefined, undefined, owner, {}, usage)).rejects.toMatchObject({
      code: "INVALID_USAGE",
    });
    expect((await admin.query("SELECT count(*) FROM download_jobs")).rows[0].count).toBe("0");
    expect((await admin.query("SELECT count(*) FROM download_quota_buckets")).rows[0].count).toBe("0");
  });
  test("fast lookup retains observed chunk overshoot and rejects exhausted budgets or non-inspection input", async () => {
    await expect(
      admitInspection(undefined, undefined, owner, {}, { sourceBytes: 1000, workMs: 0 }),
    ).rejects.toMatchObject({ code: "WORK_BUDGET" });
    await expect(admitInspection(undefined, input(), owner, {}, { sourceBytes: 1, workMs: 1 })).rejects.toMatchObject({
      code: "INVALID_USAGE",
    });
    const job = await admitInspection(
      undefined,
      undefined,
      owner,
      { jobSourceBytes: 16 * 1024 * 1024 },
      { sourceBytes: 9 * 1024 * 1024, workMs: 2500 },
    );
    expect(job.state).toBe("queued");
    expect((await admin.query("SELECT source_bytes,work_ms FROM download_jobs WHERE id=$1", [job.id])).rows[0]).toEqual(
      { source_bytes: String(9 * 1024 * 1024), work_ms: "2500" },
    );
    expect((await claim(job)).remaining).toEqual({
      sourceBytes: 7 * 1024 * 1024,
      workMs: limits.maxWorkMs - 2500,
      engineStarts: 2,
    });
  });
  test("metadata timeout scheduling overrun is persisted and subtracted from the native work budget", async () => {
    const job = await admitInspection(undefined, undefined, owner, {}, { sourceBytes: 10, workMs: 2501 });
    expect(job.state).toBe("queued");
    expect((await admin.query("SELECT work_ms FROM download_jobs WHERE id=$1", [job.id])).rows[0].work_ms).toBe("2501");
    expect((await claim(job)).remaining).toEqual({
      workMs: limits.maxWorkMs - 2501,
      sourceBytes: 990,
      engineStarts: 2,
    });
    await expect(
      admitInspection(
        undefined,
        undefined,
        { kind: "guest", id: "spent-work" },
        {},
        { sourceBytes: 0, workMs: limits.maxWorkMs },
      ),
    ).rejects.toMatchObject({ code: "WORK_BUDGET" });
  });
  test.each([
    ["instagram", "https://www.instagram.com/reel/AbC123xyz/"],
    ["dailymotion", "https://www.dailymotion.com/video/x9abcde"],
    ["tiktok", "https://www.tiktok.com/@creator/video/7421234567890123456"],
  ])("shared preflight and metadata reuse apply to %s without another source charge", async (platform, url) => {
    await admin.query(
      "INSERT INTO managed_tools(tool_id,app,slug,name,description,sort_order,enabled) VALUES($1,'media',$2,$3,'Fixture',902,true) ON CONFLICT(tool_id) DO UPDATE SET enabled=true",
      [`media.${platform}-video-downloader`, `${platform}-video-downloader`, platform],
    );
    const caps = { enabledPlatforms: [...limits.enabledPlatforms, platform] };
    const body = { ...input(), inspect: true, platform, url };
    expect(await preflight(body, owner, caps)).toEqual({});
    await admitInspection({ value: inspection, expiresAt: new Date(Date.now() + 120_000) }, body, owner, caps, {
      sourceBytes: 100,
      workMs: 10,
    });
    const recipient = { kind: "guest", id: "shared-cache" };
    const repeated = { ...body, requestId: randomUUID() };
    const prepared = await preflight(repeated, recipient, caps);
    expect(prepared.inspection.value).toEqual(inspection);
    expect(
      (await admitInspection(prepared.inspection, repeated, recipient, caps, { sourceBytes: 0, workMs: 0 })).state,
    ).toBe("ready");
    expect(await globalBudget()).toEqual({ reserved_bytes: "100", reserved_cost_micros: "0" });
  });
  test("inspection cache chains inherit expiry without extending the source freshness window", async () => {
    const { job: source } = await inspectedJob();
    await admin.query("UPDATE download_jobs SET updated_at=clock_timestamp()-INTERVAL '20 seconds' WHERE id=$1", [
      source.id,
    ]);
    const origin = (
      await admin.query(
        "SELECT LEAST(expires_at,updated_at+INTERVAL '120 seconds') AS expires FROM download_jobs WHERE id=$1",
        [source.id],
      )
    ).rows[0].expires;
    const first = await admit({ ...input(), inspect: true }, { kind: "guest", id: "cache-first" });
    expect(first.expiresAt).toBe(origin.toISOString());
    await admin.query("UPDATE download_jobs SET updated_at=clock_timestamp()-INTERVAL '121 seconds' WHERE id=$1", [
      source.id,
    ]);
    const second = await admit({ ...input(), inspect: true }, { kind: "guest", id: "cache-second" });
    expect(second.state).toBe("ready");
    expect(second.expiresAt).toBe(first.expiresAt);
    await admin.query(
      "UPDATE download_jobs SET expires_at=clock_timestamp()+INTERVAL '10 seconds' WHERE state='ready'",
    );
    expect((await admit({ ...input(), inspect: true }, { kind: "guest", id: "cache-third" })).state).toBe("queued");
  });
  test("cache hits retain daily admission and current availability checks without consuming queue capacity", async () => {
    await inspectedJob();
    await admit(input(), { kind: "guest", id: "busy-owner" });
    const recipient = { kind: "guest", id: "cache-recipient" };
    await admin.query("UPDATE download_policies SET guest_daily=1");
    expect(
      (await admit({ ...input(), inspect: true }, recipient, { globalQueued: 1, globalDailyBytes: 100 })).state,
    ).toBe("ready");
    await expect(admit({ ...input(), inspect: true }, recipient)).rejects.toMatchObject({ code: "DOWNLOAD_QUOTA" });
    await expect(
      admit({ ...input(), inspect: true }, { kind: "guest", id: "network-capped" }, { networkDailyJobs: 3 }),
    ).rejects.toMatchObject({ code: "DOWNLOAD_QUOTA" });
    await expect(
      admit({ ...input(), inspect: true }, { kind: "guest", id: "globally-capped" }, { globalDailyJobs: 3 }),
    ).rejects.toMatchObject({ code: "DOWNLOAD_QUOTA" });
    await admin.query("UPDATE managed_tools SET enabled=false WHERE tool_id='media.youtube-video-downloader'");
    try {
      await expect(admit({ ...input(), inspect: true }, { kind: "guest", id: "disabled-cache" })).rejects.toMatchObject(
        { code: "PLATFORM_UNAVAILABLE" },
      );
    } finally {
      await admin.query("UPDATE managed_tools SET enabled=true WHERE tool_id='media.youtube-video-downloader'");
    }
  });
  test.each(["stale", "expired", "height", "bytes", "duration", "schema"])(
    "%s inspection metadata is not reused",
    async (invalid) => {
      const { job: source } = await inspectedJob();
      if (invalid === "stale")
        await admin.query("UPDATE download_jobs SET updated_at=clock_timestamp()-INTERVAL '121 seconds' WHERE id=$1", [
          source.id,
        ]);
      else if (invalid === "expired")
        await admin.query("UPDATE download_jobs SET expires_at=clock_timestamp()-INTERVAL '1 second' WHERE id=$1", [
          source.id,
        ]);
      else {
        const value = structuredClone(inspection);
        if (invalid === "height") Object.assign(value.formats[0], { width: 3840, height: 2160 });
        if (invalid === "bytes") value.formats[0].bytes = 250 * 1024 * 1024 + 1;
        if (invalid === "duration") value.durationSeconds = 1801;
        if (invalid === "schema") value.untrusted = "source-owner-field";
        await admin.query("UPDATE download_jobs SET inspection=$2 WHERE id=$1", [source.id, JSON.stringify(value)]);
      }
      const body = { ...input(), inspect: true };
      const who = { kind: "guest", id: "cache-miss" };
      expect(await preflight(body, who)).toEqual({});
      expect((await admit(body, who)).state).toBe("queued");
    },
  );
  test("inspection reuse requires the same quality and canonical full source", async () => {
    await inspectedJob();
    for (const [index, changes] of [
      { quality: "720" },
      { url: "https://www.youtube.com/watch?v=jNQXAC9IVRw" },
      { url: `${input().url}&utm_source=fixture` },
      { inspect: false },
    ].entries()) {
      expect(
        (await admit({ ...input(), inspect: true, ...changes }, { kind: "guest", id: `cache-miss-${index}` })).state,
      ).toBe("queued");
    }
  });
  test("concurrent identical selections queue once, replay through terminal state, and reject changed selection", async () => {
    const { job } = await inspectedJob();
    const selected = await Promise.all(Array.from({ length: 8 }, () => select(job)));
    expect(selected.every((result) => result.id === job.id && result.state === "queued")).toBe(true);
    expect(await ownerPermits()).toEqual({ active: 0, queued: 1 });
    expect(await globalBudget()).toEqual({ reserved_bytes: "1000", reserved_cost_micros: "10" });
    await expect(select(job, "18")).rejects.toMatchObject({ code: "SELECTION_CONFLICT", status: 409 });
    const running = await run(() => claimDownloadJob(job.id, 2, { slotIds: ["slot-0"], limits }));
    expect((await select(job, "137+140", { enabled: false })).state).toBe("running");
    await run(() => cancelDownloadJob(owner, job.id));
    await run(() =>
      finishDownloadAttempt(running.token, {
        outcome: "cancelled",
        stopped: true,
        usage: { workMs: 0, sourceBytes: 0, costMicros: 0 },
      }),
    );
    expect((await select(job)).state).toBe("cancelled");
    await expect(select(job, "18")).rejects.toMatchObject({ code: "SELECTION_CONFLICT" });
  });
  test("different-format selection races have one winner without double reservation", async () => {
    const { job } = await inspectedJob();
    const results = await Promise.allSettled([select(job, "18"), select(job, "137+140")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected").reason.code).toBe("SELECTION_CONFLICT");
    expect(await ownerPermits()).toEqual({ active: 0, queued: 1 });
    expect(await globalBudget()).toEqual({ reserved_bytes: "1000", reserved_cost_micros: "10" });
  });
  test("inspection pins a short link's resolved canonical source for selected execution", async () => {
    const job = await admit({
      ...input(),
      platform: "instagram",
      url: "https://www.instagram.com/share/reel/fixture/",
      inspect: true,
    });
    const started = await claim(job);
    await run(() => consumeDownloadEngineStart(started.token));
    const canonical = "https://www.instagram.com/reel/verified_source/";
    await run(() =>
      finishDownloadAttempt(started.token, {
        outcome: "ready",
        stopped: true,
        sourceUrl: canonical,
        inspection,
        usage: inspectionUsage,
      }),
    );
    const ready = await run(() => getDownloadJob(owner, job.id));
    expect(ready).toMatchObject({ state: "ready", inspection });
    expect(JSON.stringify(ready)).not.toContain(canonical);
    expect(JSON.stringify(ready)).not.toContain("/share/");
    await select(ready);
    const second = await run(() => claimDownloadJob(job.id, 2, { slotIds: ["slot-0"], limits }));
    expect(second).toMatchObject({
      status: "claimed",
      input: {
        url: canonical,
        selectedFormat: "137+140",
        expectedFormat: inspection.formats[0],
      },
    });
  });
  test("ready publication rejects a missing, noncanonical, external, or changed canonical source", async () => {
    const job = await admit({ ...input(), inspect: true });
    const started = await claim(job);
    await run(() => consumeDownloadEngineStart(started.token));
    for (const sourceUrl of [
      undefined,
      "https://youtu.be/dQw4w9WgXcQ",
      "https://example.test/video",
      "https://www.youtube.com/watch?v=aaaaaaaaaaa",
    ]) {
      await expect(
        run(() =>
          finishDownloadAttempt(started.token, {
            outcome: "ready",
            stopped: true,
            sourceUrl,
            inspection,
            usage: inspectionUsage,
          }),
        ),
      ).rejects.toMatchObject({ code: "INVALID_INSPECTION" });
    }
    expect((await run(() => getDownloadJob(owner, job.id))).state).toBe("running");
    expect(await ownerPermits()).toEqual({ active: 1, queued: 0 });
    await run(() =>
      finishDownloadAttempt(started.token, {
        outcome: "ready",
        stopped: true,
        sourceUrl: input().url,
        inspection,
        usage: inspectionUsage,
      }),
    );
    expect((await run(() => getDownloadJob(owner, job.id))).state).toBe("ready");
  });
  test("claim rejects a selected option missing from or inconsistent with stored inspection before allocating a slot", async () => {
    const { job } = await inspectedJob();
    await select(job);
    await admin.query("UPDATE download_jobs SET inspection=$2 WHERE id=$1", [
      job.id,
      JSON.stringify({ ...inspection, formats: [inspection.formats[1]] }),
    ]);
    expect(await run(() => claimDownloadJob(job.id, 2, { slotIds: ["slot-0"], limits }))).toEqual({
      status: "terminal",
    });
    expect((await run(() => getDownloadJob(owner, job.id))).error.code).toBe("FORMAT_UNAVAILABLE");
    expect(
      (await admin.query("SELECT count(*)::int AS count FROM download_attempts WHERE job_id=$1", [job.id])).rows[0]
        .count,
    ).toBe(1);
    expect(await ownerPermits()).toEqual({ active: 0, queued: 0 });
    expect(await globalBudget()).toEqual({ reserved_bytes: "100", reserved_cost_micros: "3" });
  });
  test("format selection enforces ownership, stored options, and current availability", async () => {
    const { job } = await inspectedJob();
    await expect(select(job, "137+140", {}, { kind: "account", id: owner.id })).rejects.toMatchObject({ status: 404 });
    await expect(select(job, "https://media.invalid/video")).rejects.toMatchObject({ code: "INVALID_FORMAT" });
    await expect(select(job, "999")).rejects.toMatchObject({ code: "INVALID_FORMAT" });
    await expect(select(job, "18", { enabled: false })).rejects.toMatchObject({ status: 503 });
    await admin.query("UPDATE managed_tools SET enabled=false WHERE tool_id='media.youtube-video-downloader'");
    try {
      await expect(select(job)).rejects.toMatchObject({ status: 503 });
    } finally {
      await admin.query("UPDATE managed_tools SET enabled=true WHERE tool_id='media.youtube-video-downloader'");
    }
    expect((await run(() => getDownloadJob(owner, job.id))).state).toBe("ready");
    expect(await ownerPermits()).toEqual({ active: 0, queued: 0 });
    expect(await globalBudget()).toEqual({ reserved_bytes: "100", reserved_cost_micros: "3" });
  });
  test("selection checks current queue and remaining budgets without charging a second daily job", async () => {
    const { job } = await inspectedJob();
    const queued = await admit();
    await admit();
    await expect(select(job)).rejects.toMatchObject({ status: 429 });
    await run(() => cancelDownloadJob(owner, queued.id));
    await expect(select(job, "18", { globalDailyBytes: 1999 })).rejects.toMatchObject({ status: 429 });
    await expect(select(job, "18", { globalMonthlyBytes: 1999 })).rejects.toMatchObject({ status: 429 });
    await expect(select(job, "18", { globalDailyCostMicros: 19 })).rejects.toMatchObject({ status: 429 });
    await expect(select(job, "18", { globalQueued: 1 })).rejects.toMatchObject({ status: 429 });
    await admin.query("UPDATE download_policies SET guest_daily=1");
    expect((await select(job, "18")).state).toBe("queued");
    expect(
      (
        await admin.query(
          "SELECT admitted FROM download_quota_buckets WHERE scope='owner:guest:guest-one' AND period LIKE 'day:%'",
        )
      ).rows[0].admitted,
    ).toBe(3);
  });
  test("ready cancellation and expiry settle no budget twice and prevent selection", async () => {
    const cancelled = await inspectedJob();
    expect((await run(() => cancelDownloadJob(owner, cancelled.job.id))).state).toBe("cancelled");
    await run(() => cancelDownloadJob(owner, cancelled.job.id));
    await expect(select(cancelled.job)).rejects.toMatchObject({ status: 409 });
    const expiring = await inspectedJob();
    await admin.query("UPDATE download_jobs SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [expiring.job.id]);
    expect(await run(() => getDownloadJob(owner, expiring.job.id))).toMatchObject({
      state: "expired",
      inspection: null,
    });
    await expect(select(expiring.job)).rejects.toMatchObject({ status: 410 });
    expect(
      (await Promise.all([run(() => expireQueuedDownloadJobs()), run(() => expireQueuedDownloadJobs())])).reduce(
        (sum, count) => sum + count,
        0,
      ),
    ).toBe(1);
    expect(await ownerPermits()).toEqual({ active: 0, queued: 0 });
    expect(await globalBudget()).toEqual({ reserved_bytes: "200", reserved_cost_micros: "6" });
    expect(
      (await admin.query("SELECT source_url,inspection FROM download_jobs WHERE id=$1", [expiring.job.id])).rows[0],
    ).toEqual({ source_url: null, inspection: null });
  });
  test("selection racing cancellation leaves no queued permit or reservation leak", async () => {
    const { job } = await inspectedJob();
    await Promise.allSettled([select(job), run(() => cancelDownloadJob(owner, job.id))]);
    expect((await run(() => getDownloadJob(owner, job.id))).state).toBe("cancelled");
    expect(await ownerPermits()).toEqual({ active: 0, queued: 0 });
    expect(await globalBudget()).toEqual({ reserved_bytes: "100", reserved_cost_micros: "3" });
  });
  test("expired selected queue releases the reacquired reservation and migration replay preserves ready jobs", async () => {
    const { job } = await inspectedJob();
    await admin.query(
      await readFile(
        new URL("../db/migration/0010-download-format-inspection/0001_download_format_inspection.sql", import.meta.url),
        "utf8",
      ),
    );
    expect((await run(() => getDownloadJob(owner, job.id))).inspection).toEqual(inspection);
    await select(job);
    await admin.query("UPDATE download_jobs SET queue_expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [job.id]);
    expect(await run(() => expireQueuedDownloadJobs())).toBe(1);
    expect(await run(() => expireQueuedDownloadJobs())).toBe(0);
    expect((await select(job)).state).toBe("failed");
    expect(await ownerPermits()).toEqual({ active: 0, queued: 0 });
    expect(await globalBudget()).toEqual({ reserved_bytes: "100", reserved_cost_micros: "3" });
  });
  test("inspection requires a stopped valid result and cancellation wins metadata publication", async () => {
    const job = await admit({ ...input(), inspect: true });
    const started = await claim(job);
    await run(() => consumeDownloadEngineStart(started.token));
    const finish = { outcome: "ready", stopped: true, inspection, sourceUrl: input().url, usage: inspectionUsage };
    await expect(
      run(() =>
        finishDownloadAttempt(started.token, {
          ...finish,
          inspection: { ...inspection, formats: [{ ...inspection.formats[0], url: "https://media.invalid" }] },
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_INSPECTION" });
    await expect(
      run(() =>
        finishDownloadAttempt(started.token, {
          ...finish,
          inspection: { ...inspection, formats: [{ ...inspection.formats[0], width: 3840, height: 2160 }] },
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_INSPECTION" });
    await run(() => finishDownloadAttempt(started.token, { ...finish, stopped: false }));
    expect((await run(() => getDownloadJob(owner, job.id))).inspection).toBeNull();
    expect(await ownerPermits()).toEqual({ active: 1, queued: 0 });
    await run(() => cancelDownloadJob(owner, job.id));
    expect(await run(() => finishDownloadAttempt(started.token, finish))).toEqual({
      accepted: true,
      state: "cancelled",
    });
    expect((await run(() => getDownloadJob(owner, job.id))).inspection).toBeNull();
    expect(await ownerPermits()).toEqual({ active: 0, queued: 0 });
  });
  test("inspection can finish on its final allowed start and unknown costs are never refunded", async () => {
    const job = await admit({ ...input(), inspect: true });
    const started = await claim(job);
    await run(() => consumeDownloadEngineStart(started.token));
    await run(() => consumeDownloadEngineStart(started.token));
    expect(
      await run(() =>
        finishDownloadAttempt(started.token, {
          outcome: "ready",
          stopped: true,
          inspection,
          sourceUrl: input().url,
          usage: inspectionUsage,
        }),
      ),
    ).toEqual({ accepted: true, state: "ready" });
    await run(() => cancelDownloadJob(owner, job.id)); // Keep the next inspection from reusing this metadata.
    const unknown = await inspectedJob({ usage: { workMs: 1000, sourceBytes: 100 } });
    expect((await globalBudget()).reserved_cost_micros).toBe("13");
    await select(unknown.job);
    expect((await globalBudget()).reserved_cost_micros).toBe("13");
  });
  test("inspection mode participates in submission identity and cannot accept a user-selected format at admission", async () => {
    const body = { ...input(), inspect: true };
    const job = await admit(body);
    expect((await admit(body)).id).toBe(job.id);
    await expect(admit({ ...body, inspect: false })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(admit({ ...input(), selectedFormat: "18" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(admit({ ...input(), expectedFormat: inspection.formats[0] })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(admit({ ...input(), inspect: "yes" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  test("background database phases await connection cleanup on success and failure", async () => {
    const pid = await run(async () => (await sqlClient.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
    expect((await admin.query("SELECT pid FROM pg_stat_activity WHERE pid=$1", [pid])).rows).toEqual([]);
    let failedPid;
    await expect(
      run(async () => {
        failedPid = (await sqlClient.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
        throw new Error("fixture database phase failed");
      }),
    ).rejects.toThrow("fixture database phase failed");
    expect((await admin.query("SELECT pid FROM pg_stat_activity WHERE pid=$1", [failedPid])).rows).toEqual([]);
  });
  test("concurrent replay returns one admission, and changed input conflicts", async () => {
    const body = input();
    const jobs = await Promise.all(Array.from({ length: 8 }, () => admit(body)));
    expect(new Set(jobs.map((j) => j.id)).size).toBe(1);
    expect(
      (
        await admin.query(
          "SELECT admitted FROM download_quota_buckets WHERE scope='owner:guest:guest-one' AND period LIKE 'day:%'",
        )
      ).rows[0].admitted,
    ).toBe(1);
    await expect(admit({ ...body, quality: "720" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect((await run(() => findDownloadSubmission(owner, body.requestId))).id).toBe(jobs[0].id);
  });
  test("simultaneous admission cannot overshoot the owner queue cap", async () => {
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => admit()));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
  });
  test("overlapping quota batches serialize different owners and platforms without overspending", async () => {
    const requests = Array.from({ length: 12 }, (_, index) => ({
      who: { kind: "guest", id: `batch-owner-${index}` },
      body:
        index % 2 === 0
          ? input()
          : { ...input(), platform: "instagram", url: "https://www.instagram.com/reel/AbC123xyz/" },
    }));
    const results = await Promise.allSettled(requests.map(({ body, who }) => admit(body, who, { globalQueued: 6 })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(6);
    for (const result of results)
      if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "DOWNLOAD_QUOTA" });
    expect(
      (await admin.query("SELECT queued,active FROM download_quota_buckets WHERE scope='global' AND period='live'"))
        .rows[0],
    ).toEqual({ queued: 6, active: 0 });
    expect(await globalBudget()).toEqual({ reserved_bytes: "6000", reserved_cost_micros: "60" });
    await Promise.all(
      results.map((result, index) =>
        result.status === "fulfilled"
          ? run(() => cancelDownloadJob(requests[index].who, result.value.id))
          : Promise.resolve(),
      ),
    );
    expect((await admin.query("SELECT queued,active FROM download_quota_buckets WHERE period='live'")).rows).toEqual(
      expect.arrayContaining([{ queued: 0, active: 0 }]),
    );
    expect(
      (await admin.query("SELECT * FROM download_quota_buckets WHERE period='live' AND (active<>0 OR queued<>0)")).rows,
    ).toEqual([]);
    expect(await globalBudget()).toEqual({ reserved_bytes: "0", reserved_cost_micros: "0" });
  });
  test("unverified Instagram posts remain unavailable before any admission charge", async () => {
    await expect(
      admit({ ...input(), platform: "instagram", url: "https://www.instagram.com/p/AbC123xyz/" }),
    ).rejects.toMatchObject({
      code: "METHOD_UNAVAILABLE",
      status: 503,
    });
    expect((await admin.query("SELECT * FROM download_jobs")).rows).toEqual([]);
    expect((await admin.query("SELECT * FROM download_quota_buckets")).rows).toEqual([]);
    const reel = await admit({ ...input(), platform: "instagram", url: "https://www.instagram.com/reel/AbC123xyz/" });
    expect(reel.state).toBe("queued");
    expect(
      (
        await admin.query(
          "SELECT admitted FROM download_quota_buckets WHERE scope='owner:guest:guest-one' AND period LIKE 'day:%'",
        )
      ).rows[0].admitted,
    ).toBe(1);
  });
  test.each(verifiedPosts)(
    "%s admits native inspection, reuses owned metadata and claims the selected format",
    async (platform, url) => {
      const body = { ...input(), platform, url, inspect: true };
      expect((await preflight(body)).inspection).toBeUndefined();
      const job = await admit(body);
      expect(job).toMatchObject({ state: "queued", inspect: true, inspection: null });
      const started = await claim(job);
      expect(started).toMatchObject({ status: "claimed", input: { platform, url, inspect: true } });
      await run(() => consumeDownloadEngineStart(started.token));
      expect(
        await run(() =>
          finishDownloadAttempt(started.token, {
            outcome: "ready",
            stopped: true,
            inspection,
            sourceUrl: url,
            usage: inspectionUsage,
          }),
        ),
      ).toEqual({ accepted: true, state: "ready" });
      const ready = await run(() => getDownloadJob(owner, job.id));
      expect(ready).toMatchObject({ state: "ready", inspection, artifacts: [] });
      expect(JSON.stringify(ready)).not.toContain(url);

      const recipient = { kind: "guest", id: `${platform}-cache-recipient` };
      const recipientInput = { ...body, requestId: randomUUID() };
      const cached = await preflight(recipientInput, recipient);
      expect(cached.inspection.value).toEqual(inspection);
      const reused = await admitInspection(cached.inspection, recipientInput, recipient);
      expect(reused).toMatchObject({ state: "ready", inspection });
      expect(reused.id).not.toBe(job.id);
      await expect(run(() => getDownloadJob(recipient, job.id))).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect((await admin.query("SELECT count(*) FROM download_attempts")).rows[0].count).toBe("1");

      expect(await select(ready)).toMatchObject({ state: "queued", selectedFormat: "137+140" });
      const selected = await run(() => claimDownloadJob(job.id, 2, { slotIds: ["slot-0"], limits }));
      expect(selected).toMatchObject({
        status: "claimed",
        input: { platform, url, inspect: true, selectedFormat: "137+140", expectedFormat: inspection.formats[0] },
        remaining: { sourceBytes: 900, workMs: 179000, engineStarts: 2 },
      });
      expect(
        (
          await admin.query(
            "SELECT admitted FROM download_quota_buckets WHERE scope='owner:guest:guest-one' AND period LIKE 'day:%'",
          )
        ).rows[0].admitted,
      ).toBe(1);
    },
  );
  test("idempotent recovery still returns admitted work when availability is subsequently disabled", async () => {
    const body = input();
    const job = await admit(body);
    await admin.query("UPDATE managed_tools SET enabled=false WHERE tool_id='media.youtube-video-downloader'");
    try {
      expect((await admit(body, owner, { enabled: false, enabledPlatforms: [] })).id).toBe(job.id);
      expect(
        (
          await admin.query(
            "SELECT admitted FROM download_quota_buckets WHERE scope='owner:guest:guest-one' AND period LIKE 'day:%'",
          )
        ).rows[0].admitted,
      ).toBe(1);
    } finally {
      await admin.query("UPDATE managed_tools SET enabled=true WHERE tool_id='media.youtube-video-downloader'");
    }
  });
  test("concurrent outbox publishers lease distinct work and interrupted publication becomes due again", async () => {
    const first = await admit();
    const second = await admit();
    const claims = await Promise.all(Array.from({ length: 8 }, () => run(() => claimDueDownloadDispatches(100))));
    expect(
      claims
        .flat()
        .map((row) => row.jobId)
        .sort(),
    ).toEqual([first.id, second.id].sort());
    expect(await run(() => claimDueDownloadDispatches(1, first.id))).toEqual([]);
    await admin.query("UPDATE download_jobs SET dispatch_due_at=NOW()-INTERVAL '1 second' WHERE id=$1", [first.id]);
    expect(await run(() => claimDueDownloadDispatches(1, first.id))).toEqual([
      expect.objectContaining({ jobId: first.id, dispatchVersion: 1 }),
    ]);
  });
  test("queue outage expiry releases waiting capacity once without touching running work or refunding admissions", async () => {
    const queued = await admit();
    const running = await admit();
    await claim(running);
    await admin.query("UPDATE download_jobs SET queue_expires_at=NOW()-INTERVAL '1 second' WHERE id=ANY($1::text[])", [
      [queued.id, running.id],
    ]);
    const counts = await Promise.all([run(() => expireQueuedDownloadJobs()), run(() => expireQueuedDownloadJobs())]);
    expect(counts.reduce((sum, n) => sum + n, 0)).toBe(1);
    expect((await run(() => getDownloadJob(owner, queued.id))).error.code).toBe("QUEUE_EXPIRED");
    expect((await run(() => getDownloadJob(owner, running.id))).state).toBe("running");
    expect(
      (
        await admin.query(
          "SELECT queued,active FROM download_quota_buckets WHERE scope='owner:guest:guest-one' AND period='live'",
        )
      ).rows[0],
    ).toEqual({ queued: 0, active: 1 });
    expect(
      (
        await admin.query(
          "SELECT admitted FROM download_quota_buckets WHERE scope='owner:guest:guest-one' AND period LIKE 'day:%'",
        )
      ).rows[0].admitted,
    ).toBe(2);
  });
  test("simultaneous queued expiry, claim and cancellation settle one terminal outcome without starting work", async () => {
    const job = await admit();
    await admin.query("UPDATE download_jobs SET queue_expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [job.id]);
    await Promise.all([run(() => expireQueuedDownloadJobs()), claim(job), run(() => cancelDownloadJob(owner, job.id))]);
    expect(["failed", "cancelled"]).toContain((await run(() => getDownloadJob(owner, job.id))).state);
    expect(
      (await admin.query("SELECT queued,active FROM download_quota_buckets WHERE scope='global' AND period='live'"))
        .rows[0],
    ).toEqual({ queued: 0, active: 0 });
    expect((await admin.query("SELECT * FROM download_attempts")).rows).toEqual([]);
    expect(
      (
        await admin.query(
          "SELECT admitted FROM download_quota_buckets WHERE scope='owner:guest:guest-one' AND period LIKE 'day:%'",
        )
      ).rows[0].admitted,
    ).toBe(1);
  });
  test("network/global reservations serialize different owners, and UTC daily admissions are not refunded", async () => {
    const job = await admit(input(), owner, { networkDailyJobs: 1 });
    await run(() => cancelDownloadJob(owner, job.id));
    await expect(admit(input(), { kind: "guest", id: "other-owner" }, { networkDailyJobs: 1 })).rejects.toMatchObject({
      status: 429,
    });
    const rows = (await admin.query("SELECT admission_day,source_url FROM download_jobs WHERE id=$1", [job.id])).rows;
    expect(rows[0]).toEqual({
      admission_day: (await admin.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD') AS day"))
        .rows[0].day,
      source_url: null,
    });
    await expect(
      run(() =>
        admitDownloadJob({ kind: "account", id: "account-one" }, input(), {
          networkHash: "different-network",
          limits: { ...limits, globalDailyJobs: 1 },
        }),
      ),
    ).rejects.toMatchObject({ status: 429 });
  });
  test("policy saves are versioned, permission checked and audited atomically", async () => {
    const before = await run(() => getDownloadPolicy());
    const update = {
      expectedVersion: before.version,
      guest: { daily: 20, active: 2, queued: 4 },
      account: before.account,
    };
    const results = await Promise.allSettled([
      run(() => saveDownloadPolicy("admin-fixture", update)),
      run(() => saveDownloadPolicy("admin-fixture", update)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected").reason.code).toBe("POLICY_CONFLICT");
    expect(
      (await admin.query("SELECT metadata FROM audit_events WHERE action='downloaders.policy-update'")).rows.at(-1)
        .metadata.before.version,
    ).toBe(1);
    await expect(run(() => saveDownloadPolicy("nobody", { ...update, expectedVersion: 2 }))).rejects.toMatchObject({
      status: 403,
    });
    expect((await run(() => getDownloadPolicy())).version).toBe(2);
  });
  test("audit failure rolls back policy and migration reruns preserve saved limits", async () => {
    const policy = await run(() => getDownloadPolicy());
    const change = { expectedVersion: 1, guest: { daily: 25, active: 2, queued: 5 }, account: policy.account };
    await admin.query(
      "CREATE FUNCTION reject_download_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='downloaders.policy-update' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END $$",
    );
    await admin.query(
      "CREATE TRIGGER reject_download_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_download_audit()",
    );
    try {
      await expect(run(() => saveDownloadPolicy("admin-fixture", change))).rejects.toThrow("fixture audit failure");
      expect((await run(() => getDownloadPolicy())).version).toBe(1);
      expect((await run(() => getDownloadPolicy())).guest.daily).toBe(10);
    } finally {
      await admin.query("DROP TRIGGER reject_download_audit ON audit_events");
      await admin.query("DROP FUNCTION reject_download_audit()");
    }
    await run(() => saveDownloadPolicy("admin-fixture", change));
    await admin.query(
      await readFile(
        new URL("../db/migration/0009-media-downloaders/0001_media_downloaders.sql", import.meta.url),
        "utf8",
      ),
    );
    expect((await run(() => getDownloadPolicy())).guest.daily).toBe(25);
    expect((await run(() => getDownloadPolicy())).version).toBe(2);
  });
  test("lowered daily/queued limits preserve accepted work and do not reset usage", async () => {
    const first = await admit();
    const second = await admit();
    const policy = await run(() => getDownloadPolicy());
    await run(() =>
      saveDownloadPolicy("admin-fixture", {
        expectedVersion: policy.version,
        guest: { daily: 1, active: 1, queued: 1 },
        account: policy.account,
      }),
    );
    await expect(admit()).rejects.toMatchObject({ status: 429 });
    expect((await claim(first)).status).toBe("claimed");
    expect((await claim(second)).status).toBe("deferred");
    await run(() => cancelDownloadJob(owner, first.id));
    expect((await run(() => getDownloadJob(owner, first.id))).state).toBe("cancelling");
  });
  test("duplicate claims and unknown stop retain slot ownership; stopped failure settles once", async () => {
    const job = await admit();
    const claims = await Promise.all([claim(job), claim(job)]);
    const started = claims.find((c) => c.status === "claimed");
    expect(claims.filter((c) => c.status === "claimed")).toHaveLength(1);
    const finish = {
      outcome: "failed",
      stopped: false,
      error: { code: "TIMEOUT", message: "The download timed out.", retryable: true },
      usage: { workMs: 1000, sourceBytes: 10 },
    };
    await run(() => finishDownloadAttempt(started.token, finish));
    expect((await run(() => getDownloadJob(owner, job.id))).state).toBe("running");
    expect(
      (await admin.query("SELECT state FROM download_slots WHERE id=$1", [started.token.slotId])).rows[0].state,
    ).toBe("quarantined");
    await run(() => finishDownloadAttempt(started.token, { ...finish, stopped: true }));
    await run(() => finishDownloadAttempt(started.token, { ...finish, stopped: true }));
    expect((await run(() => getDownloadJob(owner, job.id))).state).toBe("failed");
    expect(
      (
        await admin.query(
          "SELECT active,queued FROM download_quota_buckets WHERE scope='owner:guest:guest-one' AND period='live'",
        )
      ).rows[0],
    ).toEqual({ active: 0, queued: 0 });
  });
  test("attempt retries fence stale completions and preserve cumulative work, byte, cost and start budgets", async () => {
    const job = await admit();
    const first = await claim(job);
    expect(await run(() => consumeDownloadEngineStart(first.token))).toEqual({
      allowed: true,
      remaining: 1,
      ordinal: 1,
    });
    expect(
      await run(() =>
        heartbeatDownloadAttempt(first.token, { workMs: 1000, sourceBytes: 100, costMicros: 3, phase: "downloading" }),
      ),
    ).toEqual({ accepted: true, shouldStop: false });
    await run(() => heartbeatDownloadAttempt(first.token, { workMs: 500, sourceBytes: 50, costMicros: 2 }));
    expect(
      await run(() =>
        finishDownloadAttempt(first.token, {
          outcome: "retry",
          stopped: true,
          usage: { workMs: 1000, sourceBytes: 100, costMicros: 3 },
        }),
      ),
    ).toEqual({ accepted: true, state: "queued" });
    expect((await claim(job)).status).toBe("stale");
    await run(() => deferDownloadJob(job.id, 2, 0));
    const second = await run(() => claimDownloadJob(job.id, 2, { slotIds: ["slot-0", "slot-1"], limits }));
    expect(second.remaining).toEqual({ workMs: limits.maxWorkMs - 1000, sourceBytes: 900, engineStarts: 1 });
    expect(await run(() => consumeDownloadEngineStart(second.token))).toEqual({
      allowed: true,
      remaining: 0,
      ordinal: 2,
    });
    expect(await run(() => consumeDownloadEngineStart(second.token))).toEqual({ allowed: false, remaining: 0 });
    expect(
      await run(() =>
        finishDownloadAttempt(first.token, {
          outcome: "failed",
          stopped: true,
          usage: { workMs: 1000, sourceBytes: 100 },
        }),
      ),
    ).toEqual({ accepted: false });
    expect(
      await run(() =>
        finishDownloadAttempt(second.token, {
          outcome: "retry",
          stopped: true,
          usage: { workMs: 1000, sourceBytes: 200, costMicros: 4 },
        }),
      ),
    ).toEqual({ accepted: true, state: "failed" });
    expect(
      (
        await admin.query(
          "SELECT work_ms,source_bytes,cost_micros,engine_starts,source_url FROM download_jobs WHERE id=$1",
          [job.id],
        )
      ).rows[0],
    ).toEqual({ work_ms: "2000", source_bytes: "300", cost_micros: "7", engine_starts: 2, source_url: null });
    expect(
      (
        await admin.query(
          "SELECT reserved_bytes,reserved_cost_micros FROM download_quota_buckets WHERE scope='global' AND period LIKE 'day:%'",
        )
      ).rows[0],
    ).toEqual({ reserved_bytes: "300", reserved_cost_micros: "7" });
  });
  test.each([
    ["heartbeat", "download_quota_buckets WHERE scope='global' AND period='live'"],
    ["engine debit", "download_quota_buckets WHERE scope='global' AND period='live'"],
    ["heartbeat", "download_policies WHERE id='default'"],
    ["engine debit", "download_policies WHERE id='default'"],
  ])("%s completes while %s is locked", async (operation, lockedRow) => {
    const job = await admit();
    const started = await claim(job);
    const boundedUrl = new URL(scopedUrl);
    boundedUrl.searchParams.set("options", `-c search_path=${schema} -c lock_timeout=250ms`);
    await admin.query("BEGIN");
    try {
      await admin.query(`SELECT * FROM ${lockedRow} FOR UPDATE`);
      const result = await withDatabaseOperation(
        () =>
          operation === "heartbeat"
            ? heartbeatDownloadAttempt(started.token, { workMs: 10, sourceBytes: 1, phase: "inspecting" })
            : consumeDownloadEngineStart(started.token, { workMs: 10, sourceBytes: 1, phase: "inspecting" }),
        boundedUrl.toString(),
      );
      expect(result).toMatchObject(
        operation === "heartbeat" ? { accepted: true, shouldStop: false } : { allowed: true },
      );
    } finally {
      await admin.query("ROLLBACK");
    }
    expect(await ownerPermits()).toEqual({ active: 1, queued: 0 });
    expect(await globalBudget()).toEqual({ reserved_bytes: "1000", reserved_cost_micros: "10" });
  });
  test.each(["cancel queued", "expire queued", "cancel running", "recover running", "expire inspection"])(
    "%s releases ownership even when the admin policy is missing",
    async (operation) => {
      const job = operation === "expire inspection" ? (await inspectedJob()).job : await admit();
      const started = operation.endsWith("running") ? await claim(job) : null;
      if (operation === "expire queued")
        await admin.query("UPDATE download_jobs SET queue_expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [job.id]);
      if (operation === "expire inspection")
        await admin.query("UPDATE download_jobs SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [job.id]);
      if (operation === "recover running")
        await admin.query("UPDATE download_slots SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [
          started.token.slotId,
        ]);
      const removed = (await admin.query("DELETE FROM download_policies RETURNING *")).rows[0];
      try {
        await expect(admit(input(), { kind: "guest", id: "new-admission" })).rejects.toMatchObject({
          code: "DOWNLOADS_UNAVAILABLE",
        });
        if (operation.startsWith("cancel")) await run(() => cancelDownloadJob(owner, job.id));
        if (operation.startsWith("expire")) expect(await run(() => expireQueuedDownloadJobs())).toBe(1);
        if (operation === "recover running") expect(await run(() => beginDownloadRecovery(started.token))).toBe(true);
        if (started) {
          expect(
            await run(() =>
              finishDownloadAttempt(started.token, {
                outcome: "failed",
                stopped: true,
                recovery: operation === "recover running",
                usage: { workMs: 10, sourceBytes: 1, costMicros: 0 },
              }),
            ),
          ).toMatchObject({ accepted: true, state: operation === "cancel running" ? "cancelled" : "failed" });
        }
        expect(await ownerPermits()).toEqual({ active: 0, queued: 0 });
        expect((await admin.query("SELECT id FROM download_attempts WHERE stopped_at IS NULL")).rows).toEqual([]);
        expect(
          (await admin.query("SELECT id FROM download_slots WHERE state='busy' OR state='quarantined'")).rows,
        ).toEqual([]);
      } finally {
        await admin.query(
          "INSERT INTO download_policies SELECT * FROM jsonb_populate_record(NULL::download_policies,$1::jsonb)",
          [JSON.stringify(removed)],
        );
      }
    },
  );
  test("settlement racing another claim preserves permits and day/month accounting", async () => {
    const first = await admit();
    const second = await admit(input(), { kind: "guest", id: "second-owner" });
    const started = await claim(first);
    const [finished, next] = await Promise.all([
      run(() =>
        finishDownloadAttempt(started.token, {
          outcome: "failed",
          stopped: true,
          usage: { workMs: 10, sourceBytes: 100, costMicros: 2 },
        }),
      ),
      claim(second),
    ]);
    expect(finished).toEqual({ accepted: true, state: "failed" });
    expect(next.status).toBe("claimed");
    expect(await globalBudget()).toEqual({ reserved_bytes: "1100", reserved_cost_micros: "12" });
    expect(
      (
        await admin.query(
          "SELECT reserved_bytes,reserved_cost_micros FROM download_quota_buckets WHERE scope='global' AND period LIKE 'month:%'",
        )
      ).rows[0],
    ).toEqual({ reserved_bytes: "1100", reserved_cost_micros: "0" });
    expect(
      (await admin.query("SELECT active,queued FROM download_quota_buckets WHERE scope='global' AND period='live'"))
        .rows[0],
    ).toEqual({ active: 1, queued: 0 });
    await run(() =>
      finishDownloadAttempt(next.token, {
        outcome: "failed",
        stopped: true,
        usage: { workMs: 20, sourceBytes: 50, costMicros: 1 },
      }),
    );
    expect(await globalBudget()).toEqual({ reserved_bytes: "150", reserved_cost_micros: "3" });
  });
  test("combined engine debit records monotonic usage and renews its phase and lease before starting", async () => {
    const job = await admit();
    const started = await claim(job);
    await admin.query("UPDATE download_slots SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [
      started.token.slotId,
    ]);
    expect(
      await run(() =>
        consumeDownloadEngineStart(started.token, {
          workMs: 100,
          sourceBytes: 20,
          costMicros: 2,
          phase: "inspecting",
        }),
      ),
    ).toEqual({ allowed: true, remaining: 1, ordinal: 1 });
    expect(await run(() => beginDownloadRecovery(started.token))).toBe(false);
    expect(
      await run(() =>
        consumeDownloadEngineStart(started.token, {
          workMs: 50,
          sourceBytes: 10,
          costMicros: 1,
          phase: "starting",
        }),
      ),
    ).toEqual({ allowed: true, remaining: 0, ordinal: 2 });
    const rows = await admin.query(
      `SELECT j.work_ms,j.source_bytes,j.cost_micros,j.engine_starts,j.phase,
      a.work_ms AS attempt_work,a.source_bytes AS attempt_bytes,a.phase AS attempt_phase,
      s.lease_expires_at>clock_timestamp() AS leased
      FROM download_jobs j JOIN download_attempts a ON a.job_id=j.id JOIN download_slots s ON s.attempt_id=a.id
      WHERE j.id=$1`,
      [job.id],
    );
    expect(rows.rows[0]).toEqual({
      work_ms: "100",
      source_bytes: "20",
      cost_micros: "2",
      engine_starts: 2,
      phase: "starting",
      attempt_work: "100",
      attempt_bytes: "20",
      attempt_phase: "starting",
      leased: true,
    });
    expect(await run(() => consumeDownloadEngineStart(started.token, { workMs: 101, sourceBytes: 21 }))).toEqual({
      allowed: false,
      remaining: 0,
    });
  });
  test.each(["work", "bytes", "deadline"])(
    "combined engine debit accounts usage but cannot start after the %s limit",
    async (limit) => {
      const job = await admit();
      const started = await claim(job);
      if (limit === "deadline")
        await admin.query("UPDATE download_attempts SET deadline=NOW()-INTERVAL '1 second' WHERE id=$1", [
          started.token.attemptId,
        ]);
      const usage = {
        workMs: limit === "work" ? limits.maxWorkMs : 5,
        sourceBytes: limit === "bytes" ? limits.jobSourceBytes : 3,
        phase: "starting",
      };
      expect(await run(() => consumeDownloadEngineStart(started.token, usage))).toEqual({
        allowed: false,
        remaining: 0,
        shouldStop: true,
      });
      expect(
        (await admin.query("SELECT work_ms,source_bytes,engine_starts,phase FROM download_jobs WHERE id=$1", [job.id]))
          .rows[0],
      ).toEqual({
        work_ms: String(usage.workMs),
        source_bytes: String(usage.sourceBytes),
        engine_starts: 0,
        phase: "stopping",
      });
      expect(await ownerPermits()).toEqual({ active: 1, queued: 0 });
    },
  );
  test.each(["generation", "slotGeneration", "attemptId", "slotId"])(
    "lightweight attempt operations reject a stale %s without accounting or debiting",
    async (field) => {
      const job = await admit();
      const started = await claim(job);
      const token = {
        ...started.token,
        [field]: typeof started.token[field] === "number" ? started.token[field] + 1 : randomUUID(),
      };
      expect(await run(() => heartbeatDownloadAttempt(token, { workMs: 500, sourceBytes: 100 }))).toEqual({
        accepted: false,
        shouldStop: true,
      });
      expect(await run(() => consumeDownloadEngineStart(token, { workMs: 500, sourceBytes: 100 }))).toEqual({
        allowed: false,
        remaining: 0,
        shouldStop: true,
      });
      expect(
        (await admin.query("SELECT work_ms,source_bytes,engine_starts FROM download_jobs WHERE id=$1", [job.id]))
          .rows[0],
      ).toEqual({ work_ms: "0", source_bytes: "0", engine_starts: 0 });
    },
  );
  test("cancellation racing heartbeat and combined debit retains capacity and prevents a later start", async () => {
    const job = await admit();
    const started = await claim(job);
    await Promise.all([
      run(() => heartbeatDownloadAttempt(started.token, { workMs: 100, sourceBytes: 10 })),
      run(() => consumeDownloadEngineStart(started.token, { workMs: 200, sourceBytes: 20, phase: "starting" })),
      run(() => cancelDownloadJob(owner, job.id)),
    ]);
    const before = (await admin.query("SELECT engine_starts FROM download_jobs WHERE id=$1", [job.id])).rows[0];
    expect(
      await run(() => consumeDownloadEngineStart(started.token, { workMs: 300, sourceBytes: 30, phase: "starting" })),
    ).toEqual({ allowed: false, remaining: 0, shouldStop: true });
    expect(
      (
        await admin.query("SELECT state,phase,work_ms,source_bytes,engine_starts FROM download_jobs WHERE id=$1", [
          job.id,
        ])
      ).rows[0],
    ).toEqual({
      state: "cancelling",
      phase: "stopping",
      work_ms: "300",
      source_bytes: "30",
      engine_starts: before.engine_starts,
    });
    expect(await ownerPermits()).toEqual({ active: 1, queued: 0 });
    expect(
      (await admin.query("SELECT stopped_at FROM download_attempts WHERE id=$1", [started.token.attemptId])).rows[0]
        .stopped_at,
    ).toBe(null);
  });
  test("expired execution remains owned until stop confirmation, and uncertain usage cannot grant another attempt", async () => {
    const job = await admit();
    const started = await claim(job);
    await run(() => consumeDownloadEngineStart(started.token));
    await admin.query("UPDATE download_attempts SET deadline=NOW()-INTERVAL '1 second' WHERE id=$1", [
      started.token.attemptId,
    ]);
    expect(await run(() => listStaleDownloadAttempts())).toContainEqual(
      expect.objectContaining({ token: started.token }),
    );
    expect(await run(() => heartbeatDownloadAttempt(started.token, { workMs: 100, sourceBytes: 100 }))).toEqual({
      accepted: true,
      shouldStop: true,
    });
    await run(() =>
      finishDownloadAttempt(started.token, {
        outcome: "retry",
        stopped: false,
        uncertainUsage: true,
        usage: { workMs: 100, sourceBytes: 100 },
      }),
    );
    expect((await run(() => getDownloadJob(owner, job.id))).state).toBe("running");
    expect(
      (await admin.query("SELECT active FROM download_quota_buckets WHERE scope='global' AND period='live'")).rows[0]
        .active,
    ).toBe(1);
    expect(
      await run(() =>
        finishDownloadAttempt(started.token, {
          outcome: "retry",
          stopped: true,
          usage: { workMs: 100, sourceBytes: 100 },
        }),
      ),
    ).toEqual({ accepted: true, state: "failed" });
    expect(
      (
        await admin.query(
          "SELECT reserved_bytes,reserved_cost_micros FROM download_quota_buckets WHERE scope='global' AND period LIKE 'day:%'",
        )
      ).rows[0],
    ).toEqual({ reserved_bytes: "1000", reserved_cost_micros: "10" });
  });
  test("scaling down respects active ownership outside the configured slot list", async () => {
    const firstJob = await admit();
    const secondJob = await admit(input(), { kind: "guest", id: "second" });
    const thirdJob = await admit(input(), { kind: "guest", id: "third" });
    const first = await claim(firstJob);
    const second = await claim(secondJob);
    const claimSmall = () => run(() => claimDownloadJob(thirdJob.id, 1, { slotIds: ["slot-0"], limits }));
    expect((await claimSmall()).status).toBe("deferred");
    await run(() =>
      finishDownloadAttempt(first.token, { outcome: "failed", stopped: true, usage: { workMs: 0, sourceBytes: 0 } }),
    );
    expect((await claimSmall()).status).toBe("deferred");
    await run(() =>
      finishDownloadAttempt(second.token, { outcome: "failed", stopped: true, usage: { workMs: 0, sourceBytes: 0 } }),
    );
    expect((await claimSmall()).status).toBe("claimed");
  });
  test("claiming a large pool preserves existing slot ownership and generations", async () => {
    const slotIds = Array.from({ length: 250 }, (_, index) => `slot-${String(index).padStart(3, "0")}`).reverse();
    await admin.query(
      "INSERT INTO download_slots(id,state,generation,attempt_id) VALUES ('slot-000','quarantined',7,'old-attempt'),('slot-001','draining',9,NULL),('slot-002','idle',11,NULL)",
    );
    const job = await admit();
    const started = await run(() => claimDownloadJob(job.id, 1, { slotIds, limits }));
    expect(started).toMatchObject({ status: "claimed", token: { slotId: "slot-002", slotGeneration: 12 } });
    expect((await admin.query("SELECT count(*) FROM download_slots")).rows[0].count).toBe("250");
    expect(
      (
        await admin.query(
          "SELECT id,state,generation,attempt_id FROM download_slots WHERE id IN ('slot-000','slot-001') ORDER BY id",
        )
      ).rows,
    ).toEqual([
      { id: "slot-000", state: "quarantined", generation: 7, attempt_id: "old-attempt" },
      { id: "slot-001", state: "draining", generation: 9, attempt_id: null },
    ]);
  });
  test("a heartbeat renewed after a stale snapshot prevents unnecessary recovery", async () => {
    const job = await admit();
    const started = await claim(job);
    await admin.query("UPDATE download_slots SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [
      started.token.slotId,
    ]);
    expect(await run(() => listStaleDownloadAttempts())).toContainEqual(
      expect.objectContaining({ token: started.token }),
    );
    await run(() => heartbeatDownloadAttempt(started.token, { workMs: 1, sourceBytes: 0 }));
    expect(await run(() => beginDownloadRecovery(started.token))).toBe(false);
    expect((await run(() => getDownloadJob(owner, job.id))).phase).toBe("starting");
  });
  test("recovery owns settlement and blocks late runner completion until stop is confirmed", async () => {
    const job = await admit();
    const started = await claim(job);
    await admin.query("UPDATE download_slots SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [
      started.token.slotId,
    ]);
    expect(await run(() => beginDownloadRecovery(started.token))).toBe(true);
    await run(() => cancelDownloadJob(owner, job.id));
    expect((await run(() => getDownloadJob(owner, job.id))).phase).toBe("recovering");
    expect(await run(() => heartbeatDownloadAttempt(started.token, { workMs: 1, sourceBytes: 0 }))).toEqual({
      accepted: false,
      shouldStop: true,
    });
    expect(await run(() => consumeDownloadEngineStart(started.token))).toEqual({ allowed: false, remaining: 0 });
    expect(
      await run(() => consumeDownloadEngineStart(started.token, { workMs: 100, sourceBytes: 10, phase: "starting" })),
    ).toEqual({ allowed: false, remaining: 0, shouldStop: true });
    expect(
      (await admin.query("SELECT phase,work_ms,source_bytes,engine_starts FROM download_jobs WHERE id=$1", [job.id]))
        .rows[0],
    ).toEqual({ phase: "recovering", work_ms: "0", source_bytes: "0", engine_starts: 0 });
    expect(
      await run(() =>
        finishDownloadAttempt(started.token, {
          outcome: "succeeded",
          stopped: true,
          usage: { workMs: 1, sourceBytes: 0 },
        }),
      ),
    ).toEqual({ accepted: false });
    expect(
      await run(() =>
        finishDownloadAttempt(started.token, {
          outcome: "failed",
          stopped: true,
          usage: { workMs: 1, sourceBytes: 0 },
        }),
      ),
    ).toEqual({ accepted: false });
    await run(() =>
      finishDownloadAttempt(started.token, {
        outcome: "failed",
        stopped: false,
        recovery: true,
        usage: { workMs: 1, sourceBytes: 0 },
      }),
    );
    expect((await run(() => getDownloadJob(owner, job.id))).phase).toBe("recovering");
    expect(
      (await admin.query("SELECT active FROM download_quota_buckets WHERE scope='global' AND period='live'")).rows[0]
        .active,
    ).toBe(1);
    expect(
      await run(() =>
        finishDownloadAttempt(started.token, {
          outcome: "failed",
          stopped: true,
          recovery: true,
          usage: { workMs: 1, sourceBytes: 0 },
        }),
      ),
    ).toEqual({ accepted: true, state: "cancelled" });
    expect(await run(() => beginDownloadRecovery(started.token))).toBe(false);
  });
  test("cancel wins publication, and cross-owner access is denied", async () => {
    const job = await admit();
    const started = await claim(job);
    await expect(run(() => getDownloadJob({ kind: "guest", id: "different" }, job.id))).rejects.toMatchObject({
      status: 404,
    });
    await run(() => cancelDownloadJob(owner, job.id));
    await run(() =>
      finishDownloadAttempt(started.token, {
        outcome: "succeeded",
        stopped: true,
        artifacts: [
          {
            id: randomUUID(),
            storageKey: "sealed/fixture",
            filename: "video.mp4",
            mimeType: "video/mp4",
            sizeBytes: 30,
            etag: "sealed",
          },
        ],
        usage: { workMs: 1000, sourceBytes: 30 },
      }),
    );
    expect((await run(() => getDownloadJob(owner, job.id))).state).toBe("cancelled");
    expect((await admin.query("SELECT * FROM download_artifacts")).rows).toHaveLength(0);
  });
  test("claim rechecks managed tool availability and global execution stop", async () => {
    const job = await admit();
    expect(
      (await run(() => claimDownloadJob(job.id, 1, { slotIds: ["slot-0"], limits: { ...limits, enabled: false } })))
        .status,
    ).toBe("deferred");
    await admin.query("UPDATE managed_tools SET enabled=false WHERE tool_id='media.youtube-video-downloader'");
    expect((await claim(job)).status).toBe("terminal");
    await admin.query("UPDATE managed_tools SET enabled=true WHERE tool_id='media.youtube-video-downloader'");
  });
  test("missing limits fail closed and reserved monthly bytes prevent overspend", async () => {
    await expect(admit(input(), owner, { globalMonthlyBytes: undefined })).rejects.toMatchObject({
      code: "DOWNLOADS_UNAVAILABLE",
    });
    await admit(input(), owner, { globalMonthlyBytes: 1000 });
    await expect(admit(input(), { kind: "guest", id: "other" }, { globalMonthlyBytes: 1000 })).rejects.toMatchObject({
      status: 429,
    });
  });
  test("dispatch repair and sealed artifact access preserve ownership and expiry", async () => {
    const job = await admit();
    expect(await run(() => claimDueDownloadDispatches(10))).toContainEqual(
      expect.objectContaining({ jobId: job.id, dispatchVersion: 1 }),
    );
    await run(() => markDownloadDispatched(job.id, 1));
    const started = await claim(job);
    await admin.query("UPDATE download_slots SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [
      started.token.slotId,
    ]);
    expect(await run(() => listStaleDownloadAttempts())).toContainEqual(
      expect.objectContaining({ token: started.token }),
    );
    const artifactId = randomUUID();
    const storageKey = `sealed/${job.id}/${started.token.generation}/${artifactId}`;
    await run(() =>
      finishDownloadAttempt(started.token, {
        outcome: "succeeded",
        stopped: true,
        artifacts: [
          {
            id: artifactId,
            storageKey,
            filename: "video.mp4",
            mimeType: "video/mp4",
            sizeBytes: 30,
            etag: "etag",
          },
        ],
        usage: { workMs: 1000, sourceBytes: 30 },
      }),
    );
    expect(await run(() => beginDownloadRecovery(started.token))).toBe(false);
    expect((await run(() => getArtifactForOwner(owner, job.id, artifactId))).storageKey).toBe(storageKey);
    const replay = await preflight({ ...input(), requestId: job.requestId }, owner, { enabled: false });
    expect(replay.job).toMatchObject({ id: job.id, state: "succeeded", artifacts: [{ id: artifactId }] });
    expect(replay.job.artifacts[0]).not.toHaveProperty("storageKey");
    await admin.query("UPDATE download_jobs SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [job.id]);
    expect((await run(() => getDownloadJob(owner, job.id))).state).toBe("expired");
    await expect(run(() => getArtifactForOwner(owner, job.id, artifactId))).rejects.toMatchObject({ status: 410 });
    await admin.query("UPDATE download_artifacts SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [artifactId]);
    expect(await run(() => expireDownloadArtifacts())).toContainEqual({ artifactId, storageKey });
    await run(() => markDownloadArtifactDeleted(artifactId));
    expect(await run(() => expireDownloadArtifacts())).toEqual([]);
  });
  test("publication rejects unsafe metadata and foreign-generation storage keys without releasing ownership", async () => {
    const job = await admit();
    const started = await claim(job);
    const artifact = {
      id: randomUUID(),
      storageKey: `sealed/${job.id}/${started.token.generation}/result`,
      filename: "video.mp4",
      mimeType: "video/mp4",
      sizeBytes: 30,
      etag: "etag",
      metadata: { width: 1920, height: 1080, durationSeconds: 3.5, hasAudio: true },
    };
    for (const invalid of [
      { storageKey: "sealed/another-job/1/result" },
      { filename: "../../file.mp4" },
      { mimeType: "text/html" },
      { sizeBytes: -1 },
    ]) {
      await expect(
        run(() =>
          finishDownloadAttempt(started.token, {
            outcome: "succeeded",
            stopped: true,
            artifacts: [{ ...artifact, ...invalid }],
            usage: { workMs: 10, sourceBytes: 30 },
          }),
        ),
      ).rejects.toMatchObject({ code: "INVALID_ARTIFACT" });
    }
    expect((await run(() => getDownloadJob(owner, job.id))).state).toBe("running");
    expect((await admin.query("SELECT * FROM download_artifacts")).rows).toEqual([]);
    await run(() =>
      finishDownloadAttempt(started.token, {
        outcome: "succeeded",
        stopped: true,
        artifacts: [artifact],
        usage: { workMs: 10, sourceBytes: 30 },
      }),
    );
    expect((await run(() => getDownloadJob(owner, job.id))).artifacts).toEqual([
      {
        id: artifact.id,
        name: "video.mp4",
        mime: "video/mp4",
        bytes: 30,
        width: 1920,
        height: 1080,
        durationSeconds: 3.5,
        hasAudio: true,
      },
    ]);
  });
  test("bounded history cleanup preserves live attempts and current UTC allowance", async () => {
    const completed = await admit();
    const live = await admit();
    await run(() => cancelDownloadJob(owner, completed.id));
    await claim(live);
    await admin.query("UPDATE download_jobs SET updated_at=NOW()-INTERVAL '40 days' WHERE id=ANY($1::text[])", [
      [completed.id, live.id],
    ]);
    await admin.query(
      "INSERT INTO download_quota_buckets(scope,period,admitted) VALUES('network:old','day:2000-01-01',1),('global','month:2000-01',1),('platform:youtube','minute:2000-01-01T00:00',1)",
    );
    const cleanup = await run(() => pruneDownloadHistory(100));
    expect(cleanup.jobs).toBe(1);
    expect(cleanup.buckets).toBe(3);
    expect(await run(() => findDownloadSubmission(owner, completed.requestId))).toBeNull();
    expect((await run(() => getDownloadJob(owner, live.id))).state).toBe("running");
    expect(
      (
        await admin.query(
          "SELECT admitted FROM download_quota_buckets WHERE scope='owner:guest:guest-one' AND period LIKE 'day:%'",
        )
      ).rows[0].admitted,
    ).toBe(2);
    expect(
      (
        await admin.query(
          "SELECT active FROM download_quota_buckets WHERE scope='owner:guest:guest-one' AND period='live'",
        )
      ).rows[0].active,
    ).toBe(1);
  });
});
