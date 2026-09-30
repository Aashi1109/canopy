import { afterEach, beforeEach, expect, test, vi } from "vitest";

const ledger = vi.hoisted(() => ({
  claimDownloadJob: vi.fn(),
  consumeDownloadEngineStart: vi.fn(),
  heartbeatDownloadAttempt: vi.fn(),
  finishDownloadAttempt: vi.fn(),
}));
vi.mock("../lib/downloaders/jobs.ts", () => ledger);
import { dispatchDownloadJob } from "../lib/downloaders/dispatcher.ts";

const token = { jobId: "job", attemptId: "attempt", generation: 3, slotId: "slot-0", slotGeneration: 7 };
const artifactId = "00000000-0000-4000-8000-000000000001";
const sourceId = "BaW_jenozKc";
const claim = () => ({
  status: "claimed",
  token,
  input: {
    platform: "youtube",
    url: `https://www.youtube.com/watch?v=${sourceId}`,
    quality: "720",
    requestId: "request",
  },
  owner: { kind: "guest", id: "owner" },
  deadline: new Date(60_000).toISOString(),
  remaining: { workMs: 60_000, sourceBytes: 1_000_000, engineStarts: 2 },
});
const limits = { maxEngineStarts: 2, leaseMs: 30_000 };
const options = { slotIds: ["slot-0"], limits };
const message = { jobId: "job", dispatchVersion: 1 };
const staged = [
  { artifactId, storageKey: "staging/job/one", putUrl: "https://storage.test/put", getUrl: "https://storage.test/get" },
];
const artifact = {
  id: artifactId,
  storageKey: staged[0].storageKey,
  etag: "etag",
  name: "video.mp4",
  mime: "video/mp4",
  bytes: 100,
  width: 1280,
  height: 720,
  durationSeconds: 10,
  hasAudio: true,
};
const sealed = [
  {
    id: artifactId,
    storageKey: "final/job/one",
    filename: "video.mp4",
    mimeType: "video/mp4",
    sizeBytes: 100,
    etag: "sealed",
    metadata: { width: 1280, height: 720, durationSeconds: 10, hasAudio: true },
  },
];
const inspection = {
  title: "Example video",
  durationSeconds: 10,
  formats: [
    {
      id: "18",
      container: "mp4",
      width: 640,
      height: 360,
      fps: 30,
      bytes: 100,
      estimatedBytes: false,
      hasAudio: true,
      requiresMerge: false,
      videoCodec: "avc1",
    },
  ],
};
const verifiedPosts = [
  ["x", "https://x.com/i/status/1575560063510810624", "1575560063510810624", "Twitter"],
  ["pinterest", "https://www.pinterest.com/pin/1084663891475263837/", "1084663891475263837", "Pinterest"],
  ["reddit", "https://www.reddit.com/r/videos/comments/1abc123/", "1abc123", "Reddit"],
  [
    "linkedin",
    "https://www.linkedin.com/feed/update/urn:li:activity:1234567890123456789/",
    "1234567890123456789",
    "LinkedIn",
  ],
];
function status(overrides = {}) {
  return {
    state: "succeeded",
    stopped: true,
    phase: "validating",
    usage: { workMs: 100, sourceBytes: 200 },
    artifacts: [artifact],
    evidence: { originalComposition: "complete", sourceId, items: [{ id: sourceId, type: "video" }] },
    error: null,
    ...overrides,
  };
}
function runtime() {
  let now = 0;
  return {
    database: async (operation) => operation(),
    now: () => now,
    sleep: vi.fn(async (ms) => {
      now += ms;
    }),
    resolveShortLink: vi.fn(async () => claim().input.url),
    createStagingArtifacts: vi.fn(async () => staged),
    sealArtifacts: vi.fn(async () => sealed),
    start: vi.fn(async () => status()),
    status: vi.fn(async () => status()),
    cancel: vi.fn(async () => status({ state: "cancelled", artifacts: [], evidence: null })),
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  ledger.claimDownloadJob.mockResolvedValue(claim());
  ledger.consumeDownloadEngineStart.mockResolvedValue({ allowed: true, remaining: 1, ordinal: 1 });
  ledger.heartbeatDownloadAttempt.mockResolvedValue({ accepted: true, shouldStop: false });
  ledger.finishDownloadAttempt.mockResolvedValue({ accepted: true, state: "succeeded" });
});
afterEach(() => vi.restoreAllMocks());

