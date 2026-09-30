import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { inspectInstagram } from "../lib/downloaders/instagramInspection.ts";

const id = "publicVideo1";
const source = { platformId: "instagram", id, url: `https://www.instagram.com/reel/${id}/`, contentForm: "reel" };
const sourceLimit = 1024 ** 3;
let media;
let calls;
let responder;

function mediaId(shortcode) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  return [...shortcode].reduce((value, character) => value * 64n + BigInt(alphabet.indexOf(character)), 0n).toString();
}

function representation(id, overrides = {}) {
  const attributes = {
    id,
    mimeType: "video/mp4",
    codecs: "avc1.64001F",
    width: "720",
    height: "1280",
    frameRate: "30",
    FBContentLength: "1000",
    ...overrides,
  };
  return `<Representation ${Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}="${value}"`)
    .join(" ")}>
    <BaseURL>https://media.cdninstagram.com/${id ?? "missing"}.mp4?secret=DO_NOT_LEAK</BaseURL>
    <SegmentBase indexRange="100-200"><Initialization range="0-99"/></SegmentBase>
  </Representation>`;
}
function mpd(streams = representation("video1"), duration = "PT4.967S") {
  return `<MPD type="static" mediaPresentationDuration="${duration}"><Period><AdaptationSet>${streams}</AdaptationSet></Period></MPD>`;
}
function audio(id = "audio1") {
  return representation(id, {
    mimeType: "audio/mp4",
    codecs: "mp4a.40.2",
    width: undefined,
    height: undefined,
    frameRate: undefined,
    FBContentLength: "200",
  });
}
function page(value = media) {
  return `<script type="application/json" data-sjs>${JSON.stringify({ require: [["Relay", [], { __bbox: { result: { data: { xig_polaris_media: { if_not_gated_logged_out: value } } } } }]] })}</script>`;
}
const inspect = (quality = "1080", budget = sourceLimit) => inspectInstagram(source, quality, budget);

beforeEach(() => {
  media = {
    __typename: "XIGPolarisVideoMedia",
    code: id,
    pk: mediaId(id),
    media_type: 2,
    product_type: "clips",
    user: { is_private: false },
    has_audio: false,
    caption: { text: "A public video" },
    video_dash_manifest: mpd(),
  };
  calls = [];
  responder = async () => new Response(page());
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init) => {
      const request = new Request(input, init);
      calls.push(request);
      return responder(request);
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("returns actual silent DASH formats and measured usage without leaking media URLs", async () => {
  const result = await inspect();
  expect(result.inspection).toEqual({
    title: "A public video",
    durationSeconds: 4.967,
    formats: [
      {
        id: "dash-video1",
        container: "mp4",
        width: 720,
        height: 1280,
        fps: 30,
        bytes: 1000,
        estimatedBytes: false,
        hasAudio: false,
        requiresMerge: false,
        videoCodec: "avc1.64001F",
      },
    ],
  });
  expect(result.sourceBytes).toBe(new TextEncoder().encode(page()).byteLength);
  expect(result.workMs).toBeGreaterThanOrEqual(0);
  expect(JSON.stringify(result)).not.toMatch(/DO_NOT_LEAK|cdninstagram|https:/);
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe(`https://www.instagram.com/p/${id}/`);
  expect(calls[0].method).toBe("GET");
  expect(calls[0].redirect).toBe("manual");
  expect(calls[0].headers.has("cookie")).toBe(false);
  expect(calls[0].headers.has("authorization")).toBe(false);
});

test("pairs each real video representation with the single audio track and preserves native rational FPS behavior", async () => {
  media.has_audio = true;
  media.video_dash_manifest = mpd(
    representation("video1", { frameRate: "15360/512" }) +
      representation("video2", { width: "360", height: "640", FBContentLength: "500" }) +
      audio(),
  );
  const { inspection } = await inspect();
  expect(inspection.formats).toEqual([
    expect.objectContaining({
      id: "dash-video1+dash-audio1",
      fps: null,
      bytes: 1200,
      estimatedBytes: true,
      hasAudio: true,
      requiresMerge: true,
    }),
    expect.objectContaining({
      id: "dash-video2+dash-audio1",
      fps: 30,
      bytes: 700,
      hasAudio: true,
      requiresMerge: true,
    }),
  ]);
});

