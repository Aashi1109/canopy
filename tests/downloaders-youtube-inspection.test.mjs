import { afterEach, beforeEach, expect, test, vi } from "vitest";

const id = "F_OtN7l0BKc";
const source = { platformId: "youtube", id, url: `https://www.youtube.com/watch?v=${id}`, contentForm: "video" };
let inspectYouTube;
let inspectMetered;
let calls;
let watch;
let player;
let responder;

function format(itag, video = true, overrides = {}) {
  return {
    itag,
    mimeType: video ? 'video/mp4; codecs="avc1.640028"' : 'audio/mp4; codecs="mp4a.40.2"',
    url: `https://rr1.googlevideo.com/videoplayback?secret=DO_NOT_LEAK&itag=${itag}`,
    contentLength: "1000",
    bitrate: video ? 1000000 : 128000,
    ...(video
      ? { width: 1920, height: 1080, fps: 30, qualityLabel: "1080p" }
      : { audioQuality: "AUDIO_QUALITY_MEDIUM", audioChannels: 2, audioSampleRate: "44100" }),
    ...overrides,
  };
}
function sessionResponse() {
  const device = Array(108).fill(null);
  Object.assign(device, {
    0: "en",
    1: "US",
    13: "VISITOR_DO_NOT_LEAK",
    16: "2.20260928",
    17: "Windows",
    18: "10",
    61: ["install"],
    79: "UTC",
  });
  return new Response(")]}'\n" + JSON.stringify([[null, null, [[device], "API_DO_NOT_LEAK"]]]));
}
function fixture() {
  return {
    playabilityStatus: { status: "OK", playableInEmbed: true },
    videoDetails: {
      videoId: id,
      title: 'Test }; " video',
      lengthSeconds: "60",
      isPrivate: false,
      isCrawlable: true,
      isLiveContent: false,
    },
    microformat: {
      playerMicroformatRenderer: { isUnlisted: false, isFamilySafe: true, hasYpcMetadata: false, lengthSeconds: "60" },
    },
    streamingData: { adaptiveFormats: [format(137), format(140, false)] },
  };
}
beforeEach(async () => {
  vi.resetModules();
  vi.spyOn(console, "info").mockImplementation(() => {});
  calls = [];
  watch = fixture();
  player = fixture();
  delete player.microformat;
  responder = async (request) => {
    const url = new URL(request.url);
    if (url.pathname === "/sw.js_data") return sessionResponse();
    if (url.pathname === "/watch")
      return new Response(`<script>var ytInitialPlayerResponse = ${JSON.stringify(watch)};</script>`);
    if (url.pathname === "/youtubei/v1/player") return Response.json(player);
    throw new Error("Unexpected outbound request");
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init) => {
      const request = new Request(input, init);
      calls.push(request);
      return responder(request);
    }),
  );
  ({ inspectYouTube: inspectMetered } = await import("../lib/downloaders/youtubeInspection.ts"));
  inspectYouTube = async (...args) => (await inspectMetered(...args)).inspection;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("returns real bounded original format pairs without source URLs or session tokens", async () => {
  expect(await inspectYouTube(source, "1080", 1024 ** 3)).toEqual({
    title: 'Test }; " video',
    durationSeconds: 60,
    formats: [
      {
        id: "137+140",
        container: "mp4",
        width: 1920,
        height: 1080,
        fps: 30,
        bytes: 2000,
        estimatedBytes: true,
        hasAudio: true,
        requiresMerge: true,
        videoCodec: "avc1.640028",
      },
    ],
  });
  expect(calls).toHaveLength(3);
  expect(
    calls.every((request) => new URL(request.url).hostname === "www.youtube.com" && request.redirect === "manual"),
  ).toBe(true);
});

test("works with the Workers redirect modes and never follows a redirect target", async () => {
  const normalFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input, init) => {
    if (init?.redirect !== "follow" && init?.redirect !== "manual") throw new TypeError("Invalid redirect value");
    return normalFetch(input, init);
  });
  expect((await inspectYouTube(source, "1080", 1024 ** 3))?.formats).toHaveLength(1);
  calls.length = 0;
  responder = async () =>
    new Response(null, { status: 302, headers: { Location: "https://redirect-target.example/private" } });
  expect(await inspectYouTube(source, "1080", 1024 ** 3)).toBeNull();
  expect(calls.every((request) => new URL(request.url).hostname === "www.youtube.com")).toBe(true);
});

