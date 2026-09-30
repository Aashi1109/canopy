import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createStagingArtifacts, sealDownloadArtifacts, signStorageUrl } from "../lib/downloaders/storage.ts";
import { handleLocalStorageRequest, LOCAL_STORAGE_ORIGIN } from "../lib/downloaders/localStorage.ts";
import { signCapability, verifyCapability } from "../lib/downloaders/security.ts";

const token = {
  jobId: crypto.randomUUID(),
  attemptId: crypto.randomUUID(),
  generation: 1,
  slotId: "download-1",
  slotGeneration: 1,
};
const progress = () => ({ deadline: new Date(Date.now() + 60_000).toISOString(), heartbeat: vi.fn(async () => {}) });
function setup() {
  const objects = new Map();
  const metadata = (key, value) => ({
    key,
    size: value.bytes.length,
    etag: value.etag,
    httpEtag: `"${value.etag}"`,
    httpMetadata: value.httpMetadata,
  });
  const bucket = {
    put: vi.fn(async (key, stream, options = {}) => {
      const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      const value = { bytes, etag: createHash("md5").update(bytes).digest("hex"), httpMetadata: options.httpMetadata };
      objects.set(key, value);
      return metadata(key, value);
    }),
    head: vi.fn(async (key) => (objects.has(key) ? metadata(key, objects.get(key)) : null)),
    get: vi.fn(async (key, options = {}) => {
      const value = objects.get(key);
      if (!value) return null;
      const result = metadata(key, value);
      if (options.onlyIf && options.onlyIf.etagMatches !== value.etag) return result;
      const start = options.range?.offset ?? 0;
      const end = options.range?.length ? start + options.range.length : value.bytes.length;
      return { ...result, body: new Response(value.bytes.slice(start, end)).body };
    }),
  };
  return {
    objects,
    bucket,
    env: {
      DOWNLOADERS_LOCAL: "true",
      DOWNLOADERS_LOCAL_ORIGIN: "http://localhost:8788",
      DOWNLOADERS_CONTROL_SECRET: "local-test-secret-".repeat(3),
      DOWNLOAD_FILES: bucket,
    },
  };
}
function upload(url, body, length = body.length) {
  return new Request(url, { method: "PUT", body, headers: { "Content-Length": String(length) }, duplex: "half" });
}
async function stored(env, bytes = "a small video") {
  const [stage] = await createStagingArtifacts(env, token);
  const result = await handleLocalStorageRequest(upload(stage.putUrl, bytes), env);
  expect(result.status).toBe(200);
  return {
    stage,
    artifact: {
      id: stage.artifactId,
      storageKey: stage.storageKey,
      etag: result.headers.get("etag"),
      name: "video.mp4",
      mime: "video/mp4",
      bytes: bytes.length,
      width: 1280,
      height: 720,
      durationSeconds: 1,
      hasAudio: true,
    },
  };
}
beforeEach(() => {
  // R2 requires a known-length stream. Real Workers provide FixedLengthStream;
  // this fixture exercises byte enforcement and backpressure using web streams.
  vi.stubGlobal(
    "FixedLengthStream",
    class {
      constructor() {
        const stream = new TransformStream();
        this.readable = stream.readable;
        this.writable = stream.writable;
      }
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("local uploads and conditional readback use the same private bucket without S3 credentials", async () => {
  const { env, bucket } = setup();
  const { stage, artifact } = await stored(env);
  expect(new URL(stage.putUrl).origin).toBe(LOCAL_STORAGE_ORIGIN);
  expect(new URL(stage.getUrl).pathname).toBe(new URL(stage.putUrl).pathname);
  const response = await handleLocalStorageRequest(
    new Request(stage.getUrl, { headers: { "If-Match": artifact.etag } }),
    env,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("etag")).toBe(artifact.etag);
  expect(await response.text()).toBe("a small video");
  expect(bucket.get.mock.calls.at(-1)[1].onlyIf.etagMatches).toBe(artifact.etag.slice(1, -1));
  const changed = await handleLocalStorageRequest(
    new Request(stage.getUrl, { headers: { "If-Match": '"00000000000000000000000000000000"' } }),
    env,
  );
  expect(changed.status).toBe(412);
});

test("capabilities bind method, key, expiry and the local-only endpoint", async () => {
  const { env, bucket } = setup();
  const [stage] = await createStagingArtifacts(env, token);
  expect(
    await handleLocalStorageRequest(upload(stage.putUrl, "ok"), { ...env, DOWNLOADERS_LOCAL: "false" }),
  ).toBeNull();
  expect((await handleLocalStorageRequest(new Request(stage.putUrl), env)).status).toBe(403);
  const changed = new URL(stage.putUrl);
  changed.pathname += "-other";
  expect((await handleLocalStorageRequest(upload(changed, "ok"), env)).status).toBe(403);
  const sealed = new URL(stage.putUrl);
  sealed.pathname = sealed.pathname.replace("/staging/", "/sealed/");
  expect((await handleLocalStorageRequest(upload(sealed, "ok"), env)).status).toBe(403);
  const wrongHost = new URL(stage.putUrl);
  wrongHost.hostname = "other.local";
  expect((await handleLocalStorageRequest(upload(wrongHost, "ok"), env)).status).toBe(403);
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 661_000);
  expect((await handleLocalStorageRequest(upload(stage.putUrl, "ok"), env)).status).toBe(403);
  expect(bucket.put).not.toHaveBeenCalled();
  await expect(signStorageUrl(env, "staging/x/../secret", "GET")).rejects.toThrow();
  await expect(signStorageUrl(env, "sealed/x", "PUT")).rejects.toThrow();
});

test("local staging remains usable through ten-minute work while sealed downloads expire at five minutes", async () => {
  const { env } = setup();
  vi.useFakeTimers();
  const now = Date.now();
  vi.setSystemTime(now);
  const [stage] = await createStagingArtifacts(env, token);
  const payload = (url) =>
    verifyCapability(new URL(url).searchParams.get("capability"), [env.DOWNLOADERS_CONTROL_SECRET]);
  expect(payload(stage.putUrl).expiresAt).toBe(Math.floor(now / 1000) + 660);
  expect(payload(stage.getUrl).expiresAt).toBe(Math.floor(now / 1000) + 660);
  const sealedUrl = await signStorageUrl(env, "sealed/file", "GET");
  expect(payload(sealedUrl).expiresAt).toBe(Math.floor(now / 1000) + 300);
  vi.setSystemTime(now + 599_000);
  expect((await handleLocalStorageRequest(upload(stage.putUrl, "late video"), env)).status).toBe(200);
  const response = await handleLocalStorageRequest(new Request(stage.getUrl), env);
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("late video");
  expect((await handleLocalStorageRequest(new Request(sealedUrl), env)).status).toBe(403);
  vi.setSystemTime(now + 661_000);
  expect((await handleLocalStorageRequest(new Request(stage.getUrl), env)).status).toBe(403);
  expect((await handleLocalStorageRequest(upload(stage.putUrl, "replacement"), env)).status).toBe(403);
});

test("local signing and verification reject excessive TTL by the actual key namespace", async () => {
  const { env, bucket } = setup();
  for (const [key, seconds] of [
    ["staging/file", 661],
    ["sealed/file", 301],
    ["sealed/file", 660],
  ]) {
    await expect(signStorageUrl(env, key, "GET", seconds)).rejects.toThrow();
    const capability = signCapability(
      {
        purpose: "download-local-storage-v1",
        method: "GET",
        key,
        expiresAt: Math.floor(Date.now() / 1000) + seconds,
      },
      env.DOWNLOADERS_CONTROL_SECRET,
    );
    const response = await handleLocalStorageRequest(
      new Request(`${LOCAL_STORAGE_ORIGIN}/__download-storage/${key}?capability=${capability}`),
      env,
    );
    expect(response.status).toBe(403);
  }
  expect(bucket.get).not.toHaveBeenCalled();
});

test("local upload rejects oversized declarations, excess bytes and truncated bodies without storing partial objects", async () => {
  const { env, objects, bucket } = setup();
  const [stage] = await createStagingArtifacts(env, token);
  expect((await handleLocalStorageRequest(upload(stage.putUrl, "ok", 250 * 1024 ** 2 + 1), env)).status).toBe(413);
  expect(bucket.put).not.toHaveBeenCalled();
  expect((await handleLocalStorageRequest(upload(stage.putUrl, "too many", 2), env)).status).toBe(413);
  expect((await handleLocalStorageRequest(upload(stage.putUrl, "short", 20), env)).status).toBe(400);
  expect(objects.size).toBe(0);
});

test("promotion publishes a fresh immutable key with safe metadata and supports browser ranges", async () => {
  const { env, bucket, objects } = setup();
  const { stage, artifact } = await stored(env);
  const work = progress();
  const [sealed] = await sealDownloadArtifacts(
    env,
    token,
    [stage],
    [{ ...artifact, name: "../../video\r\n.exe" }],
    work,
  );
  expect(sealed.storageKey).toMatch(/^sealed\//);
  expect(sealed.storageKey).not.toBe(stage.storageKey);
  expect(bucket.get.mock.calls.at(-1)[1].onlyIf.etagMatches).toBe(artifact.etag.slice(1, -1));
  expect(objects.get(sealed.storageKey).httpMetadata.contentDisposition).toMatch(
    /^attachment; filename="[A-Za-z0-9 _-]+\.mp4"$/,
  );
  const url = await signStorageUrl(env, sealed.storageKey, "GET");
  expect(new URL(url).origin).toBe(env.DOWNLOADERS_LOCAL_ORIGIN);
  const response = await handleLocalStorageRequest(new Request(url, { headers: { Range: "bytes=2-6" } }), env);
  expect(response.status).toBe(206);
  expect(response.headers.get("content-range")).toBe("bytes 2-6/13");
  expect(response.headers.get("content-length")).toBe("5");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.text()).toBe("small");
  expect((await handleLocalStorageRequest(new Request(url, { headers: { Range: "bytes=90-99" } }), env)).status).toBe(
    416,
  );
  expect(work.heartbeat.mock.calls.length).toBeGreaterThanOrEqual(2);
});

test("promotion refuses a changed staging version and an expired deadline", async () => {
  const { env, bucket, objects } = setup();
  const { stage, artifact } = await stored(env);
  objects.get(stage.storageKey).etag = "00000000000000000000000000000000";
  await expect(sealDownloadArtifacts(env, token, [stage], [artifact], progress())).rejects.toMatchObject({
    code: "STORAGE_VERIFY_FAILED",
  });
  expect([...objects.keys()].some((key) => key.startsWith("sealed/"))).toBe(false);
  bucket.get.mockClear();
  await expect(
    sealDownloadArtifacts(env, token, [stage], [artifact], { ...progress(), deadline: new Date(0).toISOString() }),
  ).rejects.toMatchObject({ code: "WORK_BUDGET" });
  expect(bucket.get).not.toHaveBeenCalled();
});

test.each([
  ["bytes=8-", 206, "video"],
  ["bytes=-5", 206, "video"],
  ["bytes=0-999", 206, "a small video"],
  ["bytes=-0", 416, ""],
  ["bytes=0-1,4-5", 416, ""],
  ["bytes=9-1", 416, ""],
])("browser download handles range %s", async (range, status, text) => {
  const { env } = setup();
  const { stage } = await stored(env);
  const response = await handleLocalStorageRequest(new Request(stage.getUrl, { headers: { Range: range } }), env);
  expect(response.status).toBe(status);
  expect(await response.text()).toBe(text);
});

test("local readiness is isolated and browser links require a loopback-only configured origin", async () => {
  const { env } = setup();
  const request = new Request(`${LOCAL_STORAGE_ORIGIN}/__download-storage/health`);
  expect(await (await handleLocalStorageRequest(request, env)).json()).toEqual({
    storage: "canopy-local-r2",
    protocolVersion: 1,
  });
  expect(await handleLocalStorageRequest(request, { ...env, DOWNLOADERS_LOCAL: "false" })).toBeNull();
  for (const origin of [
    "http://example.com:8788",
    "http://user:password@localhost:8788",
    "http://localhost:8788/prefix",
  ]) {
    await expect(signStorageUrl({ ...env, DOWNLOADERS_LOCAL_ORIGIN: origin }, "sealed/file", "GET")).rejects.toThrow();
  }
});

test("an aborted upload cancels its source without committing a partial object", async () => {
  const { env, objects } = setup();
  const [stage] = await createStagingArtifacts(env, token);
  const cancelled = vi.fn();
  const stop = new AbortController();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2]));
    },
    cancel: cancelled,
  });
  const response = handleLocalStorageRequest(
    new Request(stage.putUrl, {
      method: "PUT",
      body,
      duplex: "half",
      headers: { "Content-Length": "4" },
      signal: stop.signal,
    }),
    env,
  );
  stop.abort();
  expect((await response).status).toBe(503);
  expect(cancelled).toHaveBeenCalledTimes(1);
  expect(objects.size).toBe(0);
});

