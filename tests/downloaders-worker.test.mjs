import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => ({
  database: vi.fn(),
  dispatch: vi.fn(),
  sign: vi.fn(),
  inspectYouTube: vi.fn(),
  inspectInstagram: vi.fn(),
  jobs: Object.fromEntries(
    [
      "admitDownloadJob",
      "checkDownloadInspectionAdmission",
      "beginDownloadRecovery",
      "cancelDownloadJob",
      "claimDueDownloadDispatches",
      "expireQueuedDownloadJobs",
      "pruneDownloadHistory",
      "expireDownloadArtifacts",
      "findDownloadSubmission",
      "finishDownloadAttempt",
      "getArtifactForOwner",
      "getDownloadJob",
      "selectDownloadFormat",
      "listStaleDownloadAttempts",
      "markDownloadArtifactDeleted",
      "markDownloadDispatched",
    ].map((key) => [key, vi.fn()]),
  ),
}));
vi.mock("../db/runtime", () => ({ withDatabaseOperation: mocks.database }));
vi.mock("../lib/downloaders/cloudflareContainer", () => ({ DownloaderContainer: class {}, ContainerProxy: class {} }));
vi.mock("../lib/downloaders/dispatcher", () => ({ dispatchDownloadJob: mocks.dispatch }));
vi.mock("../lib/downloaders/jobs", () => mocks.jobs);
vi.mock("../lib/downloaders/youtubeInspection", () => ({ inspectYouTube: mocks.inspectYouTube }));
vi.mock("../lib/downloaders/instagramInspection", () => ({ inspectInstagram: mocks.inspectInstagram }));
vi.mock("../lib/downloaders/storage", () => ({
  createStagingArtifacts: vi.fn(),
  sealDownloadArtifacts: vi.fn(),
  signStorageUrl: mocks.sign,
}));

import { DownloadError } from "../lib/downloaders/contracts.ts";
import { matchesEgressHost } from "../lib/downloaders/config.ts";
import { signCapability } from "../lib/downloaders/security.ts";
import worker from "../lib/downloaders/worker.ts";

const jobId = "10000000-0000-4000-8000-000000000001";
const artifactId = "20000000-0000-4000-8000-000000000001";
const requestId = "30000000-0000-4000-8000-000000000001";
const account = { kind: "account", id: "account-user" };
const guest = { kind: "guest", id: "guest-proof" };
const job = { id: jobId, state: "queued" };
let env;
let slot;

function call(action, payload, url = "https://downloaders.internal/", method = "POST") {
  return worker.fetch(
    new Request(new URL(action, url), {
      method,
      headers: { "Content-Type": "application/json", Host: "downloaders.internal" },
      ...(method === "POST" ? { body: JSON.stringify(payload) } : {}),
    }),
    env,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.database.mockImplementation((operation) => operation());
  mocks.jobs.admitDownloadJob.mockResolvedValue(job);
  mocks.jobs.checkDownloadInspectionAdmission.mockResolvedValue({});
  mocks.inspectYouTube.mockResolvedValue({ inspection: null, sourceBytes: 0, workMs: 0 });
  mocks.inspectInstagram.mockResolvedValue({ inspection: null, sourceBytes: 0, workMs: 0 });
  mocks.jobs.claimDueDownloadDispatches.mockResolvedValue([{ jobId, dispatchVersion: 1 }]);
  mocks.jobs.getDownloadJob.mockResolvedValue(job);
  mocks.jobs.listStaleDownloadAttempts.mockResolvedValue([]);
  mocks.jobs.expireDownloadArtifacts.mockResolvedValue([]);
  mocks.dispatch.mockResolvedValue({ status: "ack" });
  mocks.sign.mockResolvedValue("https://storage.example/sealed?signature=capability");
  slot = {
    recoverExecution: vi.fn(async () => ({ stopped: true, sourceBytes: 1, workMs: 2 })),
    cleanupCursor: vi.fn(async () => undefined),
    advanceCleanupCursor: vi.fn(async () => {}),
  };
  env = {
    DOWNLOADERS_CONTROL_SECRET: "worker-configuration-fixture-".repeat(2),
    DB: { connectionString: "postgres://fixture-only" },
    DOWNLOAD_QUEUE: { send: vi.fn(async () => {}) },
    DOWNLOAD_FILES: { delete: vi.fn(async () => {}), list: vi.fn(async () => ({ objects: [], truncated: false })) },
    DOWNLOAD_CONTAINERS: { getByName: vi.fn(() => slot) },
  };
});
afterEach(() => vi.restoreAllMocks());

