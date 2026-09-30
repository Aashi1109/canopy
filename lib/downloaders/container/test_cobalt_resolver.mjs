import assert from "node:assert/strict";
import test from "node:test";
import { engineError, normalizeSource, resolverOptions, selectDailymotionVariant } from "./cobalt_resolver.mjs";

const limits = { durationSeconds: 1800, fileBytes: 250 * 1024 ** 2, outputBytes: 500 * 1024 ** 2 };
const request = {
  platformId: "youtube",
  sourceId: "abcdefghijk",
  quality: "1080",
  sourceComposition: "single-video",
  inspect: true,
};
const youtube = () => ({
  type: "merge",
  urls: ["https://media.example/video?id=1", "https://media.example/audio?id=1"],
  isHLS: false,
  filenameAttributes: { extension: "mp4" },
  canopy: {
    sourceId: "abcdefghijk",
    title: "Example",
    durationSeconds: 30,
    isLive: false,
    isPrivate: false,
    video: {
      itag: 137,
      width: 1920,
      height: 1080,
      fps: 30,
      mime: 'video/mp4; codecs="avc1.640028"',
      bytes: "1000",
      hasVideo: true,
      hasAudio: false,
    },
    audio: { itag: 140, mime: 'audio/mp4; codecs="mp4a.40.2"', bytes: "200", hasAudio: true },
  },
});
const tiktokRequest = { ...request, platformId: "tiktok", sourceId: "7421234567890123456" };
const tiktok = () => ({
  urls: "https://media.example/video.mp4?token=secret&quality=1080",
  canopy: {
    kind: "tiktok",
    media: {
      id: tiktokRequest.sourceId,
      desc: "Public video",
      author: { uniqueId: "public" },
      video: { duration: 15, width: 1080, height: 1920 },
    },
  },
});

test("YouTube exposes the chosen original itag pair and actual source facts", () => {
  const result = normalizeSource(youtube(), request, limits);
  assert.deepEqual(result.evidence, {
    sourceId: request.sourceId,
    originalComposition: "complete",
    items: [{ id: request.sourceId, type: "video" }],
    isLive: false,
    requiresAuthentication: false,
  });
  const { urls, headers, isHLS, ...format } = result.formats[0];
  assert.deepEqual(format, {
    id: "137+140",
    container: "mp4",
    width: 1920,
    height: 1080,
    fps: 30,
    bytes: 1200,
    estimatedBytes: true,
    hasAudio: true,
    requiresMerge: true,
    videoCodec: "avc1.640028",
  });
  assert.equal(result.durationSeconds, 30);
  assert.equal(urls.length, 2);
  assert.equal(isHLS, false);
  assert.deepEqual(headers, {});
});

test("YouTube passes the exact selected video and audio IDs to Cobalt", () => {
  const selected = {
    ...request,
    selectedFormat: "248+251",
    expectedFormat: { id: "248+251", width: 1920, height: 1080, videoCodec: "vp9", container: "webm" },
  };
  assert.deepEqual(resolverOptions(selected).itag, { video: 248, audio: 251 });
  assert.equal(resolverOptions(selected).codec, "vp9");
  assert.equal(resolverOptions(selected).container, "webm");
  assert.throws(() => normalizeSource(youtube(), selected, limits), /format_unavailable/);
});

test("YouTube rejects unsupported progressive IDs rather than choosing another stream", () => {
  assert.throws(
    () => resolverOptions({ ...request, selectedFormat: "18", expectedFormat: { id: "18" } }),
    /format_unavailable/,
  );
});

for (const mutate of [
  (r) => {
    r.canopy.sourceId = "other-id";
  },
  (r) => {
    r.canopy.isLive = true;
  },
  (r) => {
    delete r.canopy.isLive;
  },
  (r) => {
    r.canopy.isPrivate = true;
  },
  (r) => {
    r.canopy.isUnlisted = true;
  },
  (r) => {
    r.canopy.durationSeconds = 0;
  },
  (r) => {
    r.canopy.audio.hasAudio = false;
  },
  (r) => {
    r.urls = ["https://user:secret@media.example/v.mp4", "https://media.example/a.mp4"];
  },
  (r) => {
    r.urls = ["http://media.example/v.mp4", "https://media.example/a.mp4"];
  },
  (r) => {
    r.picker = [{ type: "photo" }];
  },
])
  test(`Incomplete or restricted evidence is rejected (${mutate.toString()})`, () => {
    const result = youtube();
    mutate(result);
    assert.throws(() => normalizeSource(result, request, limits));
  });

