import { Innertube, Log, Session, Utils, type Misc } from "youtubei.js/cf-worker";
import {
  downloadInspectionSchema,
  MAX_DOWNLOAD_DURATION_SECONDS,
  type DownloadFormat,
  type DownloadInspection,
  type DownloadQuality,
} from "./contracts";
import type { PlatformSource } from "./PlatformService";

const RESPONSE_BYTES = 4 * 1024 * 1024;
const TOTAL_BYTES = 8 * 1024 * 1024;
const FILE_BYTES = 250 * 1024 * 1024;
const TIMEOUT_MS = 2500;
const SESSION_TTL_MS = 10 * 60_000;
const DESKTOP_USER_AGENT = Utils.getRandomUserAgent("desktop");
type SessionData = Pick<Session, "context" | "api_key" | "api_version" | "account_index">;
// Only completed plain data crosses invocations. Never retain fetch, I/O or an in-flight promise.
let cachedSession: { data: SessionData; expiresAt: number } | null = null;
Log.setLevel(Log.Level.NONE);

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function duration(value: unknown): number | null {
  return typeof value === "string" &&
    /^\d{1,4}$/.test(value) &&
    Number(value) > 0 &&
    Number(value) <= MAX_DOWNLOAD_DURATION_SECONDS
    ? Number(value)
    : null;
}
function sourceDuration(raw: unknown, id: string, requireMicroformat: boolean): number | null {
  const data = record(raw),
    details = record(data.videoDetails),
    micro = record(record(data.microformat).playerMicroformatRenderer);
  const seconds = duration(details.lengthSeconds);
  if (
    record(data.playabilityStatus).status !== "OK" ||
    details.videoId !== id ||
    details.isPrivate !== false ||
    details.isCrawlable !== true ||
    details.isLiveContent !== false ||
    !seconds
  )
    return null;
  if (
    [details.isLive, details.isUpcoming, details.isPostLiveDvr].some((value) => value !== undefined && value !== false)
  )
    return null;
  if (
    requireMicroformat &&
    (micro.isUnlisted !== false ||
      micro.isFamilySafe !== true ||
      micro.hasYpcMetadata !== false ||
      duration(micro.lengthSeconds) !== seconds ||
      micro.liveBroadcastDetails !== undefined)
  )
    return null;
  return seconds;
}
function initialPlayer(html: string): unknown {
  const marker = /(?:window\[["']ytInitialPlayerResponse["']\]|ytInitialPlayerResponse)\s*=\s*/.exec(html);
  if (!marker) throw new Error("Missing player response");
  const start = marker.index + marker[0].length;
  if (html[start] !== "{") throw new Error("Missing player object");
  let depth = 0,
    quoted = false,
    escaped = false;
  for (let i = start; i < html.length; i++) {
    const char = html[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return JSON.parse(html.slice(start, i + 1));
  }
  throw new Error("Incomplete player object");
}
function directFormat(format: Misc.Format): boolean {
  if (
    !format.url ||
    format.cipher ||
    format.signature_cipher ||
    format.is_type_otf ||
    format.drm_families?.length ||
    format.drm_track_type ||
    format.fair_play_key_uri ||
    format.is_sr
  )
    return false;
  try {
    const url = new URL(format.url);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".googlevideo.com") &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      !url.searchParams.has("xtags")
    );
  } catch {
    return false;
  }
}
function formatsFor(
  formats: Misc.Format[],
  quality: DownloadQuality,
  sourceByteLimit: number,
): DownloadFormat[] | null {
  const audio = new Map<number, Misc.Format>();
  const languages = new Set<string | null>();
  for (const format of formats.filter((item) => item.has_audio && !item.has_video && !item.is_drc)) {
    // Native selection ranks audio across every available stream. Unknown tracks or
    // higher-quality variants make an exact 140/251 selection ambiguous.
    if (
      format.audio_quality !== ([140, 251].includes(format.itag) ? "AUDIO_QUALITY_MEDIUM" : "AUDIO_QUALITY_LOW") ||
      ![139, 140, 249, 250, 251].includes(format.itag) ||
      format.audio_track ||
      !format.is_original ||
      format.is_dubbed ||
      format.is_auto_dubbed ||
      format.is_descriptive ||
      format.is_secondary ||
      format.audio_channels !== 2 ||
      audio.has(format.itag) ||
      !directFormat(format)
    )
      return null;
    languages.add(format.language ?? null);
    audio.set(format.itag, format);
  }
  if (languages.size !== 1) return null;
  const seen = new Set<number>();
  const result: DownloadFormat[] = [];
  for (const format of formats.filter((item) => item.has_video && !item.has_audio)) {
    if (seen.has(format.itag)) return null;
    seen.add(format.itag);
    const mime = /^video\/(mp4|webm); codecs="([A-Za-z0-9._-]{1,64})"$/.exec(format.mime_type);
    if (!mime || !Number.isSafeInteger(format.itag) || format.itag < 1 || !directFormat(format)) continue;
    const container = mime[1] as "mp4" | "webm",
      codec = mime[2];
    if (container === "webm" && !/^(vp8|vp9|vp09|av1|av01)/.test(codec)) continue;
    const paired = audio.get(container === "mp4" ? 140 : 251);
    if (
      !paired ||
      paired.mime_type !== (container === "mp4" ? 'audio/mp4; codecs="mp4a.40.2"' : 'audio/webm; codecs="opus"')
    )
      continue;
    const width = format.width,
      height = format.height;
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      !width ||
      !height ||
      width < 1 ||
      height < 1 ||
      width > 16384 ||
      height > 16384 ||
      Math.min(width, height) > Number(quality)
    )
      continue;
    const sizes = [format.content_length, paired.content_length];
    if (!sizes.every((size) => Number.isSafeInteger(size) && size! > 0)) continue;
    const bytes = sizes[0]! + sizes[1]!;
    if (!Number.isSafeInteger(bytes) || bytes > Math.min(FILE_BYTES, sourceByteLimit)) continue;
    result.push({
      id: `${format.itag}+${paired.itag}`,
      container,
      width,
      height,
      fps:
        typeof format.fps === "number" && Number.isFinite(format.fps) && Math.trunc(format.fps) > 1 && format.fps <= 240
          ? Math.trunc(format.fps)
          : null,
      bytes,
      estimatedBytes: true,
      hasAudio: true,
      requiresMerge: true,
      videoCodec: codec,
    });
  }
  return result
    .sort(
      (a, b) =>
        Math.min(b.width, b.height) - Math.min(a.width, a.height) ||
        Number(a.container !== "mp4") - Number(b.container !== "mp4") ||
        (b.fps ?? 0) - (a.fps ?? 0) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 80);
}

/** A bounded YouTube-only shortcut. Any uncertainty retains the regular extractor path. */
export async function inspectYouTube(
  source: PlatformSource,
  quality: DownloadQuality,
  sourceByteLimit: number,
): Promise<{ inspection: DownloadInspection | null; sourceBytes: number; workMs: number }> {
  const started = Date.now();
  let failureStage: "input" | "request" | "session" | "watch" | "player" | "normalize" | "timeout" | null = null;
  let stage: "session" | "player" | "normalize" = "session";
  const errorClass = (error: unknown) =>
    error instanceof Error &&
    [
      "Error",
      "TypeError",
      "RangeError",
      "SyntaxError",
      "AbortError",
      "TimeoutError",
      "SessionError",
      "InnertubeError",
    ].includes(error.name)
      ? error.name
      : "UnknownError";
  const empty = { inspection: null, sourceBytes: 0, workMs: 0 };
  if (
    source.platformId !== "youtube" ||
    !/^[A-Za-z0-9_-]{11}$/.test(source.id) ||
    !["video", "short"].includes(source.contentForm) ||
    !["720", "1080"].includes(quality) ||
    !Number.isSafeInteger(sourceByteLimit) ||
    sourceByteLimit <= 0
  ) {
    console.info("download_inspection", { stage: "input", outcome: "fallback" });
    return empty;
  }
  const expectedUrl =
    source.contentForm === "short"
      ? `https://www.youtube.com/shorts/${source.id}`
      : `https://www.youtube.com/watch?v=${source.id}`;
  if (source.url !== expectedUrl) {
    console.info("download_inspection", { stage: "input", outcome: "fallback" });
    return empty;
  }
  const controller = new AbortController();
  let totalBytes = 0;
  let finished = false;
  const byteBudget = Math.min(TOTAL_BYTES, sourceByteLimit);
  let playerResponse: unknown;
  const deadline = Date.now() + TIMEOUT_MS;
  const boundedFetch: typeof fetch = async (input, init) => {
    const requestStarted = Date.now();
    let label: "request" | "session" | "watch" | "player" = "request";
    let status: number | null = null;
    let bytes = 0;
    let failure: string | null = null;
    try {
      controller.signal.throwIfAborted();
      const request = new Request(input, init),
        url = new URL(request.url);
      label =
        url.pathname === "/sw.js_data"
          ? "session"
          : url.pathname === "/watch"
            ? "watch"
            : url.pathname === "/youtubei/v1/player"
              ? "player"
              : "request";
      const allowed =
        url.origin === "https://www.youtube.com" &&
        !url.username &&
        !url.password &&
        !url.hash &&
        ((request.method === "GET" && url.pathname === "/sw.js_data" && !url.search) ||
          (request.method === "GET" && url.href === `https://www.youtube.com/watch?v=${source.id}&hl=en`) ||
          (request.method === "POST" &&
            url.pathname === "/youtubei/v1/player" &&
            [...url.searchParams].every(
              ([key, value]) => (key === "prettyPrint" && value === "false") || (key === "alt" && value === "json"),
            )));
      if (!allowed) throw new Error("Unexpected metadata request");
      request.headers.delete("Cookie");
      request.headers.delete("Authorization");
      // workerd does not implement redirect:"error". Manual plus the strict
      // status gate below rejects redirects without contacting their targets.
      const response = await fetch(request, { signal: controller.signal, redirect: "manual" });
      status = response.status;
      if (response.status !== 200 || response.redirected || !response.body) throw new Error("Metadata unavailable");
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
          controller.signal.throwIfAborted();
          if (part.done) break;
          if (finished) throw new Error("Inspection completed");
          bytes += part.value.byteLength;
          const observedBytes = totalBytes + part.value.byteLength;
          totalBytes = Math.min(observedBytes, sourceByteLimit);
          if (bytes > RESPONSE_BYTES || observedBytes > byteBudget) throw new Error("Metadata exceeds budget");
          chunks.push(part.value);
        }
      } catch (error) {
        cancel();
        throw error;
      } finally {
        controller.signal.removeEventListener("abort", cancel);
      }
      const body = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
      if (url.pathname === "/youtubei/v1/player") playerResponse = JSON.parse(new TextDecoder().decode(body));
      return new Response(body, { headers: { "Content-Type": response.headers.get("Content-Type") ?? "text/plain" } });
    } catch (error) {
      failure = errorClass(error);
      failureStage ??= label;
      throw error;
    } finally {
      if (!finished)
        console.info("download_inspection", {
          stage: label,
          status,
          bytes,
          elapsedMs: Math.max(0, Date.now() - requestStarted),
          failure,
        });
    }
  };
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      failureStage = "timeout";
      controller.abort();
      resolve(null);
    }, TIMEOUT_MS);
  });
  let inspection: DownloadInspection | null = null;
  try {
    inspection = await Promise.race([
      timeout,
      (async () => {
        const watchRequest = boundedFetch(`https://www.youtube.com/watch?v=${source.id}&hl=en`, {
          headers: { "User-Agent": DESKTOP_USER_AGENT, "Accept-Language": "en-US,en;q=0.9" },
        })
          .then((response) => response.text())
          .then((text) => {
            try {
              return initialPlayer(text);
            } catch (error) {
              failureStage = "watch";
              throw error;
            }
          });
        const videoRequest = (async () => {
          let yt: Innertube;
          if (cachedSession && cachedSession.expiresAt > Date.now()) {
            const data = structuredClone(cachedSession.data);
            yt = new Innertube(
              new Session(
                data.context,
                data.api_key,
                data.api_version,
                data.account_index,
                undefined,
                undefined,
                undefined,
                boundedFetch,
              ),
            );
          } else {
            yt = await Innertube.create({
              generate_session_locally: false,
              retrieve_player: false,
              retrieve_innertube_config: false,
              fail_fast: true,
              enable_session_cache: false,
              user_agent: DESKTOP_USER_AGENT,
              fetch: boundedFetch,
            });
            controller.signal.throwIfAborted();
            const data: SessionData = structuredClone({
              context: yt.session.context,
              api_key: yt.session.api_key,
              api_version: yt.session.api_version,
              account_index: yt.session.account_index,
            });
            if (new TextEncoder().encode(JSON.stringify(data)).byteLength > 64 * 1024)
              throw new Error("Session exceeds budget");
            cachedSession = { data, expiresAt: Date.now() + SESSION_TTL_MS };
          }
          stage = "player";
          return yt.getBasicInfo(source.id, { client: "VISIONOS" });
        })();
        const [watch, info] = await Promise.all([watchRequest, videoRequest]);
        controller.signal.throwIfAborted();
        stage = "normalize";
        const seconds = sourceDuration(watch, source.id, true);
        if (
          !seconds ||
          sourceDuration(playerResponse, source.id, false) !== seconds ||
          info.basic_info.id !== source.id ||
          info.basic_info.duration !== seconds ||
          Date.now() >= deadline
        )
          return null;
        const streams = record(record(playerResponse).streamingData);
        for (const group of [streams.formats, streams.adaptiveFormats]) {
          if (group === undefined) continue;
          if (!Array.isArray(group)) return null;
          for (const entry of group) {
            const raw = record(entry);
            // The library uses parseInt for these fields; do not publish coerced
            // values that the native extractor would reject on selection.
            if (
              [raw.width, raw.height].some(
                (value) => value !== undefined && (!Number.isInteger(value) || Number(value) <= 0),
              ) ||
              (raw.contentLength !== undefined &&
                (typeof raw.contentLength !== "string" || !/^\d{1,16}$/.test(raw.contentLength))) ||
              (raw.fps !== undefined && (typeof raw.fps !== "number" || !Number.isFinite(raw.fps)))
            )
              return null;
          }
        }
        const title = record(record(watch).videoDetails).title;
        if (typeof title !== "string") return null;
        const formats = formatsFor(
          [...(info.streaming_data?.formats ?? []), ...(info.streaming_data?.adaptive_formats ?? [])],
          quality,
          sourceByteLimit,
        );
        if (!formats?.length) return null;
        const result = downloadInspectionSchema.safeParse({
          title: title
            .replace(/[\x00-\x1f\x7f]/g, " ")
            .trim()
            .slice(0, 300),
          durationSeconds: seconds,
          formats,
        });
        return result.success && Date.now() < deadline ? result.data : null;
      })(),
    ]);
  } catch (error) {
    failureStage ??= stage;
    console.info("download_inspection", { stage: failureStage, failure: errorClass(error) });
  } finally {
    finished = true;
    clearTimeout(timer!);
    controller.abort();
  }
  const workMs = Math.max(0, Date.now() - started);
  console.info("download_inspection", {
    stage: "total",
    outcome: inspection ? "ready" : "fallback",
    failureStage: inspection ? null : (failureStage ?? stage),
    sourceBytes: totalBytes,
    workMs,
  });
  return { inspection, sourceBytes: totalBytes, workMs };
}