test("queue timing reports actual message age and safe job correlation", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(Date, "now").mockReturnValue(20_000);
  const message = { body: { jobId, dispatchVersion: 1 }, timestamp: new Date(12_000), ack: vi.fn(), retry: vi.fn() };
  await worker.queue({ messages: [message] }, env);
  const events = log.mock.calls.map(([line]) => JSON.parse(line));
  expect(events).toContainEqual({ event: "downloader_timing", stage: "worker.queue_age", durationMs: 8000, jobId });
  expect(events.some((event) => event.stage === "worker.queue_total" && event.jobId === jobId)).toBe(true);
  expect(JSON.stringify(events)).not.toMatch(/postgres|owner|guest|capability|signature/);
});

test.each(["true", "false"])("container dispatch uses platform domains with local mode %s", async (local) => {
  env.DOWNLOADERS_LOCAL = local;
  slot.startExecution = vi.fn(async () => ({ state: "running" }));
  mocks.dispatch.mockImplementation(async (_message, _configuration, runtime) => {
    for (const engine of ["yt-dlp", "cobalt"]) {
      await runtime.start(
        { slotId: "download-1" },
        { request: { engine, url: "https://www.youtube.com/watch?v=BaW_jenozKc" } },
      );
    }
    return { status: "ack" };
  });
  const message = { body: { jobId, dispatchVersion: 1 }, ack: vi.fn(), retry: vi.fn() };
  await worker.queue({ messages: [message] }, env);
  expect(message.ack).toHaveBeenCalledOnce();
  expect(slot.startExecution).toHaveBeenCalledTimes(2);
  for (const [, hosts] of slot.startExecution.mock.calls) {
    expect(matchesEgressHost("www.youtube.com", hosts)).toBe(true);
    expect(matchesEgressHost("rr1.googlevideo.com", hosts)).toBe(true);
    expect(matchesEgressHost("www.instagram.com", hosts)).toBe(false);
    expect(matchesEgressHost("googlevideo.com.example.org", hosts)).toBe(false);
  }
});

test("admission and outbox timings never include source, owner or control payload", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const response = await call("create", {
    owners: [guest],
    networkHash: "a".repeat(64),
    input: { platform: "youtube", url: "https://www.youtube.com/watch?v=BaW_jenozKc", quality: "720", requestId },
  });
  expect(response.status).toBe(202);
  const events = log.mock.calls.map(([line]) => JSON.parse(line));
  expect(events.map((event) => event.stage)).toEqual(
    expect.arrayContaining([
      "worker.admission_db",
      "worker.outbox_claim_db",
      "worker.outbox_enqueue",
      "worker.outbox_mark_db",
    ]),
  );
  expect(events.find((event) => event.stage === "worker.admission_db").requestId).toBe(requestId);
  expect(JSON.stringify(events)).not.toMatch(/https:|guest-proof|networkHash|BaW_jenozKc/);
});

test("cached formats return immediately without queue dispatch or native work", async () => {
  const ready = { ...job, state: "ready", inspect: true, inspection: { title: "Cached source", formats: [] } };
  mocks.jobs.admitDownloadJob.mockResolvedValue(ready);
  const response = await call("create", {
    owners: [guest],
    networkHash: "a".repeat(64),
    input: {
      platform: "youtube",
      url: "https://www.youtube.com/watch?v=BaW_jenozKc",
      quality: "720",
      requestId,
      inspect: true,
    },
  });
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ job: ready });
  expect(mocks.jobs.claimDueDownloadDispatches).not.toHaveBeenCalled();
  expect(env.DOWNLOAD_QUEUE.send).not.toHaveBeenCalled();
  expect(mocks.dispatch).not.toHaveBeenCalled();
});

const inspectionInput = {
  platform: "youtube",
  url: "https://www.youtube.com/watch?v=BaW_jenozKc",
  quality: "720",
  requestId,
  inspect: true,
};
const inspectionPayload = { owners: [guest], networkHash: "a".repeat(64), input: inspectionInput };

