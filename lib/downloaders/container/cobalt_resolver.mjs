/** Private adapter for the pinned Cobalt resolvers. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const SUPPORTED = new Set(["youtube", "instagram", "tiktok", "dailymotion", "vimeo", "twitch"]);
const MAX_RECEIPT = 65_536;
const positive = (value, max = Number.MAX_SAFE_INTEGER) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 && value <= max;
const integer = (value, max) => Number.isSafeInteger(value) && positive(value, max);
const fail = (code = "unsupported_source", message = code) => {
  throw Object.assign(new Error(message), { code });
};

export function engineError(error) {
  const codes = new Set([
    "unsupported_source",
    "format_unavailable",
    "source_duration_limit",
    "source_unavailable",
    "resource_limit",
    "engine_failed",
  ]);
  const code = codes.has(error?.code) ? error.code : codes.has(error?.message) ? error.message : "engine_failed";
  const message = typeof error?.message === "string" ? error.message.slice(0, 1000) : "";
  return message && message !== code ? { code, message } : { code };
}
const cleanTitle = (value) =>
  typeof value === "string"
    ? value
        .replace(/[\x00-\x1f\x7f]/g, " ")
        .trim()
        .slice(0, 300)
    : "";

function safeUrl(value) {
  if (typeof value !== "string" || value.length > 8192 || /[\x00-\x20\x7f]/.test(value)) fail();
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port) fail();
  // Fragments are client-side markers and are never sent in an HTTP request.
  url.hash = "";
  return url;
}

function headersFor(result) {
  const headers = {};
  for (const [key, raw] of Object.entries(result.headers ?? {})) {
    const name = key.toLowerCase();
    if (!["cookie", "referer", "user-agent", "origin"].includes(name)) fail();
    const value = typeof raw === "string" ? raw : name === "cookie" ? String(raw) : null;
    if (!value || value.length > 8192 || /[\x00-\x1f\x7f]/.test(value)) fail();
    headers[name] = value;
  }
  return headers;
}

function stableFormatId(platform, sourceId, urls) {
  // These fields authorize a transfer; they do not identify its representation.
  // Other query fields remain bound, so a different codec/rendition cannot reuse an ID.
  const addresses = urls.map((value) => {
    const url = safeUrl(value);
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:sig|signature|token|expires|expire|exp|x-expires|x-signature|oe|oh|_nc_.+)$/i.test(key))
        url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString();
  });
  const id = `cobalt.${createHash("sha256")
    .update(JSON.stringify([platform, sourceId, addresses]))
    .digest("hex")
    .slice(0, 24)}`;
  return urls.length === 2 ? `${id}+cobalt.audio` : id;
}

/** Cobalt's Dailymotion extractor otherwise selects the largest variant regardless of the requested quality. */
export function selectDailymotionVariant(variants, quality) {
  return variants
    .filter(
      (variant) =>
        variant.codecs?.includes("avc1") &&
        integer(variant.resolution?.width, 16384) &&
        integer(variant.resolution?.height, 16384) &&
        positive(variant.bandwidth) &&
        Math.min(variant.resolution.width, variant.resolution.height) <= Number(quality),
    )
    .reduce((best, variant) => (!best || variant.bandwidth > best.bandwidth ? variant : best), undefined);
}