test("timing logs aggregate heartbeat work and omit source and owner data", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const io = runtime();
  io.start.mockResolvedValue(status({ state: "running", stopped: false, artifacts: [], evidence: null }));
  await dispatchDownloadJob(message, options, io);
  const events = log.mock.calls.map(([line]) => JSON.parse(line));
  const heartbeat = events.filter((event) => event.stage === "dispatcher.heartbeat_db");
  expect(heartbeat).toHaveLength(1);
  expect(heartbeat[0]).toMatchObject({ event: "downloader_timing", jobId: "job", requestId: "request" });
  expect(heartbeat[0].count).toBe(ledger.heartbeatDownloadAttempt.mock.calls.length);
  expect(events.map((event) => event.stage)).toEqual(
    expect.arrayContaining([
      "dispatcher.claim_db",
      "dispatcher.engine_debit_db",
      "dispatcher.container_start_rpc",
      "dispatcher.container_status_rpc",
      "dispatcher.settlement_db",
      "dispatcher.total",
    ]),
  );
  expect(events.every((event) => Number.isFinite(event.durationMs) && event.durationMs >= 0)).toBe(true);
  expect(JSON.stringify(events)).not.toMatch(/https:|owner|guest|storage|capability|BaW_jenozKc/);
});

test("failed claim still records bounded timing without logging its error", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  ledger.claimDownloadJob.mockRejectedValue(new Error("secret database url"));
  await expect(dispatchDownloadJob(message, options, runtime())).rejects.toThrow("secret database url");
  const events = log.mock.calls.map(([line]) => JSON.parse(line));
  expect(events.map((event) => event.stage)).toEqual(["dispatcher.claim_db", "dispatcher.total"]);
  expect(JSON.stringify(events)).not.toContain("secret database url");
});

test("inspection stores formats without allocating, uploading or publishing media", async () => {
  const input = claim();
  input.input.inspect = true;
  ledger.claimDownloadJob.mockResolvedValue(input);
  const io = runtime();
  io.start.mockResolvedValue(status({ inspection, artifacts: [] }));
  await dispatchDownloadJob(message, options, io);
  expect(io.start.mock.calls[0][1]).toMatchObject({ request: { inspect: true }, stagingArtifacts: [] });
  expect(io.createStagingArtifacts).not.toHaveBeenCalled();
  expect(io.sealArtifacts).not.toHaveBeenCalled();
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(
    token,
    expect.objectContaining({
      outcome: "ready",
      stopped: true,
      inspection,
      sourceUrl: claim().input.url,
    }),
  );
});

test.each(verifiedPosts)(
  "%s inspects verified public posts without downloading media",
  async (platform, url, id, extractor) => {
    ledger.claimDownloadJob.mockResolvedValue({
      ...claim(),
      input: { ...claim().input, platform, url, inspect: true },
    });
    const io = runtime();
    io.start.mockResolvedValue(
      status({
        inspection,
        artifacts: [],
        evidence: { originalComposition: "complete", sourceId: id, items: [{ id: `media-${id}`, type: "video" }] },
      }),
    );
    await dispatchDownloadJob(message, options, io);
    expect(io.start).toHaveBeenCalledExactlyOnceWith(
      token,
      expect.objectContaining({
        request: expect.objectContaining({
          engine: "yt-dlp",
          inspect: true,
          url,
          sourceId: id,
          extractorKeys: [extractor],
          sourceComposition: "verified-post",
        }),
        stagingArtifacts: [],
      }),
    );
    expect(io.createStagingArtifacts).not.toHaveBeenCalled();
    expect(io.sealArtifacts).not.toHaveBeenCalled();
    expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(
      token,
      expect.objectContaining({ outcome: "ready", inspection, sourceUrl: url }),
    );
  },
);

test.each(verifiedPosts)(
  "%s downloads the selected original only after verified post evidence",
  async (platform, url, id) => {
    const expectedFormat = inspection.formats[0];
    ledger.claimDownloadJob.mockResolvedValue({
      ...claim(),
      input: {
        ...claim().input,
        platform,
        url,
        inspect: true,
        selectedFormat: expectedFormat.id,
        expectedFormat,
      },
    });
    const io = runtime();
    io.start.mockResolvedValue(
      status({
        artifacts: [{ ...artifact, width: expectedFormat.width, height: expectedFormat.height }],
        evidence: { originalComposition: "complete", sourceId: id, items: [{ id: `media-${id}`, type: "video" }] },
      }),
    );
    await dispatchDownloadJob(message, options, io);
    expect(io.start).toHaveBeenCalledExactlyOnceWith(
      token,
      expect.objectContaining({
        request: expect.objectContaining({
          engine: "yt-dlp",
          sourceComposition: "verified-post",
          selectedFormat: expectedFormat.id,
          expectedFormat,
        }),
      }),
    );
    expect(io.sealArtifacts).toHaveBeenCalledTimes(1);
    expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(
      token,
      expect.objectContaining({ outcome: "succeeded", artifacts: sealed }),
    );
  },
);

