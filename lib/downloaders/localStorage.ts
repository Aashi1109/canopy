import type { R2Bucket, R2HTTPMetadata } from "@cloudflare/workers-types";
import { DownloadError, MAX_DOWNLOAD_WORK_MS } from "./contracts";
import { downloadErrorResponse, signCapability, verifyCapability } from "./security";

export const LOCAL_STORAGE_ORIGIN = "https://download-storage.local";
export const LOCAL_STORAGE_PATH = "/__download-storage/";
const MAX_FILE_BYTES = 250 * 1024 ** 2;
const STAGING_URL_TTL_SECONDS = Math.ceil(MAX_DOWNLOAD_WORK_MS / 1000) + 60;
const PURPOSE = "download-local-storage-v1";
export type LocalStorageEnv = {
  DOWNLOADERS_LOCAL?: string;
  DOWNLOADERS_LOCAL_ORIGIN?: string;
  DOWNLOADERS_CONTROL_SECRET?: string;
  DOWNLOAD_FILES?: R2Bucket;
};
function bucket(env: LocalStorageEnv): R2Bucket {
  if (env.DOWNLOADERS_LOCAL !== "true" || !env.DOWNLOAD_FILES)
    throw new DownloadError("STORAGE_UNAVAILABLE", "Local download storage is unavailable.", 503);
  return env.DOWNLOAD_FILES;
}
function browserOrigin(env: LocalStorageEnv): string {
  try {
    const url = new URL(env.DOWNLOADERS_LOCAL_ORIGIN ?? "");
    if (
      ["http:", "https:"].includes(url.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    )
      return url.origin;
  } catch {
    /* The configured origin must be a local browser endpoint. */
  }
  throw new DownloadError("STORAGE_UNAVAILABLE", "The local download origin is invalid.", 503);
}
function validKey(key: string): boolean {
  return key.length <= 256 && /^(?:staging|sealed)\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(key);
}
function etagValue(etag: string): string | null {
  const plain = etag.startsWith('"') && etag.endsWith('"') ? etag.slice(1, -1) : etag;
  return /^[a-fA-F0-9-]{16,100}$/.test(plain) ? plain : null;
}
export function signLocalStorageUrl(
  env: LocalStorageEnv,
  key: string,
  method: "GET" | "PUT",
  expiresIn: number,
): string {
  bucket(env);
  if (
    !validKey(key) ||
    (method === "PUT" && !key.startsWith("staging/")) ||
    !Number.isInteger(expiresIn) ||
    expiresIn < 1 ||
    expiresIn > (key.startsWith("staging/") ? STAGING_URL_TTL_SECONDS : 300)
  )
    throw new DownloadError("INVALID_ARTIFACT", "The stored download is invalid.", 503);
  const capability = signCapability(
    { purpose: PURPOSE, method, key, expiresAt: Math.floor(Date.now() / 1000) + expiresIn },
    env.DOWNLOADERS_CONTROL_SECRET ?? "",
  );
  const origin = key.startsWith("staging/") ? LOCAL_STORAGE_ORIGIN : browserOrigin(env);
  return `${origin}${LOCAL_STORAGE_PATH}${key}?capability=${capability}`;
}

/** Keep R2's known-length stream requirement while enforcing actual bytes and cancellation. */
async function putBody(
  target: R2Bucket,
  key: string,
  body: ReadableStream<Uint8Array>,
  length: number,
  httpMetadata: R2HTTPMetadata,
  signal: AbortSignal,
  checkpoint: () => Promise<void> = async () => {},
) {
  const FixedLength = (
    globalThis as typeof globalThis & {
      FixedLengthStream?: new (length: number) => {
        readable: ReadableStream<Uint8Array>;
        writable: WritableStream<Uint8Array>;
      };
    }
  ).FixedLengthStream;
  if (!FixedLength) throw new DownloadError("STORAGE_UNAVAILABLE", "Local storage requires the Worker runtime.", 503);
  const fixed = new FixedLength(length);
  const stop = new AbortController();
  let bytes = 0;
  const bounded = new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, controller) {
      await checkpoint();
      bytes += chunk.byteLength;
      if (bytes > length || bytes > MAX_FILE_BYTES)
        throw new DownloadError("OUTPUT_TOO_LARGE", "The upload exceeds its allowed size.", 413);
      controller.enqueue(chunk);
    },
    flush() {
      if (bytes !== length) throw new DownloadError("INCOMPLETE_UPLOAD", "The upload is incomplete.", 400);
    },
  });
  const pump = body.pipeThrough(bounded).pipeTo(fixed.writable, { signal: AbortSignal.any([signal, stop.signal]) });
  const write = Promise.resolve().then(() => target.put(key, fixed.readable, { httpMetadata }));
  try {
    const [stored] = await Promise.all([write, pump]);
    return stored;
  } catch (error) {
    stop.abort();
    await Promise.allSettled([write, pump]);
    throw error;
  }
}