test("missing control secret rejects admission without advising a retry", async () => {
  delete env.DOWNLOADERS_CONTROL_SECRET;
  const response = await call("create", inspectionPayload);
  expect(response.status).toBe(503);
  expect(response.headers.get("Retry-After")).toBeNull();
  expect(await response.json()).toEqual({
    error: {
      code: "DOWNLOADS_NOT_CONFIGURED",
      message: "Download capacity is not configured.",
      retryable: false,
    },
  });
  expect(mocks.jobs.admitDownloadJob).not.toHaveBeenCalled();
  expect(mocks.jobs.checkDownloadInspectionAdmission).not.toHaveBeenCalled();
  expect(mocks.inspectYouTube).not.toHaveBeenCalled();
  expect(env.DOWNLOAD_QUEUE.send).not.toHaveBeenCalled();
});

const fastInspection = {
  title: "Public video",
  durationSeconds: 60,
  formats: [
    {
      id: "136+140",
      container: "mp4",
      width: 1280,
      height: 720,
      fps: 30,
      bytes: 1024,
      estimatedBytes: true,
      hasAudio: true,
      requiresMerge: true,
      videoCodec: "avc1.4d401f",
    },
  ],
};
function enableFastInspection(platform = "youtube") {
  Object.assign(env, {
    DOWNLOADERS_ENABLED: "true",
    DOWNLOADERS_CONTROL_SECRET: "x".repeat(32),
    DOWNLOADERS_PLATFORMS: platform,
    DOWNLOADERS_YOUTUBE_INSPECTION: "true",
    DOWNLOADERS_INSTAGRAM_INSPECTION: "true",
    DOWNLOADERS_LIMITS: JSON.stringify({
      globalDailyJobs: 1000,
      networkDailyJobs: 100,
      globalQueued: 10,
      platformActive: 2,
      platformStartsPerMinute: 10,
      globalDailyBytes: 1e12,
      globalMonthlyBytes: 1e13,
      globalDailyCostMicros: 1e6,
      jobCostMicros: 1000,
    }),
    DOWNLOAD_INSPECTION_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
  });
}

test("fast inspection returns ready formats through atomic admission without native dispatch", async () => {
  enableFastInspection();
  mocks.inspectYouTube.mockResolvedValue({ inspection: fastInspection, sourceBytes: 1000, workMs: 500 });
  const ready = { ...job, state: "ready", inspection: fastInspection };
  mocks.jobs.admitDownloadJob.mockResolvedValue(ready);
  const response = await call("create", inspectionPayload);
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ job: ready });
  expect(mocks.inspectYouTube).toHaveBeenCalledWith(expect.objectContaining({ id: "BaW_jenozKc" }), "720", 1024 ** 3);
  const options = mocks.jobs.admitDownloadJob.mock.calls[0][2];
  expect(options.inspection.value).toEqual(fastInspection);
  expect(options.inspection.expiresAt.getTime() - Date.now()).toBeGreaterThan(115_000);
  expect(mocks.jobs.claimDueDownloadDispatches).not.toHaveBeenCalled();
  expect(env.DOWNLOAD_INSPECTION_RATE_LIMITER.limit).toHaveBeenCalledTimes(2);
});

test("inspection retries return the owned job before extraction or admission", async () => {
  enableFastInspection();
  const ready = { ...job, state: "ready", inspection: fastInspection };
  mocks.jobs.checkDownloadInspectionAdmission.mockResolvedValue({ job: ready });
  expect(await (await call("create", inspectionPayload)).json()).toEqual({ job: ready });
  expect(mocks.inspectYouTube).not.toHaveBeenCalled();
  expect(mocks.jobs.admitDownloadJob).not.toHaveBeenCalled();
});

test("recent inspection metadata skips upstream extraction and retains its expiry", async () => {
  enableFastInspection();
  const cached = { value: fastInspection, expiresAt: new Date(Date.now() + 30_000) };
  mocks.jobs.checkDownloadInspectionAdmission.mockResolvedValue({ inspection: cached });
  mocks.jobs.admitDownloadJob.mockResolvedValue({ ...job, state: "ready", inspection: fastInspection });
  expect((await call("create", inspectionPayload)).status).toBe(202);
  expect(mocks.inspectYouTube).not.toHaveBeenCalled();
  expect(mocks.jobs.admitDownloadJob.mock.calls[0][2].inspection).toEqual(cached);
});

test("failed fast inspection falls back to the existing queued native inspector", async () => {
  enableFastInspection();
  expect((await call("create", inspectionPayload)).status).toBe(202);
  expect(mocks.jobs.admitDownloadJob.mock.calls[0][2].inspection).toBeUndefined();
  expect(env.DOWNLOAD_QUEUE.send).toHaveBeenCalledOnce();
});

const instagramInspectionPayload = {
  ...inspectionPayload,
  input: { ...inspectionInput, platform: "instagram", url: "https://www.instagram.com/reel/Chunk8-jurw/" },
};