test.each(verifiedPosts)(
  "%s cannot publish formats or fallback from incomplete, mixed or mismatched post evidence",
  async (platform, url, id) => {
    for (const invalid of [
      { originalComposition: "unknown", sourceId: id, items: [{ id: "video", type: "video" }] },
      {
        originalComposition: "complete",
        sourceId: id,
        items: [
          { id: "video", type: "video" },
          { id: "photo", type: "image" },
        ],
      },
      { originalComposition: "complete", sourceId: "another-post", items: [{ id: "video", type: "video" }] },
    ]) {
      ledger.finishDownloadAttempt.mockClear();
      ledger.claimDownloadJob.mockResolvedValue({
        ...claim(),
        input: { ...claim().input, platform, url, inspect: true },
      });
      const io = runtime();
      io.start.mockResolvedValue(status({ inspection, artifacts: [], evidence: invalid }));
      await dispatchDownloadJob(message, options, io);
      expect(io.start).toHaveBeenCalledTimes(1);
      expect(io.sealArtifacts).not.toHaveBeenCalled();
      expect(ledger.finishDownloadAttempt).toHaveBeenCalledExactlyOnceWith(
        token,
        expect.objectContaining({ outcome: "failed" }),
      );
    }
  },
);

test("short inspections renew and debit once without heartbeat transactions or terminal polling delay", async () => {
  const input = claim();
  input.input.inspect = true;
  ledger.claimDownloadJob.mockResolvedValue(input);
  const io = runtime();
  const running = status({ state: "running", stopped: false, artifacts: [], evidence: null });
  io.start.mockResolvedValue(running);
  io.status.mockImplementation(async () => (io.now() < 1_500 ? running : status({ inspection, artifacts: [] })));
  await dispatchDownloadJob(message, options, io);
  expect(io.now()).toBe(1_500);
  expect(ledger.heartbeatDownloadAttempt).not.toHaveBeenCalled();
  expect(ledger.consumeDownloadEngineStart).toHaveBeenCalledExactlyOnceWith(token, {
    workMs: 0,
    sourceBytes: 0,
    phase: "inspecting",
  });
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(token, expect.objectContaining({ outcome: "ready" }));
});

test("long inspections periodically renew the lease with cumulative usage", async () => {
  const input = claim();
  input.input.inspect = true;
  ledger.claimDownloadJob.mockResolvedValue(input);
  const io = runtime();
  const running = status({ state: "running", stopped: false, artifacts: [], evidence: null });
  io.start.mockResolvedValue(running);
  io.status.mockImplementation(async () => (io.now() < 6_000 ? running : status({ inspection, artifacts: [] })));
  await dispatchDownloadJob(message, options, io);
  expect(ledger.heartbeatDownloadAttempt).toHaveBeenCalledExactlyOnceWith(token, {
    workMs: 5_000,
    sourceBytes: 200,
    phase: "inspecting",
  });
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(token, expect.objectContaining({ outcome: "ready" }));
});

test("cancellation in the combined pre-start check prevents native execution", async () => {
  ledger.consumeDownloadEngineStart.mockResolvedValue({ allowed: false, remaining: 0, shouldStop: true });
  const io = runtime();
  await dispatchDownloadJob(message, options, io);
  expect(io.start).not.toHaveBeenCalled();
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(
    token,
    expect.objectContaining({
      outcome: "failed",
      error: expect.objectContaining({ code: "DOWNLOAD_STOPPED" }),
    }),
  );
});

test("a deadline reached during the start debit prevents native execution", async () => {
  const io = runtime();
  ledger.consumeDownloadEngineStart.mockImplementation(async () => {
    await io.sleep(60_000);
    return { allowed: true, remaining: 1, ordinal: 1 };
  });
  await dispatchDownloadJob(message, options, io);
  expect(io.start).not.toHaveBeenCalled();
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(
    token,
    expect.objectContaining({ outcome: "failed", stopped: true }),
  );
});

test("a stopped inspection that exhausted its budget still cannot publish formats", async () => {
  const input = claim();
  input.input.inspect = true;
  ledger.claimDownloadJob.mockResolvedValue(input);
  const io = runtime();
  io.start.mockResolvedValue(status({ inspection, artifacts: [], usage: { workMs: 60_000, sourceBytes: 200 } }));
  await dispatchDownloadJob(message, options, io);
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(
    token,
    expect.objectContaining({
      outcome: "failed",
      error: expect.objectContaining({ code: "DOWNLOAD_STOPPED" }),
    }),
  );
});