test.each(["isPrivate", "isCrawlable", "isLiveContent"])(
  "missing raw %s cannot become affirmative evidence",
  async (key) => {
    delete watch.videoDetails[key];
    expect(await inspectYouTube(source, "1080", 1024 ** 3)).toBeNull();
  },
);

test.each(["isUnlisted", "isFamilySafe", "hasYpcMetadata"])("missing microformat %s falls back", async (key) => {
  delete watch.microformat.playerMicroformatRenderer[key];
  expect(await inspectYouTube(source, "1080", 1024 ** 3)).toBeNull();
});

test.each([
  [
    "private",
    (data) => {
      data.videoDetails.isPrivate = true;
    },
  ],
  [
    "uncrawlable",
    (data) => {
      data.videoDetails.isCrawlable = false;
    },
  ],
  [
    "live",
    (data) => {
      data.videoDetails.isLiveContent = true;
    },
  ],
  [
    "upcoming",
    (data) => {
      data.videoDetails.isUpcoming = true;
    },
  ],
  [
    "post live",
    (data) => {
      data.videoDetails.isPostLiveDvr = true;
    },
  ],
  [
    "unlisted",
    (data) => {
      data.microformat.playerMicroformatRenderer.isUnlisted = true;
    },
  ],
  [
    "age restricted",
    (data) => {
      data.microformat.playerMicroformatRenderer.isFamilySafe = false;
    },
  ],
  [
    "paid",
    (data) => {
      data.microformat.playerMicroformatRenderer.hasYpcMetadata = true;
    },
  ],
  [
    "unplayable",
    (data) => {
      data.playabilityStatus.status = "UNPLAYABLE";
    },
  ],
  [
    "wrong source",
    (data) => {
      data.videoDetails.videoId = "jNQXAC9IVRw";
    },
  ],
  [
    "too long",
    (data) => {
      data.videoDetails.lengthSeconds = "1801";
    },
  ],
  [
    "ambiguous duration",
    (data) => {
      data.videoDetails.lengthSeconds = "60junk";
    },
  ],
  [
    "mismatched microformat",
    (data) => {
      data.microformat.playerMicroformatRenderer.lengthSeconds = "61";
    },
  ],
])("falls back for %s source evidence", async (_name, change) => {
  change(watch);
  expect(await inspectYouTube(source, "1080", 1024 ** 3)).toBeNull();
});

test.each([
  [
    "wrong source",
    (data) => {
      data.videoDetails.videoId = "jNQXAC9IVRw";
    },
  ],
  [
    "duration mismatch",
    (data) => {
      data.videoDetails.lengthSeconds = "61";
    },
  ],
  [
    "private",
    (data) => {
      data.videoDetails.isPrivate = true;
    },
  ],
  [
    "missing live evidence",
    (data) => {
      delete data.videoDetails.isLiveContent;
    },
  ],
  [
    "requires login",
    (data) => {
      data.playabilityStatus.status = "LOGIN_REQUIRED";
    },
  ],
])("independently validates VISIONOS %s evidence", async (_name, change) => {
  change(player);
  expect(await inspectYouTube(source, "1080", 1024 ** 3)).toBeNull();
});

test("filters by shorter edge and returns MP4/WebM with compatible original audio", async () => {
  player.streamingData.adaptiveFormats.push(
    format(136, true, { width: 1280, height: 720 }),
    format(248, true, { mimeType: 'video/webm; codecs="vp9"', width: 720, height: 1280 }),
    format(251, false, { mimeType: 'audio/webm; codecs="opus"' }),
    format(140, false, { isDrc: true }),
  );
  const result = await inspectYouTube(source, "720", 1024 ** 3);
  expect(result.formats.map((format) => [format.id, format.container])).toEqual([
    ["136+140", "mp4"],
    ["248+251", "webm"],
  ]);
});