export async function handleLocalStorageRequest(request: Request, env: LocalStorageEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (env.DOWNLOADERS_LOCAL !== "true" || !url.pathname.startsWith(LOCAL_STORAGE_PATH)) return null;
  try {
    const target = bucket(env);
    if (
      (url.origin !== LOCAL_STORAGE_ORIGIN && url.origin !== browserOrigin(env)) ||
      url.username ||
      url.password ||
      url.hash
    )
      throw new DownloadError("STORAGE_FORBIDDEN", "This storage capability is invalid.", 403);
    if (url.pathname === `${LOCAL_STORAGE_PATH}health` && request.method === "GET" && !url.search)
      return Response.json(
        { storage: "canopy-local-r2", protocolVersion: 1 },
        { headers: { "Cache-Control": "no-store" } },
      );
    const key = url.pathname.slice(LOCAL_STORAGE_PATH.length);
    const capability = url.searchParams.get("capability") ?? "";
    const payload = verifyCapability(capability, [env.DOWNLOADERS_CONTROL_SECRET ?? ""]);
    if (
      !validKey(key) ||
      url.searchParams.size !== 1 ||
      !payload ||
      Object.keys(payload).length !== 4 ||
      payload.purpose !== PURPOSE ||
      payload.method !== request.method ||
      payload.key !== key ||
      Number(payload.expiresAt) >
        Math.floor(Date.now() / 1000) + (key.startsWith("staging/") ? STAGING_URL_TTL_SECONDS : 300) ||
      !["GET", "PUT"].includes(request.method) ||
      (request.method === "PUT" && !key.startsWith("staging/"))
    )
      throw new DownloadError("STORAGE_FORBIDDEN", "This storage capability is invalid or expired.", 403);
    if (request.method === "PUT") {
      const length = request.headers.get("content-length");
      if (!length || !/^\d+$/.test(length))
        throw new DownloadError("UPLOAD_LENGTH_REQUIRED", "Provide the upload size.", 411);
      const bytes = Number(length);
      if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX_FILE_BYTES)
        throw new DownloadError("OUTPUT_TOO_LARGE", "The upload exceeds its allowed size.", 413);
      if (!request.body) throw new DownloadError("INCOMPLETE_UPLOAD", "The upload is incomplete.", 400);
      const remaining = Math.max(1, Number(payload.expiresAt) * 1000 - Date.now());
      const stored = await putBody(
        target,
        key,
        request.body,
        bytes,
        { contentType: "application/octet-stream", cacheControl: "private, no-store" },
        AbortSignal.any([request.signal, AbortSignal.timeout(remaining)]),
      );
      return new Response(null, { headers: { ETag: stored.httpEtag, "Cache-Control": "private, no-store" } });
    }
    const suppliedEtag = request.headers.get("if-match");
    let expectedEtag = suppliedEtag ? etagValue(suppliedEtag) : undefined;
    if (suppliedEtag && !expectedEtag) return new Response(null, { status: 412 });
    let range: { offset: number; length: number } | undefined;
    const rangeHeader = request.headers.get("range");
    if (rangeHeader) {
      const head = await target.head(key);
      if (!head) return new Response(null, { status: 404 });
      if (expectedEtag && head.etag !== expectedEtag) return new Response(null, { status: 412 });
      const match = rangeHeader.length <= 100 && /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
      let start = match && match[1] ? Number(match[1]) : 0;
      let end = match && match[2] ? Number(match[2]) : head.size - 1;
      if (match && !match[1] && match[2]) {
        start = Math.max(0, head.size - Number(match[2]));
        end = head.size - 1;
      }
      if (
        !match ||
        (!match[1] && !match[2]) ||
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        start >= head.size ||
        end < start
      )
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${head.size}` } });
      end = Math.min(end, head.size - 1);
      range = { offset: start, length: end - start + 1 };
      expectedEtag = head.etag;
    }
    const object = await target.get(key, {
      ...(expectedEtag ? { onlyIf: { etagMatches: expectedEtag } } : {}),
      ...(range ? { range } : {}),
    });
    if (!object) return new Response(null, { status: 404 });
    if (!("body" in object)) return new Response(null, { status: 412 });
    const headers = new Headers({
      ETag: object.httpEtag,
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Content-Disposition": object.httpMetadata?.contentDisposition ?? 'attachment; filename="video.mp4"',
      "Content-Length": String(range?.length ?? object.size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    });
    if (range) headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`);
    return new Response(object.body, { status: range ? 206 : 200, headers });
  } catch (error) {
    return downloadErrorResponse(error);
  }
}