test("Duration, quality, and bytes remain bounded on the independent engine", () => {
  const tooLong = youtube();
  tooLong.canopy.durationSeconds = 1801;
  assert.throws(() => normalizeSource(tooLong, request, limits), /source_duration_limit/);
  assert.throws(() => normalizeSource(youtube(), { ...request, quality: "720" }, limits), /format_unavailable/);
  assert.throws(() => normalizeSource(youtube(), request, { ...limits, fileBytes: 100 }), /resource_limit/);
});

test("Metadata-poor progressive results preserve unknown facts for bounded probing", () => {
  const result = normalizeSource(tiktok(), tiktokRequest, limits);
  const format = result.formats[0];
  assert.match(format.id, /^cobalt\.[a-f0-9]{24}$/);
  assert.equal(format.width, 1080);
  assert.equal(format.height, 1920);
  assert.equal(format.hasAudio, undefined);
  assert.equal(format.videoCodec, undefined);
  assert.equal(format.requiresMerge, false);
});

test("Ephemeral transfer tokens do not change a Cobalt format ID; rendition changes do", () => {
  const first = tiktok(),
    second = tiktok(),
    other = tiktok();
  second.urls = second.urls.replace("token=secret", "token=refreshed");
  other.urls = other.urls.replace("quality=1080", "quality=720");
  const id = (r) => normalizeSource(r, tiktokRequest, limits).formats[0].id;
  assert.equal(id(first), id(second));
  assert.notEqual(id(first), id(other));
  assert.throws(
    () => normalizeSource(other, { ...tiktokRequest, selectedFormat: id(first) }, limits),
    /format_unavailable/,
  );
});

test("Cross-engine selection requests the displayed resolution while Cobalt IDs retain affinity", () => {
  const format = { id: "download", width: 720, height: 1280, videoCodec: "h264", container: "mp4" };
  const selected = { ...tiktokRequest, selectedFormat: format.id, expectedFormat: format };
  assert.equal(resolverOptions(selected).quality, "720");
  assert.match(normalizeSource(tiktok(), selected, limits).formats[0].id, /^cobalt\./);
  assert.throws(
    () => resolverOptions({ ...selected, expectedFormat: { ...format, id: "different" } }),
    /format_unavailable/,
  );
});

test("TikTok image posts and restricted posts never become a single-video receipt", () => {
  for (const extra of [
    { imagePost: { images: [] } },
    { privateItem: true },
    { isContentClassified: true },
    { isLive: true },
    { id: "different" },
  ]) {
    const result = tiktok();
    Object.assign(result.canopy.media, extra);
    assert.throws(() => normalizeSource(result, tiktokRequest, limits));
  }
});

test("Anonymous cookies remain private and header injection is rejected", () => {
  const result = tiktok();
  result.headers = { cookie: { toString: () => "anonymous=opaque" } };
  assert.equal(normalizeSource(result, tiktokRequest, limits).formats[0].headers.cookie, "anonymous=opaque");
  result.headers = { Authorization: "Bearer secret" };
  assert.throws(() => normalizeSource(result, tiktokRequest, limits));
  result.headers = { cookie: "anonymous=opaque\r\nHost: internal" };
  assert.throws(() => normalizeSource(result, tiktokRequest, limits));
});

test("Instagram binds shortcode to the returned media identity and verifies public single-video composition", () => {
  const sourceId = "ABC",
    media = {
      media_type: 2,
      code: sourceId,
      pk: "66",
      user: { is_private: false },
      video_duration: 10,
      has_audio: true,
    };
  const result = { urls: "https://media.example/ig.mp4", canopy: { kind: "instagram-mobile", media } };
  const req = { ...request, platformId: "instagram", sourceId };
  assert.equal(normalizeSource(result, req, limits).formats[0].hasAudio, true);
  for (const changed of [{ pk: "67" }, { user: { is_private: true } }, { carousel_media: [] }]) {
    assert.throws(() =>
      normalizeSource({ ...result, canopy: { ...result.canopy, media: { ...media, ...changed } } }, req, limits),
    );
  }
});