test("Instagram formats pass metered metadata through atomic admission without native dispatch", async () => {
  enableFastInspection("instagram");
  mocks.inspectInstagram.mockResolvedValue({ inspection: fastInspection, sourceBytes: 2048, workMs: 250 });
  const ready = { ...job, platform: "instagram", state: "ready", inspection: fastInspection };
  mocks.jobs.admitDownloadJob.mockResolvedValue(ready);
  const response = await call("create", instagramInspectionPayload);
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ job: ready });
  expect(mocks.inspectInstagram).toHaveBeenCalledWith(
    expect.objectContaining({ platformId: "instagram", id: "Chunk8-jurw" }),
    "720",
    1024 ** 3,
  );
  const options = mocks.jobs.admitDownloadJob.mock.calls[0][2];
  expect(options.inspection.value).toEqual(fastInspection);
  expect(options.inspectionUsage).toEqual({ sourceBytes: 2048, workMs: 250 });
  expect(options.inspection.expiresAt.getTime() - Date.now()).toBeGreaterThan(115_000);
  expect(mocks.inspectYouTube).not.toHaveBeenCalled();
  expect(env.DOWNLOAD_QUEUE.send).not.toHaveBeenCalled();
  expect(env.DOWNLOAD_INSPECTION_RATE_LIMITER.limit).toHaveBeenCalledTimes(2);
});

test("incomplete Instagram metadata retains consumed budgets and queues one native fallback", async () => {
  enableFastInspection("instagram");
  mocks.inspectInstagram.mockResolvedValue({ inspection: null, sourceBytes: 4096, workMs: 500 });
  expect((await call("create", instagramInspectionPayload)).status).toBe(202);
  expect(mocks.jobs.admitDownloadJob.mock.calls[0][2]).toMatchObject({
    inspectionUsage: { sourceBytes: 4096, workMs: 500 },
  });
  expect(mocks.jobs.admitDownloadJob.mock.calls[0][2].inspection).toBeUndefined();
  expect(mocks.inspectInstagram).toHaveBeenCalledOnce();
  expect(mocks.inspectYouTube).not.toHaveBeenCalled();
  expect(env.DOWNLOAD_QUEUE.send).toHaveBeenCalledOnce();
});

test.each(["cache", "retry"])("Instagram %s avoids upstream work", async (mode) => {
  enableFastInspection("instagram");
  const ready = { ...job, platform: "instagram", state: "ready", inspection: fastInspection };
  const cached = { value: fastInspection, expiresAt: new Date(Date.now() + 30_000) };
  mocks.jobs.checkDownloadInspectionAdmission.mockResolvedValue(
    mode === "cache" ? { inspection: cached } : { job: ready },
  );
  mocks.jobs.admitDownloadJob.mockResolvedValue(ready);
  expect(await (await call("create", instagramInspectionPayload)).json()).toEqual({ job: ready });
  expect(mocks.inspectInstagram).not.toHaveBeenCalled();
  expect(mocks.inspectYouTube).not.toHaveBeenCalled();
  expect(env.DOWNLOAD_QUEUE.send).not.toHaveBeenCalled();
  if (mode === "cache") expect(mocks.jobs.admitDownloadJob.mock.calls[0][2].inspection).toEqual(cached);
  else expect(mocks.jobs.admitDownloadJob).not.toHaveBeenCalled();
});

test.each(["disabled", "missing limiter", "direct download", "platform disabled"])(
  "Instagram %s leaves extraction to the existing admission path",
  async (mode) => {
    enableFastInspection("instagram");
    if (mode === "disabled") env.DOWNLOADERS_INSTAGRAM_INSPECTION = "false";
    if (mode === "missing limiter") delete env.DOWNLOAD_INSPECTION_RATE_LIMITER;
    if (mode === "platform disabled") env.DOWNLOADERS_PLATFORMS = "youtube";
    const input = { ...instagramInspectionPayload.input, inspect: mode !== "direct download" };
    expect((await call("create", { ...instagramInspectionPayload, input })).status).toBe(202);
    expect(mocks.inspectInstagram).not.toHaveBeenCalled();
    expect(mocks.inspectYouTube).not.toHaveBeenCalled();
    expect(mocks.jobs.checkDownloadInspectionAdmission).not.toHaveBeenCalled();
    expect(mocks.jobs.admitDownloadJob.mock.calls[0][2].inspectionUsage).toBeUndefined();
    expect(env.DOWNLOAD_QUEUE.send).toHaveBeenCalledOnce();
  },
);