test.each([
  [874.1, "ready"],
  [1800, "ready"],
  [1800.1, "failed"],
])("inspection enforces the 30-minute duration boundary for %s seconds", async (durationSeconds, outcome) => {
  const input = claim();
  input.input.inspect = true;
  ledger.claimDownloadJob.mockResolvedValue(input);
  const io = runtime();
  io.start.mockResolvedValue(status({ inspection: { ...inspection, durationSeconds }, artifacts: [] }));
  await dispatchDownloadJob(message, options, io);
  expect(io.start.mock.calls[0][1].limits.durationSeconds).toBe(1800);
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(token, expect.objectContaining({ outcome }));
});

test.each([
  { artifacts: [artifact] },
  { evidence: { originalComposition: "unknown", sourceId, items: [] } },
  { inspection: { ...inspection, formats: [] } },
  { inspection: { ...inspection, formats: [{ ...inspection.formats[0], height: 1080, width: 1920 }] } },
  { inspection: { ...inspection, formats: [{ ...inspection.formats[0], bytes: 300 * 1024 * 1024 }] } },
  { inspection: { ...inspection, formats: [{ ...inspection.formats[0], url: "https://source.test/private" }] } },
  { inspection: { ...inspection, formats: [{ ...inspection.formats[0], id: "137+140", requiresMerge: false }] } },
])("invalid or unverified inspection never publishes choices: %j", async (override) => {
  const input = claim();
  input.input.inspect = true;
  ledger.claimDownloadJob.mockResolvedValue(input);
  const io = runtime();
  io.start.mockResolvedValue(status({ inspection, artifacts: [], ...override }));
  await dispatchDownloadJob(message, options, io);
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(token, expect.objectContaining({ outcome: "failed" }));
  expect(io.sealArtifacts).not.toHaveBeenCalled();
});

test("selected properties remain bound when a technical failure falls back to Cobalt", async () => {
  const input = claim();
  input.input.inspect = true;
  input.input.selectedFormat = "137+140";
  input.input.expectedFormat = { ...inspection.formats[0], id: "137+140", requiresMerge: true };
  ledger.claimDownloadJob.mockResolvedValue(input);
  const io = runtime();
  io.start.mockResolvedValue(
    status({
      state: "failed",
      artifacts: [],
      evidence: null,
      error: { code: "extraction_failed", message: "Failed", retryable: true },
    }),
  );
  await dispatchDownloadJob(message, options, io);
  expect(io.start).toHaveBeenCalledTimes(2);
  expect(io.start.mock.calls[0][1].request).toMatchObject({ engine: "yt-dlp", selectedFormat: "137+140" });
  expect(io.start.mock.calls[0][1].request.expectedFormat).toEqual(input.input.expectedFormat);
  expect(io.start.mock.calls[1][1].request).toMatchObject({
    engine: "cobalt",
    selectedFormat: "137+140",
    expectedFormat: input.input.expectedFormat,
  });
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(token, expect.objectContaining({ outcome: "failed" }));
});

test("Cobalt-owned formats execute only through their resolver", async () => {
  const input = claim();
  input.input.inspect = true;
  input.input.platform = "instagram";
  input.input.url = "https://www.instagram.com/reel/Chunk8-jurw/";
  input.input.selectedFormat = "cobalt.1234567890abcdef12345678";
  input.input.expectedFormat = { ...inspection.formats[0], id: input.input.selectedFormat };
  ledger.claimDownloadJob.mockResolvedValue(input);
  const io = runtime();
  io.start.mockResolvedValue(
    status({
      evidence: {
        originalComposition: "complete",
        sourceId: "Chunk8-jurw",
        items: [{ id: "Chunk8-jurw", type: "video" }],
      },
    }),
  );
  await dispatchDownloadJob(message, options, io);
  expect(io.start).toHaveBeenCalledOnce();
  expect(io.start.mock.calls[0][1].request).toMatchObject({
    engine: "cobalt",
    expectedFormat: input.input.expectedFormat,
  });
});

test("inspection can fall back without allocating any media capabilities", async () => {
  const input = claim();
  input.input.inspect = true;
  ledger.claimDownloadJob.mockResolvedValue(input);
  const io = runtime();
  io.start
    .mockResolvedValueOnce(
      status({
        state: "failed",
        artifacts: [],
        evidence: null,
        error: { code: "extraction_failed", message: "Failed", retryable: true },
      }),
    )
    .mockResolvedValueOnce(status({ inspection, artifacts: [] }));
  await dispatchDownloadJob(message, options, io);
  expect(io.start).toHaveBeenCalledTimes(2);
  expect(io.start.mock.calls[1][1]).toMatchObject({
    request: { engine: "cobalt", inspect: true },
    stagingArtifacts: [],
  });
  expect(io.createStagingArtifacts).not.toHaveBeenCalled();
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(
    token,
    expect.objectContaining({ outcome: "ready", inspection }),
  );
});