test("Vimeo must explicitly expose public privacy and its own returned video ID", () => {
  const req = { ...request, platformId: "vimeo", sourceId: "123" };
  const result = {
    urls: "https://media.example/video.mp4",
    canopy: { kind: "vimeo", media: { uri: "/videos/123", privacy: { view: "anybody" }, duration: 10, name: "Vimeo" } },
  };
  assert.equal(normalizeSource(result, req, limits).evidence.sourceId, "123");
  result.canopy.media.privacy.view = "unlisted";
  assert.throws(() => normalizeSource(result, req, limits));
});

test("Upstream failures retain the original message and stable error classification", () => {
  for (const [upstream, expected] of [
    ["content.too_long", "source_duration_limit"],
    ["content.post.private", "source_unavailable"],
    ["fetch.empty", "engine_failed"],
    ["Request failed: https://youtube.com/watch?v=abcdefghijk&token=original", "engine_failed"],
  ])
    assert.throws(
      () => normalizeSource({ error: upstream }, request, limits),
      (error) => {
        assert.equal(error.code, expected);
        assert.equal(error.message, upstream);
        assert.deepEqual(engineError(error), { code: expected, message: upstream });
        return true;
      },
    );
});

test("Unexpected exceptions preserve their message without serializing the stack", () => {
  const error = new Error("Request failed for https://media.example/video?token=original");
  error.stack = `${error.name}: ${error.message}\n    at resolver (/opt/cobalt/service.js:1:2)`;
  assert.deepEqual(engineError(error), { code: "engine_failed", message: error.message });
  assert.equal(engineError(new Error("x".repeat(1200))).message, "x".repeat(1000));
});

test("Internal sentinel errors retain the existing friendly error fallback", () => {
  assert.throws(
    () => normalizeSource(youtube(), request, { ...limits, durationSeconds: 1 }),
    (error) => {
      assert.deepEqual(engineError(error), { code: "source_duration_limit" });
      return true;
    },
  );
  assert.deepEqual(engineError(new Error("format_unavailable")), { code: "format_unavailable" });
  assert.deepEqual(engineError(null), { code: "engine_failed" });
});

test("Provider fragments are removed without changing the actual HTTP resource", () => {
  const req = { ...request, platformId: "dailymotion", sourceId: "x123" };
  const result = {
    urls: "https://media.example/playlist.m3u8#cell=core",
    isHLS: true,
    canopy: {
      kind: "dailymotion",
      media: { __typename: "Video", xid: "x123", duration: 25, title: "Example" },
      variant: { resolution: { width: 1920, height: 1080 } },
    },
  };
  const source = normalizeSource(result, req, limits);
  assert.equal(source.formats[0].urls[0], "https://media.example/playlist.m3u8");
  assert.equal(source.formats[0].isHLS, true);
});

test("Dailymotion chooses the best original at or below the requested quality and never upgrades", () => {
  const full = { codecs: "avc1.640028,mp4a.40.2", resolution: { width: 1920, height: 1080 }, bandwidth: 5000000 };
  const hd = { ...full, resolution: { width: 1280, height: 720 }, bandwidth: 2000000 };
  const sd = { ...full, resolution: { width: 640, height: 360 }, bandwidth: 900000 };
  assert.equal(selectDailymotionVariant([sd, full, hd], "720"), hd);
  assert.equal(selectDailymotionVariant([sd, full, hd], "1080"), full);
  assert.equal(selectDailymotionVariant([full], "720"), undefined);
  assert.equal(selectDailymotionVariant([{ ...hd, codecs: "hev1.1.6" }], "720"), undefined);
  assert.equal(
    selectDailymotionVariant([{ ...hd, resolution: { width: 720, height: 1280 } }], "720").resolution.width,
    720,
  );
});