test.each(["burst", "quota"])("Instagram %s rejection prevents metadata work", async (mode) => {
  enableFastInspection("instagram");
  if (mode === "burst") env.DOWNLOAD_INSPECTION_RATE_LIMITER.limit.mockResolvedValueOnce({ success: false });
  else mocks.jobs.checkDownloadInspectionAdmission.mockRejectedValue(new DownloadError("DOWNLOAD_QUOTA", "Quota", 429));
  expect((await call("create", instagramInspectionPayload)).status).toBe(429);
  expect(mocks.inspectInstagram).not.toHaveBeenCalled();
  expect(mocks.jobs.admitDownloadJob).not.toHaveBeenCalled();
  expect(env.DOWNLOAD_QUEUE.send).not.toHaveBeenCalled();
});

test("burst limits stop inspection before database admission or upstream work", async () => {
  enableFastInspection();
  env.DOWNLOAD_INSPECTION_RATE_LIMITER.limit.mockResolvedValueOnce({ success: false });
  const response = await call("create", inspectionPayload);
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("60");
  expect(mocks.jobs.checkDownloadInspectionAdmission).not.toHaveBeenCalled();
  expect(mocks.inspectYouTube).not.toHaveBeenCalled();
  expect(mocks.jobs.admitDownloadJob).not.toHaveBeenCalled();
});

test("admin or daily quota preflight failures stop upstream work", async () => {
  enableFastInspection();
  mocks.jobs.checkDownloadInspectionAdmission.mockRejectedValue(new DownloadError("DOWNLOAD_QUOTA", "Quota", 429));
  expect((await call("create", inspectionPayload)).status).toBe(429);
  expect(mocks.inspectYouTube).not.toHaveBeenCalled();
  expect(mocks.jobs.admitDownloadJob).not.toHaveBeenCalled();
});

test("atomic admission still rejects a quota race after a successful metadata lookup", async () => {
  enableFastInspection();
  mocks.inspectYouTube.mockResolvedValue({ inspection: fastInspection, sourceBytes: 1000, workMs: 500 });
  mocks.jobs.admitDownloadJob.mockRejectedValue(new DownloadError("DOWNLOAD_QUOTA", "Quota", 429));
  expect((await call("create", inspectionPayload)).status).toBe(429);
  expect(env.DOWNLOAD_QUEUE.send).not.toHaveBeenCalled();
});

test.each([
  ["youtube", "https://www.youtube.com/watch?v=BaW_jenozKc"],
  ["tiktok", "https://www.tiktok.com/@creator/video/7421234567890123456"],
  ["instagram", "https://www.instagram.com/reel/C_abc123-xy/"],
  ["facebook", "https://www.facebook.com/reel/123456789012345"],
  ["x", "https://x.com/creator/status/1234567890123456789"],
  ["pinterest", "https://www.pinterest.com/pin/123456789012345/"],
  ["reddit", "https://www.reddit.com/r/videos/comments/1abc123/example_title/"],
  ["vimeo", "https://vimeo.com/123456789"],
  ["twitch", "https://clips.twitch.tv/ExampleClip-abc123"],
  ["dailymotion", "https://www.dailymotion.com/video/x9abcde"],
  ["linkedin", "https://www.linkedin.com/feed/update/urn:li:activity:1234567890123456789/"],
  ["snapchat", "https://www.snapchat.com/spotlight/W7_EDlXWTBiXAEEn-example"],
])("%s routes cached inspections through shared policy checks and atomic admission", async (platform, url) => {
  enableFastInspection();
  env.DOWNLOADERS_PLATFORMS = platform;
  const cached = { value: fastInspection, expiresAt: new Date(Date.now() + 30_000) };
  mocks.jobs.checkDownloadInspectionAdmission.mockResolvedValue({ inspection: cached });
  const ready = { ...job, platform, state: "ready", inspection: fastInspection };
  mocks.jobs.admitDownloadJob.mockResolvedValue(ready);
  const response = await call("create", { ...inspectionPayload, input: { ...inspectionInput, platform, url } });
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ job: ready });
  const fast = platform === "youtube" || platform === "instagram";
  expect(mocks.jobs.checkDownloadInspectionAdmission).toHaveBeenCalledTimes(fast ? 1 : 0);
  expect(mocks.jobs.admitDownloadJob).toHaveBeenCalledOnce();
  expect(mocks.jobs.admitDownloadJob.mock.calls[0][2].inspection).toEqual(fast ? cached : undefined);
  expect(env.DOWNLOAD_INSPECTION_RATE_LIMITER.limit).toHaveBeenCalledTimes(2);
  expect(mocks.inspectYouTube).not.toHaveBeenCalled();
  expect(mocks.inspectInstagram).not.toHaveBeenCalled();
  expect(env.DOWNLOAD_QUEUE.send).not.toHaveBeenCalled();
});