test.each([
  ["source_duration_limit", "SOURCE_TOO_LONG"],
  ["format_unavailable", "FORMAT_UNAVAILABLE"],
  ["no_video_formats", "NO_VIDEO_FORMATS"],
  ["multiple_videos_unsupported", "MULTIPLE_VIDEOS"],
])("reports %s with a specific user-facing error", async (nativeCode, publicCode) => {
  const io = runtime();
  io.start.mockResolvedValue(
    status({
      state: "failed",
      artifacts: [],
      evidence: null,
      error: { code: nativeCode, message: "Original extractor failure", retryable: false },
    }),
  );
  await dispatchDownloadJob(message, options, io);
  const result = ledger.finishDownloadAttempt.mock.calls[0][1];
  expect(result.error.code).toBe(publicCode);
  expect(result.error.message).toBe("Original extractor failure");
});

test("debits before native start and publishes only classified, sealed files after stop", async () => {
  const io = runtime();
  expect(await dispatchDownloadJob(message, options, io)).toEqual({ status: "ack" });
  expect(ledger.consumeDownloadEngineStart.mock.invocationCallOrder[0]).toBeLessThan(
    io.start.mock.invocationCallOrder[0],
  );
  expect(io.start).toHaveBeenCalledWith(
    token,
    expect.objectContaining({
      startOrdinal: 1,
      attemptGeneration: 3,
      slotGeneration: 7,
      request: {
        engine: "yt-dlp",
        url: claim().input.url,
        quality: "720",
        noPlaylist: true,
        sourceId: "BaW_jenozKc",
        extractorKeys: ["Youtube"],
        sourceComposition: "single-video",
      },
    }),
  );
  expect(io.sealArtifacts).toHaveBeenCalledWith(
    token,
    staged,
    [artifact],
    expect.objectContaining({ deadline: claim().deadline, heartbeat: expect.any(Function) }),
  );
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(
    token,
    expect.objectContaining({ outcome: "succeeded", stopped: true, artifacts: sealed }),
  );
  expect(io.cancel).not.toHaveBeenCalled();
});

test.each(["terminal", "stale", "busy", "deferred"])("%s claim never starts work", async (state) => {
  ledger.claimDownloadJob.mockResolvedValue({ status: state, retryAfterSeconds: 9 });
  const io = runtime();
  expect(await dispatchDownloadJob(message, options, io)).toEqual(
    ["busy", "deferred"].includes(state) ? { status: "retry", delaySeconds: 9 } : { status: "ack" },
  );
  expect(io.start).not.toHaveBeenCalled();
  expect(ledger.consumeDownloadEngineStart).not.toHaveBeenCalled();
});

test("exhausted durable start allowance prevents native execution", async () => {
  ledger.consumeDownloadEngineStart.mockResolvedValue({ allowed: false, remaining: 0 });
  const io = runtime();
  await dispatchDownloadJob(message, options, io);
  expect(io.start).not.toHaveBeenCalled();
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(
    token,
    expect.objectContaining({ outcome: "failed", stopped: true }),
  );
});

test("one classified technical failure may use an approved alternate with a second debit", async () => {
  ledger.consumeDownloadEngineStart
    .mockResolvedValueOnce({ allowed: true, remaining: 1, ordinal: 1 })
    .mockResolvedValueOnce({ allowed: true, remaining: 0, ordinal: 2 });
  const io = runtime();
  io.start.mockResolvedValueOnce(
    status({
      state: "failed",
      artifacts: [],
      evidence: null,
      error: { code: "upstream_failure", message: "private details", retryable: true },
    }),
  );
  await dispatchDownloadJob(message, options, io);
  expect(io.start).toHaveBeenCalledTimes(2);
  expect(io.start.mock.calls[1][1]).toMatchObject({ startOrdinal: 2, request: { engine: "cobalt" } });
  expect(ledger.consumeDownloadEngineStart).toHaveBeenCalledTimes(2);
});

test.each([
  "authentication_required",
  "private",
  "rate_limited",
  "timeout",
  "resource_limit",
  "engine_failed",
  "completeness_unverified",
])("%s never triggers fallback even when marked retryable", async (code) => {
  const io = runtime();
  io.start.mockResolvedValue(
    status({
      state: "failed",
      artifacts: [],
      evidence: null,
      error: { code, message: "https://signed.url/?token=secret", retryable: true },
    }),
  );
  await dispatchDownloadJob(message, options, io);
  expect(io.start).toHaveBeenCalledTimes(1);
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(
    token,
    expect.objectContaining({ error: expect.objectContaining({ message: "https://signed.url/?token=secret" }) }),
  );
});

