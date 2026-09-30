import { parse, type HTMLElement } from "node-html-parser";
import {
  downloadInspectionSchema,
  MAX_DOWNLOAD_DURATION_SECONDS,
  type DownloadFormat,
  type DownloadInspection,
  type DownloadQuality,
} from "./contracts";
import type { PlatformSource } from "./PlatformService";

const RESPONSE_BYTES = 2 * 1024 * 1024;
const FILE_BYTES = 250 * 1024 * 1024;
const TIMEOUT_MS = 1800;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function pageMedia(html: string, id: string): Record<string, unknown> | null {
  const found: Record<string, unknown>[] = [];
  for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (!/\btype\s*=\s*["']application\/json["']/i.test(script[1]) || !script[2].includes("xig_polaris_media"))
      continue;
    const pending: unknown[] = [JSON.parse(script[2])];
    let nodes = 0;
    while (pending.length) {
      if (++nodes > 20_000) return null;
      const value = pending.pop();
      if (!value || typeof value !== "object") continue;
      const media = record(record(record(value).xig_polaris_media).if_not_gated_logged_out);
      if (media.code === id) {
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        const numericId = [...id].reduce((value, character) => value * 64n + BigInt(alphabet.indexOf(character)), 0n);
        if (media.pk !== numericId.toString()) return null;
        found.push(media);
      }
      pending.push(...Object.values(value));
    }
  }
  return found.length === 1 ? found[0] : null;
}

function seconds(value: string | undefined): number | null {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value ?? "");
  if (!match) return null;
  const result = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return Number.isFinite(result) && result > 0 && result <= MAX_DOWNLOAD_DURATION_SECONDS ? result : null;
}

function integer(value: string | undefined, max = Number.MAX_SAFE_INTEGER): number | null {
  if (!/^\d{1,16}$/.test(value ?? "")) return null;
  const result = Number(value);
  return Number.isSafeInteger(result) && result > 0 && result <= max ? result : null;
}

function children(node: HTMLElement, name: string): HTMLElement[] {
  return node.childNodes.filter((child): child is HTMLElement => child.nodeType === 1 && child.rawTagName === name);
}

function mediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      [".cdninstagram.com", ".fbcdn.net"].some((suffix) => url.hostname.endsWith(suffix))
    );
  } catch {
    return false;
  }
}

function normalize(
  media: Record<string, unknown>,
  quality: DownloadQuality,
  sourceByteLimit: number,
): DownloadInspection | null {
  if (
    media.__typename !== "XIGPolarisVideoMedia" ||
    media.media_type !== 2 ||
    record(media.user).is_private !== false ||
    record(media.user).is_unpublished === true ||
    typeof media.has_audio !== "boolean" ||
    media.carousel_media !== undefined ||
    [media.is_live, media.is_live_streaming, media.has_drm, media.copyright_blocked].some(
      (value) => value !== undefined && value !== false,
    ) ||
    typeof media.video_dash_manifest !== "string"
  )
    return null;
  const xml = media.video_dash_manifest;
  // Only the provider's static, single-period, direct-file DASH shape is supported.
  // This HTML parser does not resolve XML entities or retrieve external resources.
  if (xml.length > 256_000 || /<!|<(?:\w+:)?(?:ContentProtection|SegmentTemplate|SegmentList)\b/i.test(xml))
    return null;
  const tree = parse(xml),
    roots = children(tree, "MPD");
  if (roots.length !== 1 || roots[0].attributes.type !== "static") return null;
  const periods = children(roots[0], "Period"),
    duration = seconds(roots[0].attributes.mediaPresentationDuration);
  if (
    periods.length !== 1 ||
    !duration ||
    (periods[0].attributes.duration !== undefined && seconds(periods[0].attributes.duration) !== duration)
  )
    return null;
  if (
    media.video_duration !== undefined &&
    (typeof media.video_duration !== "number" ||
      !Number.isFinite(media.video_duration) ||
      media.video_duration <= 0 ||
      media.video_duration > MAX_DOWNLOAD_DURATION_SECONDS ||
      Math.abs(media.video_duration - duration) > 0.1)
  )
    return null;
  const representations = periods[0].querySelectorAll("representation");
  if (!representations.length || representations.length > 80) return null;
  const streams: {
    id: string;
    mime: string;
    codec: string;
    width: number | null;
    height: number | null;
    fps: number | null;
    bytes: number | null;
  }[] = [];
  const ids = new Set<string>();
  const sourceUrls = new Set<string>();
  for (const representation of representations) {
    const parent = representation.parentNode;
    if (parent?.rawTagName !== "AdaptationSet" || parent.parentNode !== periods[0]) return null;
    const attrs = { ...parent.attributes, ...representation.attributes },
      id = `dash-${attrs.id}`;
    if (
      !/^[A-Za-z0-9._-]{1,80}$/.test(id) ||
      !representation.attributes.id ||
      ids.has(id) ||
      !["video/mp4", "audio/mp4"].includes(attrs.mimeType) ||
      !/^[A-Za-z0-9._-]{1,64}$/.test(attrs.codecs ?? "")
    )
      return null;
    ids.add(id);
    const urls = children(representation, "BaseURL"),
      segments = children(representation, "SegmentBase");
    if (
      urls.length !== 1 ||
      !mediaUrl(urls[0].text) ||
      sourceUrls.has(urls[0].text) ||
      segments.length !== 1 ||
      children(segments[0], "Initialization").length !== 1
    )
      return null;
    sourceUrls.add(urls[0].text);
    const video = attrs.mimeType === "video/mp4";
    if (video ? !/^(?:avc1|av01|hev1|hvc1|vp09)\./.test(attrs.codecs) : !/^mp4a\./.test(attrs.codecs)) return null;
    const width = integer(attrs.width, 16384),
      height = integer(attrs.height, 16384);
    if (video && (!width || !height)) return null;
    const bytes = attrs.FBContentLength === undefined ? null : integer(attrs.FBContentLength);
    if (attrs.FBContentLength !== undefined && !bytes) return null;
    streams.push({
      id,
      mime: attrs.mimeType,
      codec: attrs.codecs,
      width,
      height,
      // yt-dlp's DASH parser accepts integer frameRate; a rational remains unknown.
      fps: integer(attrs.frameRate, 240),
      bytes,
    });
  }
  if (
    Array.isArray(media.video_versions) &&
    media.video_versions.some((version) => {
      const value = record(version);
      return ids.has(String(value.id ?? value.type));
    })
  )
    return null;
  const audio = streams.filter((stream) => stream.mime === "audio/mp4");
  // Several audio tracks need native language/preference selection; never guess.
  if (audio.length !== (media.has_audio ? 1 : 0)) return null;
  const formats: DownloadFormat[] = [];
  for (const video of streams.filter((stream) => stream.mime === "video/mp4")) {
    if (Math.min(video.width!, video.height!) > Number(quality)) continue;
    const bytes =
      video.bytes !== null && (!audio.length || audio[0].bytes !== null) ? video.bytes + (audio[0]?.bytes ?? 0) : null;
    if (bytes !== null && bytes > Math.min(FILE_BYTES, sourceByteLimit)) continue;
    formats.push({
      id: audio.length ? `${video.id}+${audio[0].id}` : video.id,
      container: "mp4",
      width: video.width!,
      height: video.height!,
      fps: video.fps,
      bytes,
      estimatedBytes: audio.length > 0 || bytes === null,
      hasAudio: media.has_audio,
      requiresMerge: audio.length > 0,
      videoCodec: video.codec,
    });
  }
  formats.sort(
    (a, b) =>
      Math.min(b.width, b.height) - Math.min(a.width, a.height) ||
      (b.fps ?? 0) - (a.fps ?? 0) ||
      a.id.localeCompare(b.id),
  );
  const caption = record(media.caption).text;
  const title =
    typeof caption === "string"
      ? caption
          .replace(/[\x00-\x1f\x7f]/g, " ")
          .trim()
          .slice(0, 300)
      : "";
  const result = downloadInspectionSchema.safeParse({
    title: title || "Instagram video",
    durationSeconds: duration,
    formats,
  });
  return result.success ? result.data : null;
}