test.each(["cache miss", "burst rejected", "quota rejected"])(
  "native inspection %s uses one admission boundary before any work",
  async (mode) => {
    enableFastInspection("dailymotion");
    const payload = {
      ...inspectionPayload,
      input: { ...inspectionInput, platform: "dailymotion", url: "https://www.dailymotion.com/video/x9abcde" },
    };
    if (mode === "burst rejected") env.DOWNLOAD_INSPECTION_RATE_LIMITER.limit.mockResolvedValueOnce({ success: false });
    if (mode === "quota rejected")
      mocks.jobs.admitDownloadJob.mockRejectedValue(new DownloadError("DOWNLOAD_QUOTA", "Quota", 429));
    const response = await call("create", payload);
    expect(response.status).toBe(mode === "cache miss" ? 202 : 429);
    expect(mocks.jobs.checkDownloadInspectionAdmission).not.toHaveBeenCalled();
    expect(mocks.jobs.admitDownloadJob).toHaveBeenCalledTimes(mode === "burst rejected" ? 0 : 1);
    expect(mocks.inspectYouTube).not.toHaveBeenCalled();
    expect(mocks.inspectInstagram).not.toHaveBeenCalled();
    expect(env.DOWNLOAD_QUEUE.send).toHaveBeenCalledTimes(mode === "cache miss" ? 1 : 0);
  },
);

test.each(["create", "select"])(
  "%s returns after durable admission while queue publication continues",
  async (action) => {
    let complete;
    mocks.jobs.claimDueDownloadDispatches.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    mocks.jobs.selectDownloadFormat.mockResolvedValue(job);
    const background = [];
    const response = await worker.fetch(
      new Request(`https://downloaders.internal/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "create" ? inspectionPayload : { owners: [guest], jobId, formatId: "136+140" }),
      }),
      env,
      { waitUntil: (task) => background.push(task) },
    );
    expect(response.status).toBe(202);
    expect(background).toHaveLength(1);
    expect(env.DOWNLOAD_QUEUE.send).not.toHaveBeenCalled();
    complete([{ jobId, dispatchVersion: 1 }]);
    await Promise.all(background);
    expect(env.DOWNLOAD_QUEUE.send).toHaveBeenCalledWith({ jobId, dispatchVersion: 1 });
    expect(mocks.jobs.markDownloadDispatched).toHaveBeenCalledWith(jobId, 1);
  },
);

test("queue failure after the response leaves the durable job accepted for outbox recovery", async () => {
  env.DOWNLOAD_QUEUE.send.mockRejectedValue(new Error("Queue unavailable"));
  const background = [];
  const response = await worker.fetch(
    new Request("https://downloaders.internal/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inspectionPayload),
    }),
    env,
    { waitUntil: (task) => background.push(task) },
  );
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ job });
  await Promise.all(background);
  expect(mocks.jobs.markDownloadDispatched).not.toHaveBeenCalled();
});

test.each(["disabled", "missing limiter", "direct download"])("%s uses the existing admission path", async (mode) => {
  enableFastInspection();
  if (mode === "disabled") env.DOWNLOADERS_YOUTUBE_INSPECTION = "false";
  if (mode === "missing limiter") delete env.DOWNLOAD_INSPECTION_RATE_LIMITER;
  const input = { ...inspectionInput, inspect: mode !== "direct download" };
  expect((await call("create", { ...inspectionPayload, input })).status).toBe(202);
  expect(mocks.inspectYouTube).not.toHaveBeenCalled();
  expect(mocks.jobs.checkDownloadInspectionAdmission).not.toHaveBeenCalled();
  expect(env.DOWNLOAD_QUEUE.send).toHaveBeenCalledOnce();
});

test("selection continues the existing owner's job and preserves acceptance during queue outage", async () => {
  mocks.jobs.selectDownloadFormat
    .mockRejectedValueOnce(new DownloadError("NOT_FOUND", "Unavailable", 404))
    .mockResolvedValueOnce(job);
  env.DOWNLOAD_QUEUE.send.mockRejectedValue(new Error("unavailable"));
  const response = await call("select", { owners: [account, guest], jobId, formatId: "137+140" });
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ job });
  expect(mocks.jobs.selectDownloadFormat.mock.calls.map(([owner, id, format]) => [owner, id, format])).toEqual([
    [account, jobId, "137+140"],
    [guest, jobId, "137+140"],
  ]);
  expect(mocks.jobs.admitDownloadJob).not.toHaveBeenCalled();
  expect(mocks.jobs.markDownloadDispatched).not.toHaveBeenCalled();
});

test.each(["", "18/22", "137+140+139", "https://media.example", "-f best"])(
  "selection rejects an invalid format ID %s",
  async (formatId) => {
    expect((await call("select", { owners: [guest], jobId, formatId })).status).toBe(400);
    expect(mocks.jobs.selectDownloadFormat).not.toHaveBeenCalled();
  },
);

function localCall(path, body, overrides = {}) {
  const secret = "local-worker-test-secret-".repeat(3);
  env.DOWNLOADERS_LOCAL = "true";
  env.DOWNLOADERS_CONTROL_SECRET = secret;
  const payload = JSON.stringify(body);
  const token = signCapability(
    {
      purpose: "download-local-control-v1",
      path,
      bodyHash: createHash("sha256").update(payload).digest("hex"),
      expiresAt: Math.floor(Date.now() / 1000) + 60,
    },
    secret,
  );
  return worker.fetch(
    new Request(`http://localhost:8788${path}`, {
      method: "POST",
      body: payload,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      ...overrides,
    }),
    env,
  );
}