test("unknown composition and mismatched output counts cannot publish or fallback", async () => {
  for (const evidence of [
    { originalComposition: "unknown", sourceId, items: [{ id: sourceId, type: "video" }] },
    null,
  ]) {
    const io = runtime();
    io.start.mockResolvedValue(status({ evidence }));
    await dispatchDownloadJob(message, options, io);
    expect(io.sealArtifacts).not.toHaveBeenCalled();
    expect(io.start).toHaveBeenCalledTimes(1);
  }
});

test.each([
  ["source_challenge", "SOURCE_VERIFICATION_REQUIRED"],
  ["source_unavailable", "SOURCE_UNAVAILABLE"],
  ["source_denied", "SOURCE_ACCESS_DENIED"],
  ["tls_failed", "SOURCE_CONNECTION_FAILED"],
])("%s retains the extractor message with a stable public error code", async (code, publicCode) => {
  const io = runtime();
  io.start.mockResolvedValue(
    status({
      state: "failed",
      artifacts: [],
      evidence: null,
      error: { code, message: "https://signed.url/?token=secret", retryable: true },
    }),
  );
  await dispatchDownloadJob(message, options, io);
  expect(io.start).toHaveBeenCalledTimes(1);
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(
    token,
    expect.objectContaining({
      outcome: "failed",
      stopped: true,
      error: expect.objectContaining({
        code: publicCode,
        message: "https://signed.url/?token=secret",
        retryable: false,
      }),
    }),
  );
});

test("a YouTube verification failure returns the original message during inspection", async () => {
  const original = (
    "ERROR: [youtube] Q_4Lk4X_i5o: Sign in to confirm you're not a bot. Use --cookies-from-browser or --cookies for the authentication. " +
    "Provider guidance. ".repeat(25)
  ).trim();
  ledger.claimDownloadJob.mockResolvedValue({ ...claim(), input: { ...claim().input, inspect: true } });
  const io = runtime();
  io.start.mockResolvedValue(
    status({
      state: "failed",
      artifacts: [],
      evidence: null,
      error: { code: "source_challenge", message: original, retryable: false },
    }),
  );
  await dispatchDownloadJob(message, options, io);
  expect(io.start).toHaveBeenCalledTimes(1);
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(
    token,
    expect.objectContaining({
      outcome: "failed",
      error: { code: "SOURCE_VERIFICATION_REQUIRED", message: original, retryable: false },
    }),
  );
});

test("the final fallback engine's error text survives settlement", async () => {
  const io = runtime();
  io.start
    .mockResolvedValueOnce(
      status({
        state: "failed",
        artifacts: [],
        evidence: null,
        error: { code: "extraction_failed", message: "yt-dlp could not extract player data", retryable: true },
      }),
    )
    .mockResolvedValueOnce(
      status({
        state: "failed",
        artifacts: [],
        evidence: null,
        error: { code: "engine_failed", message: "Cobalt: player request returned HTTP 502", retryable: false },
      }),
    );
  await dispatchDownloadJob(message, options, io);
  expect(io.start).toHaveBeenCalledTimes(2);
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(
    token,
    expect.objectContaining({
      error: { code: "DOWNLOAD_FAILED", message: "Cobalt: player request returned HTTP 502", retryable: false },
    }),
  );
});

test("an absent extractor message keeps the existing helpful fallback", async () => {
  const io = runtime();
  io.start.mockResolvedValue(
    status({
      state: "failed",
      artifacts: [],
      evidence: null,
      error: { code: "source_challenge", message: "", retryable: false },
    }),
  );
  await dispatchDownloadJob(message, options, io);
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(
    token,
    expect.objectContaining({
      error: expect.objectContaining({ message: "The source requires verification. Try a different public video." }),
    }),
  );
});

test.each([
  { storageKey: "staging/other/job" },
  { id: "00000000-0000-4000-8000-000000000002" },
  { width: 1920, height: 1080 },
  { bytes: 300 * 1024 * 1024 },
])("rejects unallocated or over-limit artifact %j", async (change) => {
  const io = runtime();
  io.start.mockResolvedValue(status({ artifacts: [{ ...artifact, ...change }] }));
  await dispatchDownloadJob(message, options, io);
  expect(io.sealArtifacts).not.toHaveBeenCalled();
});