function platformFacts(platform, result) {
  const meta = result.canopy,
    media = meta?.media;
  if (!meta || result.picker || result.isPhoto || result.isAudioOnly) fail();
  if (platform === "youtube") {
    if (meta.isLive !== false || meta.isPrivate === true || meta.isUnlisted === true) fail();
    return { sourceId: meta.sourceId, title: meta.title, durationSeconds: meta.durationSeconds };
  }
  if (platform === "instagram") {
    if (
      !media ||
      media.carousel_media ||
      media.edge_sidecar_to_children ||
      media.is_live === true ||
      media.is_live_streaming === true ||
      media.has_drm === true ||
      media.copyright_blocked === true
    )
      fail();
    const mobile = meta.kind === "instagram-mobile";
    if (
      mobile
        ? media.media_type !== 2 || media.user?.is_private !== false
        : meta.kind !== "instagram-graphql" ||
          media.__typename !== "GraphVideo" ||
          media.is_video !== true ||
          media.owner?.is_private !== false
    )
      fail();
    const sourceId = mobile ? media.code : media.shortcode;
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    if (typeof sourceId !== "string" || !/^[A-Za-z0-9_-]+$/.test(sourceId)) fail();
    const numericId = [...sourceId].reduce((id, char) => id * 64n + BigInt(alphabet.indexOf(char)), 0n).toString();
    if (String(mobile ? media.pk : media.id) !== numericId) fail();
    return {
      sourceId,
      title: media.caption?.text ?? media.edge_media_to_caption?.edges?.[0]?.node?.text,
      durationSeconds: media.video_duration,
      hasAudio: media.has_audio,
    };
  }
  if (platform === "tiktok") {
    if (
      !media?.video ||
      !media.author ||
      media.imagePost ||
      media.isContentClassified ||
      media.privateItem ||
      media.isAd ||
      media.isLive ||
      media.liveRoomInfo ||
      media.video.drm ||
      media.video.isDrm
    )
      fail();
    return {
      sourceId: media.id,
      title: media.desc,
      durationSeconds: media.video.duration,
      width: media.video.width,
      height: media.video.height,
    };
  }
  if (platform === "dailymotion") {
    if (media?.__typename !== "Video") fail();
    return {
      sourceId: media.xid,
      title: media.title,
      durationSeconds: media.duration,
      width: meta.variant?.resolution?.width,
      height: meta.variant?.resolution?.height,
    };
  }
  if (platform === "vimeo") {
    if (media?.privacy?.view !== "anybody" || media.live || (media.type && media.type !== "video")) fail();
    const match = /^\/videos\/(\d+)$/.exec(media.uri ?? "");
    if (!match) fail();
    return { sourceId: match[1], title: media.name, durationSeconds: media.duration };
  }
  if (platform === "twitch") {
    if (!media?.broadcaster || !Array.isArray(media.videoQualities) || !media.videoQualities.length) fail();
    return { sourceId: media.slug, title: media.title, durationSeconds: media.durationSeconds };
  }
  fail();
}

function youtubeFormat(result, request) {
  const { video, audio } = result.canopy;
  if (
    result.isHLS ||
    result.type !== "merge" ||
    !video?.hasVideo ||
    !audio?.hasAudio ||
    !integer(video.itag) ||
    !integer(audio.itag)
  )
    fail("format_unavailable");
  const videoMime = /^(video\/(mp4|webm)); codecs="([A-Za-z0-9._-]+)"$/.exec(video.mime ?? "");
  if (!videoMime || !/^audio\/(?:mp4|webm); codecs="(?:mp4a\.[A-Za-z0-9._-]+|opus)"$/.test(audio.mime ?? "")) fail();
  const id = `${video.itag}+${audio.itag}`;
  if (request.selectedFormat && request.selectedFormat !== id) fail("format_unavailable");
  const sizes = [video.bytes, audio.bytes].map(Number);
  return {
    id,
    container: result.filenameAttributes?.extension,
    width: video.width,
    height: video.height,
    fps: positive(video.fps, 240) ? video.fps : null,
    bytes: sizes.every((size) => integer(size)) ? sizes[0] + sizes[1] : null,
    estimatedBytes: true,
    hasAudio: true,
    requiresMerge: true,
    videoCodec: videoMime[3],
  };
}

/** Normalize only source facts. The native adapter probes missing media facts under its resource limits. */
export function normalizeSource(result, request, limits) {
  const platform = request.platformId;
  if (!SUPPORTED.has(platform) || request.sourceComposition !== "single-video") fail();
  if (result?.error) {
    if (result.error === "content.too_long") fail("source_duration_limit", result.error);
    if (/private|login|unavailable|age|region/.test(result.error)) fail("source_unavailable", result.error);
    fail("engine_failed", result.error);
  }
  const facts = platformFacts(platform, result);
  if (typeof facts.sourceId !== "string" || facts.sourceId !== request.sourceId) fail();
  if (!positive(facts.durationSeconds)) fail();
  if (facts.durationSeconds > limits.durationSeconds) fail("source_duration_limit");
  const sourceUrls = typeof result.urls === "string" ? [result.urls] : result.urls;
  if (!Array.isArray(sourceUrls) || sourceUrls.length < 1 || sourceUrls.length > 2) fail();
  const urls = sourceUrls.map((url) => safeUrl(url).toString());
  if (new Set(urls).size !== urls.length) fail();
  let format;
  if (platform === "youtube") {
    if (urls.length !== 2) fail();
    format = youtubeFormat(result, request);
  } else {
    if (urls.length !== 1 && !result.isHLS) fail();
    const id = stableFormatId(platform, facts.sourceId, urls);
    if (request.selectedFormat?.startsWith("cobalt.") && request.selectedFormat !== id) fail("format_unavailable");
    format = { id, container: "mp4", requiresMerge: urls.length > 1, fps: null, bytes: null, estimatedBytes: true };
    if (integer(facts.width, 16384) && integer(facts.height, 16384))
      Object.assign(format, { width: facts.width, height: facts.height });
    if (typeof facts.hasAudio === "boolean") format.hasAudio = facts.hasAudio;
  }
  if (format.width && format.height && Math.min(format.width, format.height) > Number(request.quality))
    fail("format_unavailable");
  if (format.bytes && format.bytes > Math.min(limits.fileBytes, limits.outputBytes)) fail("resource_limit");
  return {
    evidence: {
      sourceId: facts.sourceId,
      originalComposition: "complete",
      items: [{ id: facts.sourceId, type: "video" }],
      isLive: false,
      requiresAuthentication: false,
    },
    title: cleanTitle(facts.title) || "Video",
    durationSeconds: facts.durationSeconds,
    formats: [{ ...format, urls, headers: headersFor(result), isHLS: result.isHLS === true }],
  };
}