test("inherits DASH stream attributes and keeps unknown sizes unknown", async () => {
  media.video_dash_manifest = mpd(
    representation("video1", {
      mimeType: undefined,
      codecs: undefined,
      width: undefined,
      height: undefined,
      FBContentLength: undefined,
    }),
  ).replace("<AdaptationSet>", '<AdaptationSet mimeType="video/mp4" codecs="avc1.64001F" width="720" height="1280">');
  expect((await inspect()).inspection.formats[0]).toMatchObject({
    width: 720,
    height: 1280,
    bytes: null,
    estimatedBytes: true,
  });
});

test("supports canonical TV links through the same fixed page endpoint", async () => {
  const result = await inspectInstagram(
    { ...source, contentForm: "video", url: `https://www.instagram.com/tv/${id}/` },
    "1080",
    sourceLimit,
  );
  expect(result.inspection).not.toBeNull();
  expect(calls[0].url).toBe(`https://www.instagram.com/p/${id}/`);
});

test.each([
  { platformId: "youtube" },
  { id: "../../private" },
  { contentForm: "post" },
  { url: `http://www.instagram.com/reel/${id}/` },
  { url: `https://www.instagram.com.evil.test/reel/${id}/` },
  { url: `https://user:pass@www.instagram.com/reel/${id}/` },
  { url: `https://www.instagram.com/reel/${id}/?session=DO_NOT_LEAK` },
])("rejects invalid source %j before any request", async (change) => {
  expect(await inspectInstagram({ ...source, ...change }, "1080", sourceLimit)).toEqual({
    inspection: null,
    sourceBytes: 0,
    workMs: 0,
  });
  expect(calls).toHaveLength(0);
});

test.each([
  ["2160", sourceLimit],
  ["1080", 0],
  ["1080", -1],
  ["1080", Infinity],
  ["1080", 1.5],
])("rejects invalid quality or budget %s/%s before fetching", async (quality, budget) => {
  expect((await inspect(quality, budget)).inspection).toBeNull();
  expect(calls).toHaveLength(0);
});

test.each([
  [
    "wrong identity",
    (value) => {
      value.code = "differentId";
    },
  ],
  [
    "mismatched numeric identity",
    (value) => {
      value.pk = mediaId("differentId");
    },
  ],
  [
    "missing numeric identity",
    (value) => {
      delete value.pk;
    },
  ],
  [
    "private owner",
    (value) => {
      value.user.is_private = true;
    },
  ],
  [
    "unknown visibility",
    (value) => {
      delete value.user.is_private;
    },
  ],
  [
    "unpublished owner",
    (value) => {
      value.user.is_unpublished = true;
    },
  ],
  [
    "live source",
    (value) => {
      value.is_live = true;
    },
  ],
  [
    "live streaming source",
    (value) => {
      value.is_live_streaming = true;
    },
  ],
  [
    "DRM source",
    (value) => {
      value.has_drm = true;
    },
  ],
  [
    "copyright restricted source",
    (value) => {
      value.copyright_blocked = true;
    },
  ],
  [
    "carousel",
    (value) => {
      value.carousel_media = [];
    },
  ],
  [
    "image source",
    (value) => {
      value.media_type = 1;
    },
  ],
  [
    "wrong media type",
    (value) => {
      value.__typename = "XIGPolarisImageMedia";
    },
  ],
  [
    "unknown audio state",
    (value) => {
      delete value.has_audio;
    },
  ],
  [
    "missing manifest",
    (value) => {
      delete value.video_dash_manifest;
    },
  ],
  [
    "conflicting duration",
    (value) => {
      value.video_duration = 5.5;
    },
  ],
  [
    "zero duration",
    (value) => {
      value.video_duration = 0;
    },
  ],
  [
    "invalid duration",
    (value) => {
      value.video_duration = "4.967";
    },
  ],
  [
    "overlong duration",
    (value) => {
      value.video_duration = 1801;
    },
  ],
  [
    "colliding progressive ID",
    (value) => {
      value.video_versions = [
        { id: "dash-video1", type: 101, url: "https://media.cdninstagram.com/direct.mp4?secret=DO_NOT_LEAK" },
      ];
    },
  ],
])("falls back for %s without exposing provider data", async (_name, change) => {
  change(media);
  const result = await inspect();
  expect(result.inspection).toBeNull();
  expect(result.sourceBytes).toBeGreaterThan(0);
  expect(JSON.stringify(console.info.mock.calls)).not.toMatch(/DO_NOT_LEAK|cdninstagram|publicVideo1/);
});