export async function promoteLocalArtifact(
  env: LocalStorageEnv,
  source: { storageKey: string; etag: string; bytes: number },
  destination: { storageKey: string; filename: string; mime: string },
  progress: { deadline: string; heartbeat: () => Promise<void> },
): Promise<string> {
  const target = bucket(env);
  const deadline = Date.parse(progress.deadline);
  const checkDeadline = () => {
    if (!Number.isFinite(deadline) || deadline <= Date.now())
      throw new DownloadError("WORK_BUDGET", "The download reached its processing limit.", 422);
  };
  checkDeadline();
  await progress.heartbeat();
  checkDeadline();
  const etag = etagValue(source.etag);
  if (
    !etag ||
    !validKey(source.storageKey) ||
    !source.storageKey.startsWith("staging/") ||
    !validKey(destination.storageKey) ||
    !destination.storageKey.startsWith("sealed/")
  )
    throw new DownloadError("INVALID_ARTIFACT", "The output could not be verified.", 422);
  const object = await target.get(source.storageKey, { onlyIf: { etagMatches: etag } });
  try {
    checkDeadline();
  } catch (error) {
    if (object && "body" in object) await object.body.cancel();
    throw error;
  }
  if (!object || !("body" in object) || object.etag !== etag || object.size !== source.bytes) {
    if (object && "body" in object) await object.body.cancel();
    throw new DownloadError("STORAGE_VERIFY_FAILED", "The stored download changed before publication.", 503);
  }
  let lastHeartbeat = Date.now();
  const stored = await putBody(
    target,
    destination.storageKey,
    object.body,
    source.bytes,
    {
      contentType: destination.mime,
      contentDisposition: `attachment; filename="${destination.filename}"`,
      cacheControl: "private, no-store",
    },
    AbortSignal.timeout(Math.max(1, deadline - Date.now())),
    async () => {
      checkDeadline();
      if (Date.now() - lastHeartbeat >= 1000) {
        await progress.heartbeat();
        lastHeartbeat = Date.now();
        checkDeadline();
      }
    },
  );
  checkDeadline();
  await progress.heartbeat();
  checkDeadline();
  const verified = await target.head(destination.storageKey);
  checkDeadline();
  if (!verified || verified.size !== source.bytes || verified.httpEtag !== stored.httpEtag)
    throw new DownloadError("STORAGE_VERIFY_FAILED", "The saved download could not be verified.", 503);
  return verified.httpEtag;
}