/** Inspect public Instagram page metadata once; uncertainty retains native extraction. */
export async function inspectInstagram(
  source: PlatformSource,
  quality: DownloadQuality,
  sourceByteLimit: number,
): Promise<{
  inspection: DownloadInspection | null;
  sourceBytes: number;
  workMs: number;
}> {
  const started = Date.now();
  if (
    source.platformId !== "instagram" ||
    !/^[A-Za-z0-9_-]{3,64}$/.test(source.id) ||
    !["reel", "video"].includes(source.contentForm) ||
    source.url !== `https://www.instagram.com/${source.contentForm === "reel" ? "reel" : "tv"}/${source.id}/` ||
    !["720", "1080"].includes(quality) ||
    !Number.isSafeInteger(sourceByteLimit) ||
    sourceByteLimit <= 0
  )
    return { inspection: null, sourceBytes: 0, workMs: 0 };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let sourceBytes = 0,
    status: number | null = null,
    stage: "request" | "normalize" = "request";
  let inspection: DownloadInspection | null = null;
  try {
    const response = await fetch(`https://www.instagram.com/p/${source.id}/`, {
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
        "Cache-Control": "max-age=0",
        DNT: "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
    });
    status = response.status;
    if (status !== 200 || response.redirected || !response.body) {
      await response.body?.cancel();
      return { inspection: null, sourceBytes, workMs: Date.now() - started };
    }
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    const cancel = () => {
      void reader.cancel().catch(() => {});
    };
    controller.signal.addEventListener("abort", cancel, { once: true });
    try {
      while (true) {
        controller.signal.throwIfAborted();
        const part = await reader.read();
        if (part.done) break;
        const observedBytes = sourceBytes + part.value.byteLength;
        sourceBytes = Math.min(observedBytes, sourceByteLimit);
        if (observedBytes > Math.min(RESPONSE_BYTES, sourceByteLimit)) throw new Error("Metadata budget");
        chunks.push(part.value);
      }
    } catch (error) {
      cancel();
      throw error;
    } finally {
      controller.signal.removeEventListener("abort", cancel);
    }
    controller.signal.throwIfAborted();
    const bytes = new Uint8Array(sourceBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    stage = "normalize";
    const media = pageMedia(new TextDecoder().decode(bytes), source.id);
    if (media) inspection = normalize(media, quality, sourceByteLimit);
    if (Date.now() - started >= TIMEOUT_MS) inspection = null;
  } catch {
    /* Native inspection handles blocked, changed or incomplete metadata. */
  } finally {
    clearTimeout(timer);
    console.info("download_inspection", {
      platform: "instagram",
      stage,
      status,
      bytes: sourceBytes,
      elapsedMs: Math.max(0, Date.now() - started),
      outcome: inspection ? "ready" : "fallback",
    });
  }
  return { inspection, sourceBytes, workMs: Math.max(0, Date.now() - started) };
}