test("cancellation heartbeat stops running work before settlement", async () => {
  ledger.heartbeatDownloadAttempt.mockResolvedValue({ accepted: true, shouldStop: true });
  const io = runtime();
  io.start.mockResolvedValue(status({ state: "running", stopped: false, artifacts: [], evidence: null }));
  io.status.mockResolvedValue(status({ state: "running", stopped: false, artifacts: [], evidence: null }));
  await dispatchDownloadJob(message, options, io);
  expect(io.cancel).toHaveBeenCalledTimes(1);
  expect(io.sealArtifacts).not.toHaveBeenCalled();
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(
    token,
    expect.objectContaining({ outcome: "failed", stopped: true }),
  );
});

test("an uncertain native start is debited, cancelled and quarantined if stop cannot be confirmed", async () => {
  const io = runtime();
  io.start.mockRejectedValue(new Error("connection disappeared"));
  io.cancel.mockRejectedValue(new Error("no stop proof"));
  await dispatchDownloadJob(message, options, io);
  expect(io.start).toHaveBeenCalledTimes(1);
  expect(io.cancel).toHaveBeenCalledTimes(1);
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(
    token,
    expect.objectContaining({ outcome: "failed", stopped: false, uncertainUsage: true }),
  );
});

test("a failed seal never publishes a partial result", async () => {
  const io = runtime();
  io.sealArtifacts.mockRejectedValue(new Error("etag changed"));
  await dispatchDownloadJob(message, options, io);
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(
    token,
    expect.objectContaining({ outcome: "failed", stopped: true }),
  );
  expect(ledger.finishDownloadAttempt.mock.calls[0][1].artifacts).toBeUndefined();
});

test("an ambiguous finish result is propagated without a second settlement", async () => {
  ledger.finishDownloadAttempt.mockRejectedValue(new Error("commit response lost"));
  await expect(dispatchDownloadJob(message, options, runtime())).rejects.toThrow("commit response lost");
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledTimes(1);
});

test("recovery uses the ledger ordinal and cannot reset the alternate budget", async () => {
  ledger.claimDownloadJob.mockResolvedValue({ ...claim(), remaining: { ...claim().remaining, engineStarts: 1 } });
  ledger.consumeDownloadEngineStart.mockResolvedValue({ allowed: true, remaining: 0, ordinal: 2 });
  const io = runtime();
  io.start.mockResolvedValue(
    status({
      state: "failed",
      artifacts: [],
      evidence: null,
      error: { code: "upstream_failure", message: "temporary", retryable: true },
    }),
  );
  await dispatchDownloadJob(message, options, io);
  expect(io.start).toHaveBeenCalledTimes(1);
  expect(io.start.mock.calls[0][1].startOrdinal).toBe(2);
});

test("a renewed heartbeat fence aborts sealing without a success publication", async () => {
  const io = runtime();
  io.sealArtifacts.mockImplementation(async (_token, _staged, _artifacts, progress) => {
    ledger.heartbeatDownloadAttempt.mockResolvedValue({ accepted: false, shouldStop: true });
    await progress.heartbeat();
    return sealed;
  });
  await dispatchDownloadJob(message, options, io);
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(
    token,
    expect.objectContaining({ outcome: "failed", stopped: true }),
  );
});

test("a deadline reached during polling stops execution without another native read or fallback", async () => {
  ledger.claimDownloadJob.mockResolvedValue({ ...claim(), deadline: new Date(1_000).toISOString() });
  const io = runtime();
  io.start.mockResolvedValue(status({ state: "running", stopped: false, artifacts: [], evidence: null }));
  await dispatchDownloadJob(message, options, io);
  expect(io.status).not.toHaveBeenCalled();
  expect(io.cancel).toHaveBeenCalledTimes(1);
  expect(io.start).toHaveBeenCalledTimes(1);
});

test("all videos in a complete post are required before any artifact publication", async () => {
  const post = {
    ...claim(),
    input: { ...claim().input, platform: "x", url: "https://x.com/i/status/1575560063510810624" },
  };
  ledger.claimDownloadJob.mockResolvedValue(post);
  const io = runtime();
  io.start.mockResolvedValue(
    status({
      evidence: {
        originalComposition: "complete",
        sourceId: "1575560063510810624",
        items: [
          { id: "one", type: "video" },
          { id: "two", type: "video" },
        ],
      },
    }),
  );
  await dispatchDownloadJob(message, options, io);
  expect(io.start).toHaveBeenCalledTimes(1);
  expect(io.sealArtifacts).not.toHaveBeenCalled();
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(token, expect.objectContaining({ outcome: "failed" }));
});