test.each([
  ["duplicate original audio", (formats) => formats.push(format(140, false))],
  ["higher quality audio", (formats) => formats.push(format(141, false))],
  [
    "ambiguous audio track",
    (formats) => {
      formats[1].audioTrack = { id: "en.1", audioIsDefault: true };
    },
  ],
  [
    "surround audio",
    (formats) => {
      formats[1].audioChannels = 6;
    },
  ],
  ["duplicate video", (formats) => formats.push(format(137))],
  ["missing audio", (formats) => formats.splice(1, 1)],
  [
    "only DRC audio",
    (formats) => {
      formats[1].isDrc = true;
    },
  ],
])("falls back rather than offering %s", async (_name, change) => {
  change(player.streamingData.adaptiveFormats);
  expect(await inspectYouTube(source, "1080", 1024 ** 3)).toBeNull();
});

test.each([
  { signatureCipher: "s=DO_NOT_LEAK" },
  { cipher: "s=DO_NOT_LEAK" },
  { type: "FORMAT_STREAM_TYPE_OTF" },
  { drmFamilies: ["WIDEVINE"] },
  { drmTrackType: "DRM_TRACK_TYPE_SDR" },
  { fairPlayKeyUri: "https://key.invalid/DO_NOT_LEAK" },
  { url: "https://rr1.googlevideo.com.evil.test/videoplayback" },
  { url: "http://rr1.googlevideo.com/videoplayback" },
  { url: "https://user:pass@rr1.googlevideo.com/videoplayback" },
  { url: "https://rr1.googlevideo.com:444/videoplayback" },
  { url: "https://rr1.googlevideo.com/videoplayback#secret" },
  { contentLength: "900000000" },
  { contentLength: "bad" },
  { width: 0 },
])("does not publish unusable direct video %j", async (override) => {
  Object.assign(player.streamingData.adaptiveFormats[0], override);
  expect(await inspectYouTube(source, "1080", 1024 ** 3)).toBeNull();
});

test("matches native FPS normalization and caps source/title data", async () => {
  player.streamingData.adaptiveFormats[0].fps = 1;
  watch.videoDetails.title = "x\u0000".repeat(200);
  const result = await inspectYouTube(source, "1080", 1024 ** 3);
  expect(result.formats[0].fps).toBeNull();
  expect(result.title).toHaveLength(300);
  expect(result.title).not.toContain("\u0000");
  expect(JSON.stringify(result)).not.toMatch(/DO_NOT_LEAK|googlevideo|https:/);
});

test.each([
  { platformId: "vimeo" },
  { id: "not-a-video" },
  { contentForm: "post" },
  { url: "https://localhost/watch?v=F_OtN7l0BKc" },
  { url: "https://www.youtube.com.evil.test/watch?v=F_OtN7l0BKc" },
])("rejects invalid source before any network call %j", async (override) => {
  expect(await inspectYouTube({ ...source, ...override }, "1080", 1024 ** 3)).toBeNull();
  expect(calls).toHaveLength(0);
});

test("uses completed plain session data with a fresh request context and expires after ten minutes", async () => {
  expect(await inspectYouTube(source, "1080", 1024 ** 3)).not.toBeNull();
  const second = "jNQXAC9IVRw";
  watch.videoDetails.videoId = second;
  player.videoDetails.videoId = second;
  expect(
    await inspectYouTube(
      { ...source, id: second, url: `https://www.youtube.com/watch?v=${second}` },
      "1080",
      1024 ** 3,
    ),
  ).not.toBeNull();
  expect(calls.filter((request) => new URL(request.url).pathname === "/sw.js_data")).toHaveLength(1);
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now + 600001);
  expect(
    await inspectYouTube(
      { ...source, id: second, url: `https://www.youtube.com/watch?v=${second}` },
      "1080",
      1024 ** 3,
    ),
  ).not.toBeNull();
  expect(calls.filter((request) => new URL(request.url).pathname === "/sw.js_data")).toHaveLength(2);
  vi.restoreAllMocks();
});