export function resolverOptions(request) {
  const { platformId, sourceId, quality, selectedFormat, expectedFormat } = request;
  if (!SUPPORTED.has(platformId)) fail();
  const selectedQuality =
    expectedFormat && integer(expectedFormat.width, 16384) && integer(expectedFormat.height, 16384)
      ? String(Math.min(expectedFormat.width, expectedFormat.height, Number(quality)))
      : quality;
  const params = {
    id: sourceId,
    quality: selectedQuality,
    alwaysProxy: false,
    isAudioOnly: false,
    isAudioMuted: false,
  };
  if (platformId === "instagram" || platformId === "tiktok") params.postId = sourceId;
  if (platformId === "twitch") params.clipId = sourceId;
  if (platformId === "youtube") {
    Object.assign(params, { codec: "h264", container: "mp4", youtubeHLS: false });
    if (selectedFormat) {
      const ids = /^(\d{1,6})\+(\d{1,6})$/.exec(selectedFormat);
      if (!ids || expectedFormat?.id !== selectedFormat) fail("format_unavailable");
      const codec = expectedFormat.videoCodec;
      params.codec = /^avc1/.test(codec)
        ? "h264"
        : /^(vp9|vp09)/.test(codec)
          ? "vp9"
          : /^av01/.test(codec)
            ? "av1"
            : fail("format_unavailable");
      params.container = expectedFormat.container;
      params.itag = { video: Number(ids[1]), audio: Number(ids[2]) };
    }
  } else if (
    selectedFormat &&
    (expectedFormat?.id !== selectedFormat || !/^[A-Za-z0-9._-]{1,80}(?:\+[A-Za-z0-9._-]{1,80})?$/.test(selectedFormat))
  )
    fail("format_unavailable");
  return params;
}

async function main() {
  const requestPath = process.argv[2];
  const config = JSON.parse(await readFile(requestPath, "utf8"));
  const params = resolverOptions(config.request);
  if (!integer(config.limits?.durationSeconds, 1800)) fail();
  Object.assign(process.env, {
    API_URL: "http://127.0.0.1:9000/",
    API_INSTANCE_COUNT: "1",
    DURATION_LIMIT: String(config.limits.durationSeconds),
  });
  const cwd = process.cwd();
  // @imput/version-info resolves the pinned checkout relative to cwd on import.
  process.chdir("/opt/cobalt");
  let service;
  try {
    service = (await import(`/opt/cobalt/src/processing/services/${config.request.platformId}.js`)).default;
  } finally {
    process.chdir(cwd);
  }
  const result = normalizeSource(await service(params), config.request, config.limits);
  const encoded = JSON.stringify(result);
  if (Buffer.byteLength(encoded) > MAX_RECEIPT) fail();
  await writeFile("cobalt-source.json", encoded, { flag: "wx" });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Return failure messages through the sidecar instead of third-party console output.
  console.log = console.warn = console.error = () => {};
  // A patched service imports a pure selector from this module. Complete module
  // evaluation before awaiting its dynamic import, avoiding an ESM await cycle.
  main().then(
    () => process.exit(0),
    async (error) => {
      await writeFile("engine-error.json", JSON.stringify(engineError(error))).catch(() => {});
      process.exit(1);
    },
  );
}