test.each([
  ["dynamic manifest", (value) => value.replace('type="static"', 'type="dynamic"')],
  [
    "DRM protection",
    (value) => value.replace("<AdaptationSet>", '<AdaptationSet><ContentProtection schemeIdUri="urn:drm"/>'),
  ],
  ["external entity", (value) => '<!DOCTYPE MPD [<!ENTITY secret SYSTEM "https://evil.test">]>' + value],
  [
    "segmented template",
    (value) => value.replace("<AdaptationSet>", '<AdaptationSet><SegmentTemplate media="segment-$Number$.m4s"/>'),
  ],
  ["multiple periods", (value) => value.replace("</MPD>", "<Period/></MPD>")],
  ["conflicting period duration", (value) => value.replace("<Period>", '<Period duration="PT5S">')],
  ["duplicate IDs", () => mpd(representation("video1") + representation("video1"))],
  [
    "inherited representation identity",
    () => mpd(representation(undefined)).replace("<AdaptationSet>", '<AdaptationSet id="set1">'),
  ],
  [
    "duplicate media URLs",
    (value) => value.replace("</BaseURL>", "</BaseURL><BaseURL>https://media.cdninstagram.com/another.mp4</BaseURL>"),
  ],
  [
    "duplicate stream URLs",
    () => mpd(representation("video1") + representation("video2").replace("/video2.mp4", "/video1.mp4")),
  ],
  ["missing initialization", (value) => value.replace('<Initialization range="0-99"/>', "")],
  ["invalid codec", (value) => value.replace('codecs="avc1.64001F"', 'codecs="unknown"')],
  ["invalid dimensions", (value) => value.replace('width="720"', 'width="0"')],
  ["invalid size", (value) => value.replace('FBContentLength="1000"', 'FBContentLength="1000junk"')],
  ["untrusted media host", (value) => value.replace("media.cdninstagram.com", "media.cdninstagram.com.evil.test")],
  ["insecure media URL", (value) => value.replace("https://media", "http://media")],
  ["credential-bearing media URL", (value) => value.replace("https://media", "https://user:pass@media")],
  ["nondefault media port", (value) => value.replace("cdninstagram.com/", "cdninstagram.com:444/")],
  ["missing duration", (value) => value.replace('mediaPresentationDuration="PT4.967S"', "")],
  ["too long", () => mpd(undefined, "PT30M1S")],
  ["malformed manifest", () => "not an MPD"],
  ["truncated manifest", (value) => value.replace("</AdaptationSet></Period></MPD>", "")],
  ["oversized manifest", () => " ".repeat(256001)],
])("does not offer %s", async (_name, change) => {
  media.video_dash_manifest = change(media.video_dash_manifest);
  expect((await inspect()).inspection).toBeNull();
});

test.each([
  [true, representation("video1")],
  [false, representation("video1") + audio()],
  [true, representation("video1") + audio() + audio("audio2")],
  [true, audio()],
])("falls back on ambiguous or missing audio/video streams", async (hasAudio, streams) => {
  media.has_audio = hasAudio;
  media.video_dash_manifest = mpd(streams);
  expect((await inspect()).inspection).toBeNull();
});