test("does not reuse another invocation's in-flight session request", async () => {
  let release;
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  const normal = responder;
  responder = async (request) => {
    if (new URL(request.url).pathname === "/sw.js_data") await wait;
    return normal(request);
  };
  const first = inspectYouTube(source, "1080", 1024 ** 3);
  const second = inspectYouTube(source, "1080", 1024 ** 3);
  await vi.waitFor(() =>
    expect(calls.filter((request) => new URL(request.url).pathname === "/sw.js_data")).toHaveLength(2),
  );
  release();
  expect(await Promise.all([first, second])).not.toContain(null);
});

test.each([302, 403, 429, 500])(
  "fails closed on upstream HTTP %s without forwarding upstream error text",
  async (status) => {
    responder = async () => new Response("DO_NOT_LEAK", { status, headers: { Location: "https://evil.test" } });
    expect(await inspectYouTube(source, "1080", 1024 ** 3)).toBeNull();
  },
);

test("caps decoded response bytes even without Content-Length", async () => {
  const normal = responder;
  responder = async (request) =>
    new URL(request.url).pathname === "/watch" ? new Response(" ".repeat(4 * 1024 * 1024 + 1)) : normal(request);
  expect(await inspectYouTube(source, "1080", 1024 ** 3)).toBeNull();
});

test("caps aggregate decoded bytes and honors the caller's lower source budget", async () => {
  expect(await inspectYouTube(source, "1080", 10)).toBeNull();
  const normal = responder;
  responder = async (request) => {
    const response = await normal(request);
    const path = new URL(request.url).pathname;
    const padding = path === "/sw.js_data" ? 2 * 1024 * 1024 : 3.5 * 1024 * 1024;
    return new Response((await response.text()) + " ".repeat(padding));
  };
  expect(await inspectYouTube(source, "1080", 1024 ** 3)).toBeNull();
});

test("total deadline includes body reads and cancels a stalled response", async () => {
  vi.useFakeTimers();
  let cancelled = false;
  const normal = responder;
  responder = async (request) =>
    new URL(request.url).pathname === "/watch"
      ? new Response(
          new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }),
        )
      : normal(request);
  const result = inspectYouTube(source, "1080", 1024 ** 3);
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(2500);
  expect(await result).toBeNull();
  expect(cancelled).toBe(true);
  expect(calls.every((request) => request.signal.aborted)).toBe(true);
});

test("malformed embedded JSON falls back without evaluating page scripts", async () => {
  const normal = responder;
  responder = async (request) =>
    new URL(request.url).pathname === "/watch"
      ? new Response("<script>ytInitialPlayerResponse = {bad}; globalThis.DO_NOT_RUN = true;</script>")
      : normal(request);
  expect(await inspectYouTube(source, "1080", 1024 ** 3)).toBeNull();
  expect(globalThis.DO_NOT_RUN).toBeUndefined();
});

test("starts watch evidence before cold session initialization finishes", async () => {
  let release;
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  const normal = responder;
  responder = async (request) => {
    if (new URL(request.url).pathname === "/sw.js_data") await wait;
    return normal(request);
  };
  const pending = inspectMetered(source, "1080", 1024 ** 3);
  await vi.waitFor(() => expect(calls.map((request) => new URL(request.url).pathname)).toContain("/watch"));
  expect(calls.map((request) => new URL(request.url).pathname)).toContain("/sw.js_data");
  expect(calls.map((request) => new URL(request.url).pathname)).not.toContain("/youtubei/v1/player");
  release();
  const result = await pending;
  expect(result.inspection).not.toBeNull();
  expect(result.sourceBytes).toBeGreaterThan(0);
  expect(result.workMs).toBeGreaterThanOrEqual(0);
  expect(calls.every((request) => !request.headers.has("Cookie") && !request.headers.has("Authorization"))).toBe(true);
});

test("reports measured bytes for unsuccessful inspection and charges the capped budget on overflow", async () => {
  watch.microformat.playerMicroformatRenderer.isUnlisted = true;
  const rejected = await inspectMetered(source, "1080", 1024 ** 3);
  expect(rejected.inspection).toBeNull();
  expect(rejected.sourceBytes).toBeGreaterThan(0);
  const overflow = await inspectMetered(source, "1080", 32);
  expect(overflow).toMatchObject({ inspection: null, sourceBytes: 32 });
});