test("local control authenticates and binds the owner envelope before database access", async () => {
  const response = await localCall("/status", { owners: [guest], jobId });
  expect(response.status).toBe(200);
  expect(mocks.jobs.getDownloadJob).toHaveBeenCalledWith(guest, jobId);
  mocks.database.mockClear();
  const tampered = await localCall(
    "/status",
    { owners: [guest], jobId },
    {
      body: JSON.stringify({ owners: [account], jobId }),
    },
  );
  expect(tampered.status).toBe(403);
  expect(mocks.database).not.toHaveBeenCalled();
});

test("local mode rejects unsigned envelopes including forged internal Host", async () => {
  env.DOWNLOADERS_LOCAL = "true";
  expect((await call("status", { owners: [guest], jobId }, "http://localhost:8788/")).status).toBe(403);
  expect((await call("status", { owners: [guest], jobId })).status).toBe(404);
  expect(mocks.database).not.toHaveBeenCalled();
});

test("local health and maintenance require capabilities and production does not expose them", async () => {
  expect((await localCall("/__download-health", {})).status).toBe(200);
  expect((await localCall("/__download-maintenance", {})).status).toBe(200);
  expect(mocks.jobs.expireDownloadArtifacts).toHaveBeenCalled();
  env.DOWNLOADERS_LOCAL = "false";
  expect((await call("__download-health", {}, "http://localhost:8788/")).status).toBe(404);
  expect((await call("__download-storage/health", {}, "http://localhost:8788/", "GET")).status).toBe(404);
});

test("internal service rejects public URL and unsupported method despite a forged Host header", async () => {
  expect((await call("status", { owners: [guest], jobId }, "https://public.example/")).status).toBe(404);
  expect((await call("status", { owners: [guest], jobId }, undefined, "GET")).status).toBe(404);
  expect(mocks.database).not.toHaveBeenCalled();
});

test("queue publication outage preserves accepted job and 202 response for durable retry", async () => {
  env.DOWNLOAD_QUEUE.send.mockRejectedValue(new Error("queue transport lost"));
  const input = { platform: "youtube", url: "https://www.youtube.com/watch?v=abcdefghijk", quality: "720", requestId };
  const response = await call("create", { owners: [guest], input, networkHash: "a".repeat(64) });
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ job });
  expect(mocks.jobs.admitDownloadJob).toHaveBeenCalledOnce();
  expect(mocks.jobs.markDownloadDispatched).not.toHaveBeenCalled();
  expect(mocks.database.mock.calls.every(([, connection]) => connection === env.DB.connectionString)).toBe(true);
});