test("rejects absent or ambiguous matching public payloads", async () => {
  responder = async () => new Response("<html>Sign in</html>");
  expect((await inspect()).inspection).toBeNull();
  responder = async () => new Response(page() + page());
  expect((await inspect()).inspection).toBeNull();
  responder = async () => new Response('<script type="application/json">{"xig_polaris_media": broken}</script>');
  expect((await inspect()).inspection).toBeNull();
});

test("filters quality by the shorter display edge and enforces file and source budgets", async () => {
  media.video_dash_manifest = mpd(
    representation("small", { width: "720", height: "1280", FBContentLength: "100000" }) +
      representation("large", { width: "1080", height: "1920", FBContentLength: "200000" }),
  );
  expect((await inspect("720")).inspection.formats.map((format) => format.id)).toEqual(["dash-small"]);
  expect((await inspect("1080", 150000)).inspection.formats.map((format) => format.id)).toEqual(["dash-small"]);
  media.video_dash_manifest = mpd(representation("tooLarge", { FBContentLength: String(250 * 1024 * 1024 + 1) }));
  expect((await inspect()).inspection).toBeNull();
});

test("accepts minor duration rounding and the thirty-minute boundary", async () => {
  media.video_duration = 5.016;
  expect((await inspect()).inspection.durationSeconds).toBe(4.967);
  media.video_duration = 1800;
  media.video_dash_manifest = mpd(undefined, "PT30M");
  expect((await inspect()).inspection.durationSeconds).toBe(1800);
});

test("caps title length, strips control characters and uses a clear title fallback", async () => {
  media.caption.text = "text\u0000".repeat(100);
  expect((await inspect()).inspection.title).toHaveLength(300);
  expect((await inspect()).inspection.title).not.toContain("\u0000");
  delete media.caption;
  expect((await inspect()).inspection.title).toBe("Instagram video");
});

test.each([302, 403, 429, 500])(
  "fails closed on HTTP %s without following redirects or exposing upstream errors",
  async (status) => {
    responder = async () =>
      new Response("SECRET_UPSTREAM_MESSAGE", { status, headers: { Location: "https://evil.test/private" } });
    expect((await inspect()).inspection).toBeNull();
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(console.info.mock.calls)).not.toMatch(/SECRET_UPSTREAM_MESSAGE|evil.test/);
  },
);

test("cancels oversized streams, records observed bytes and honors smaller caller budgets", async () => {
  let cancelled = false;
  const payload = new Uint8Array(2 * 1024 * 1024 + 1);
  responder = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(payload);
        },
        cancel() {
          cancelled = true;
        },
      }),
    );
  const oversized = await inspect();
  expect(oversized.inspection).toBeNull();
  expect(oversized.sourceBytes).toBe(payload.byteLength);
  expect(cancelled).toBe(true);
  expect(await inspect("1080", 32)).toMatchObject({ inspection: null, sourceBytes: 32 });
});

test("deadline covers a stalled response body and cancels the stream", async () => {
  vi.useFakeTimers();
  let cancelled = false;
  responder = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("partial"));
        },
        cancel() {
          cancelled = true;
        },
      }),
    );
  const pending = inspect();
  await vi.advanceTimersByTimeAsync(1800);
  expect(await pending).toMatchObject({ inspection: null, sourceBytes: 7, workMs: 1800 });
  expect(cancelled).toBe(true);
  expect(calls[0].signal.aborted).toBe(true);
});

test("aborts a stalled request and logs only fixed diagnostic fields", async () => {
  vi.useFakeTimers();
  responder = (request) =>
    new Promise((_resolve, reject) => {
      request.signal.addEventListener("abort", () => reject(new Error("SECRET_UPSTREAM_MESSAGE")), { once: true });
    });
  const pending = inspect();
  await vi.advanceTimersByTimeAsync(1800);
  expect(await pending).toMatchObject({ inspection: null, sourceBytes: 0, workMs: 1800 });
  expect(JSON.stringify(console.info.mock.calls)).not.toContain("SECRET_UPSTREAM_MESSAGE");
});