test("stale completion is acknowledged without trying to settle another attempt", async () => {
  ledger.finishDownloadAttempt.mockResolvedValue({ accepted: false });
  const io = runtime();
  expect(await dispatchDownloadJob(message, options, io)).toEqual({ status: "ack" });
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledTimes(1);
  expect(io.cancel).not.toHaveBeenCalled();
});

test("a short-link resolver must return an accepted source on the selected platform", async () => {
  ledger.claimDownloadJob.mockResolvedValue({
    ...claim(),
    input: { ...claim().input, platform: "tiktok", url: "https://vm.tiktok.com/ZMabc123/" },
  });
  const io = runtime();
  await dispatchDownloadJob(message, options, io);
  expect(io.resolveShortLink).toHaveBeenCalledTimes(1);
  expect(io.start).not.toHaveBeenCalled();
});

test("cancellation waits briefly for cleanup and renews the lease before each native check", async () => {
  ledger.heartbeatDownloadAttempt.mockResolvedValue({ accepted: true, shouldStop: true });
  const io = runtime();
  io.start.mockResolvedValue(status({ state: "running", stopped: false, artifacts: [], evidence: null }));
  io.status.mockResolvedValue(status({ state: "running", stopped: false, artifacts: [], evidence: null }));
  io.cancel.mockResolvedValueOnce(
    status({
      state: "running",
      stopped: false,
      artifacts: [],
      evidence: null,
      usage: { workMs: 150, sourceBytes: 400 },
    }),
  );
  io.cancel.mockResolvedValueOnce(
    status({
      state: "cancelled",
      stopped: true,
      artifacts: [],
      evidence: null,
      usage: { workMs: 5250, sourceBytes: 450 },
    }),
  );
  await dispatchDownloadJob(message, options, io);
  expect(io.cancel).toHaveBeenCalledTimes(2);
  expect(io.sleep.mock.calls.filter(([ms]) => ms === 250)).toHaveLength(1);
  const stopHeartbeats = ledger.heartbeatDownloadAttempt.mock.calls.filter(([, usage]) => usage.phase === "stopping");
  expect(stopHeartbeats).toHaveLength(2);
  expect(stopHeartbeats[1][1].sourceBytes).toBe(400);
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(
    token,
    expect.objectContaining({ stopped: true, uncertainUsage: false, usage: { workMs: 5250, sourceBytes: 450 } }),
  );
});

test("cancellation stops checking after five seconds without claiming unconfirmed cleanup", async () => {
  ledger.heartbeatDownloadAttempt.mockResolvedValue({ accepted: true, shouldStop: true });
  const io = runtime();
  io.start.mockResolvedValue(status({ state: "running", stopped: false, artifacts: [], evidence: null }));
  io.status.mockResolvedValue(status({ state: "running", stopped: false, artifacts: [], evidence: null }));
  io.cancel.mockResolvedValue(status({ state: "running", stopped: false, artifacts: [], evidence: null }));
  await dispatchDownloadJob(message, options, io);
  expect(io.now()).toBe(10_000);
  expect(io.cancel).toHaveBeenCalledTimes(20);
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(
    token,
    expect.objectContaining({ stopped: false, uncertainUsage: true }),
  );
});

test("one delayed cancellation reply consumes the confirmation window without another RPC", async () => {
  ledger.heartbeatDownloadAttempt.mockResolvedValue({ accepted: true, shouldStop: true });
  const io = runtime();
  io.start.mockResolvedValue(status({ state: "running", stopped: false, artifacts: [], evidence: null }));
  io.status.mockResolvedValue(status({ state: "running", stopped: false, artifacts: [], evidence: null }));
  io.cancel.mockImplementation(async () => {
    await io.sleep(19_000);
    return status({ state: "running", stopped: false, artifacts: [], evidence: null });
  });
  await dispatchDownloadJob(message, options, io);
  expect(io.cancel).toHaveBeenCalledTimes(1);
  expect(io.sleep.mock.calls.filter(([ms]) => ms === 19_000)).toHaveLength(1);
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(
    token,
    expect.objectContaining({ stopped: false, uncertainUsage: true }),
  );
});

test("a database heartbeat failure does not prevent the native cancellation request", async () => {
  ledger.heartbeatDownloadAttempt.mockRejectedValue(new Error("database unavailable"));
  const io = runtime();
  io.start.mockResolvedValue(status({ state: "running", stopped: false, artifacts: [], evidence: null }));
  io.status.mockResolvedValue(status({ state: "running", stopped: false, artifacts: [], evidence: null }));
  await dispatchDownloadJob(message, options, io);
  expect(io.cancel).toHaveBeenCalledTimes(1);
  expect(ledger.finishDownloadAttempt).toHaveBeenCalledWith(token, expect.objectContaining({ stopped: true }));
});