test("promotion rejects an overwritten sealed version and never returns its artifact", async () => {
  const { env, bucket } = setup();
  const { stage, artifact } = await stored(env);
  const head = bucket.head.getMockImplementation();
  bucket.head.mockImplementation(async (key) => ({
    ...(await head(key)),
    httpEtag: '"00000000000000000000000000000000"',
  }));
  await expect(sealDownloadArtifacts(env, token, [stage], [artifact], progress())).rejects.toMatchObject({
    code: "STORAGE_VERIFY_FAILED",
  });
});

test("a lost lease during streaming promotion cancels readback and leaves no sealed result", async () => {
  const { env, bucket, objects } = setup();
  const { stage, artifact } = await stored(env);
  const cancel = vi.fn();
  const read = await bucket.get(stage.storageKey);
  vi.useFakeTimers();
  const started = Date.now();
  bucket.get.mockResolvedValue({
    ...read,
    body: new ReadableStream(
      {
        pull(controller) {
          vi.setSystemTime(started + 1001);
          controller.enqueue(new Uint8Array(artifact.bytes));
        },
        cancel,
      },
      { highWaterMark: 0 },
    ),
  });
  let beats = 0;
  const work = {
    deadline: new Date(started + 60_000).toISOString(),
    heartbeat: vi.fn(async () => {
      if (++beats > 1) throw new Error("lease lost");
    }),
  };
  await expect(sealDownloadArtifacts(env, token, [stage], [artifact], work)).rejects.toThrow("lease lost");
  expect(cancel).toHaveBeenCalledTimes(1);
  expect([...objects.keys()].some((key) => key.startsWith("sealed/"))).toBe(false);
});

test("a bucket write failure cancels the pending upload stream", async () => {
  const { env, bucket } = setup();
  const [stage] = await createStagingArtifacts(env, token);
  const cancel = vi.fn();
  bucket.put.mockRejectedValueOnce(new Error("disk unavailable"));
  const body = new ReadableStream({ cancel }, { highWaterMark: 0 });
  const response = await handleLocalStorageRequest(
    new Request(stage.putUrl, { method: "PUT", body, duplex: "half", headers: { "Content-Length": "4" } }),
    env,
  );
  expect(response.status).toBe(503);
  expect(cancel).toHaveBeenCalledTimes(1);
});