test("retained guest proof is tried only after account ownership returns 404", async () => {
  mocks.jobs.getDownloadJob
    .mockRejectedValueOnce(new DownloadError("NOT_FOUND", "Unavailable", 404))
    .mockResolvedValueOnce(job);
  const response = await call("status", { owners: [account, guest], jobId });
  expect(response.status).toBe(200);
  expect(mocks.jobs.getDownloadJob.mock.calls).toEqual([
    [account, jobId],
    [guest, jobId],
  ]);
  mocks.jobs.getDownloadJob.mockClear().mockRejectedValue(new DownloadError("DATABASE_ERROR", "Unavailable", 503));
  expect((await call("status", { owners: [account, guest], jobId })).status).toBe(503);
  expect(mocks.jobs.getDownloadJob).toHaveBeenCalledTimes(1);
});

test("missing submission checks retained guest proof without transferring ownership", async () => {
  mocks.jobs.findDownloadSubmission.mockResolvedValueOnce(null).mockResolvedValueOnce(job);
  expect((await call("submission", { owners: [account, guest], requestId })).status).toBe(200);
  expect(mocks.jobs.findDownloadSubmission.mock.calls).toEqual([
    [account, requestId],
    [guest, requestId],
  ]);
});

test("expired artifacts never get a signed redirect and valid redirects are capped by retention", async () => {
  mocks.jobs.getArtifactForOwner.mockResolvedValue({
    storageKey: "sealed/job/file",
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  });
  expect((await call("artifact", { owners: [guest], jobId, artifactId })).status).toBe(410);
  expect(mocks.sign).not.toHaveBeenCalled();
  mocks.jobs.getArtifactForOwner.mockResolvedValue({
    storageKey: "sealed/job/file",
    expiresAt: new Date(Date.now() + 90_000).toISOString(),
  });
  const response = await call("artifact", { owners: [guest], jobId, artifactId });
  expect(response.status).toBe(303);
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.sign.mock.calls[0][3]).toBeGreaterThan(0);
  expect(mocks.sign.mock.calls[0][3]).toBeLessThanOrEqual(90);
});

test("malformed queue messages are acknowledged without execution and classified delays retry", async () => {
  const malformed = { body: { jobId: "invalid", dispatchVersion: 1 }, ack: vi.fn(), retry: vi.fn() };
  const valid = { body: { jobId, dispatchVersion: 1 }, ack: vi.fn(), retry: vi.fn() };
  mocks.dispatch.mockResolvedValue({ status: "retry", delaySeconds: 7 });
  await worker.queue({ messages: [malformed, valid] }, env);
  expect(malformed.ack).toHaveBeenCalledOnce();
  expect(malformed.retry).not.toHaveBeenCalled();
  expect(mocks.dispatch).toHaveBeenCalledOnce();
  expect(valid.retry).toHaveBeenCalledWith({ delaySeconds: 7 });
  expect(valid.ack).not.toHaveBeenCalled();
});

test("unexpected dispatch errors retry safely without logging sensitive exception text", async () => {
  const message = { body: { jobId, dispatchVersion: 1 }, ack: vi.fn(), retry: vi.fn() };
  mocks.dispatch.mockRejectedValue(new Error("https://private.example?credential=secret"));
  await worker.queue({ messages: [message] }, env);
  expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
  expect(JSON.stringify(console.warn.mock.calls)).not.toContain("secret");
});

test("artifact deletion failure cannot mark it deleted or prevent independent cleanup", async () => {
  mocks.jobs.expireDownloadArtifacts.mockResolvedValue([
    { artifactId: "one", storageKey: "sealed/one" },
    { artifactId: "two", storageKey: "sealed/two" },
  ]);
  env.DOWNLOAD_FILES.delete.mockRejectedValueOnce(new Error("R2 unavailable")).mockResolvedValue(undefined);
  await worker.scheduled({}, env);
  expect(mocks.jobs.markDownloadArtifactDeleted).not.toHaveBeenCalledWith("one");
  expect(mocks.jobs.markDownloadArtifactDeleted).toHaveBeenCalledWith("two");
  expect(mocks.jobs.pruneDownloadHistory).toHaveBeenCalled();
  expect(env.DOWNLOAD_FILES.list).toHaveBeenCalledTimes(2);
});

test("one failed orphan prefix sweep does not prevent the other prefix", async () => {
  env.DOWNLOAD_FILES.list.mockRejectedValueOnce(new Error("staging listing failed"));
  await worker.scheduled({}, env);
  expect(env.DOWNLOAD_FILES.list.mock.calls.map(([options]) => options.prefix)).toEqual(["staging/", "sealed/"]);
  expect(slot.advanceCleanupCursor).toHaveBeenCalledWith("sealed/", undefined);
});