test("returns frozen usage after timeout and stops reading pending bodies", async () => {
  vi.useFakeTimers();
  let cancelled = false;
  const normal = responder;
  responder = async (request) =>
    new URL(request.url).pathname === "/watch"
      ? new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("partial response"));
            },
            cancel() {
              cancelled = true;
            },
          }),
        )
      : normal(request);
  const pending = inspectMetered(source, "1080", 1024 ** 3);
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(2500);
  const result = await pending;
  expect(result).toMatchObject({ inspection: null, workMs: 2500 });
  expect(result.sourceBytes).toBeGreaterThan(0);
  const snapshot = structuredClone(result);
  await vi.advanceTimersByTimeAsync(10000);
  expect(result).toEqual(snapshot);
  expect(cancelled).toBe(true);
});

test("matches integer native FPS and refuses ambiguous audio quality and URL xtags", async () => {
  player.streamingData.adaptiveFormats[0].fps = 29.97;
  expect((await inspectYouTube(source, "1080", 1024 ** 3)).formats[0].fps).toBe(29);
  player.streamingData.adaptiveFormats[1].audioQuality = "AUDIO_QUALITY_LOW";
  expect(await inspectYouTube(source, "1080", 1024 ** 3)).toBeNull();
  player.streamingData.adaptiveFormats[1].audioQuality = "AUDIO_QUALITY_MEDIUM";
  player.streamingData.adaptiveFormats[0].url += "&xtags=sr%3D1";
  expect(await inspectYouTube(source, "1080", 1024 ** 3)).toBeNull();
});

test("charges the actual final chunk crossing the aggregate read threshold", async () => {
  const normal = responder;
  let servedBytes = 0;
  responder = async (request) => {
    const response = await normal(request);
    const padding = new URL(request.url).pathname === "/sw.js_data" ? 2 * 1024 * 1024 : 3.5 * 1024 * 1024;
    const body = (await response.text()) + " ".repeat(padding);
    servedBytes += new TextEncoder().encode(body).byteLength;
    return new Response(body);
  };
  const result = await inspectMetered(source, "1080", 1024 ** 3);
  expect(result.inspection).toBeNull();
  expect(result.sourceBytes).toBeGreaterThan(8 * 1024 * 1024);
  expect(result.sourceBytes).toBe(servedBytes);
});

test.each([{ width: "1920px" }, { height: "1080px" }, { contentLength: "1000bytes" }, { fps: "30" }])(
  "does not publish numbers coerced from malformed upstream fields %j",
  async (change) => {
    Object.assign(player.streamingData.adaptiveFormats[0], change);
    expect(await inspectYouTube(source, "1080", 1024 ** 3)).toBeNull();
  },
);

test("upstream exceptions do not print tokens or URLs", async () => {
  const logs = ["log", "warn", "error", "debug"].map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  );
  responder = async () => {
    throw new Error("https://secret.invalid?token=DO_NOT_LEAK");
  };
  const result = await inspectMetered(source, "1080", 1024 ** 3);
  expect(result.inspection).toBeNull();
  expect(logs.every((log) => log.mock.calls.length === 0)).toBe(true);
  for (const log of logs) log.mockRestore();
});

test("reports actual elapsed work beyond timer jitter and keeps stage logs sanitized", async () => {
  vi.useFakeTimers();
  const started = Date.now();
  const normal = responder;
  responder = async (request) =>
    new URL(request.url).pathname === "/watch" ? new Response(new ReadableStream()) : normal(request);
  const pending = inspectMetered(source, "1080", 1024 ** 3);
  await vi.advanceTimersByTimeAsync(0);
  vi.setSystemTime(started + 1);
  await vi.advanceTimersByTimeAsync(2500);
  const result = await pending;
  expect(result.workMs).toBe(2501);
  expect(result.inspection).toBeNull();
  const logs = console.info.mock.calls;
  expect(logs.some(([, event]) => event.stage === "total" && event.failureStage === "timeout")).toBe(true);
  expect(JSON.stringify(logs)).not.toMatch(/DO_NOT_LEAK|https:|googlevideo|F_OtN7l0BKc/);
});
