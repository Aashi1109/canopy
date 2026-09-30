import { expect, test, vi } from "vitest";
import { createDownloadJobController, validateDownloadUrl } from "../lib/tool-runtime/downloadJobClient.ts";

const owner = { kind: "guest", id: "guest-scope" };
const job = (state = "queued", extra = {}) => ({
  id: "job-one",
  requestId: "request-one",
  platform: "tiktok",
  state,
  phase: null,
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
  expiresAt: null,
  error: null,
  artifacts: [],
  ...extra,
});
const reply = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
function setup(handler) {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const fetcher = vi.fn(handler);
  const controller = createDownloadJobController({
    platform: "tiktok",
    fetcher,
    storage,
    requestId: () => "request-one",
  });
  return { controller, fetcher, values, storage };
}

const platformLinks = [
  ["youtube", "https://www.youtube.com/watch?v=jNQXAC9IVRw"],
  ["tiktok", "https://www.tiktok.com/@artist/video/123456789"],
  ["instagram", "https://www.instagram.com/reel/Abc_123/"],
  ["facebook", "https://www.facebook.com/reel/123456789/"],
  ["x", "https://x.com/artist/status/123456789"],
  ["pinterest", "https://www.pinterest.com/pin/123456789/"],
  ["reddit", "https://www.reddit.com/r/videos/comments/abc123/example_video/"],
  ["vimeo", "https://vimeo.com/123456789"],
  ["twitch", "https://clips.twitch.tv/ExampleClip_123"],
  ["dailymotion", "https://www.dailymotion.com/video/x5kesuj"],
  ["linkedin", "https://www.linkedin.com/posts/creator_launch-activity-1234567890123-abcd/"],
  ["snapchat", "https://www.snapchat.com/spotlight/Abc_123"],
];

test.each(platformLinks)("accepts a supported %s video link", (platform, url) => {
  expect(validateDownloadUrl(url, platform)).toBeNull();
});

test.each([
  ["youtube", "https://youtu.be/jNQXAC9IVRw?si=share"],
  ["youtube", "https://www.youtube.com/shorts/jNQXAC9IVRw"],
  ["youtube", "https://www.youtube.com/embed/jNQXAC9IVRw"],
  ["youtube", "https://music.youtube.com/watch?v=jNQXAC9IVRw&t=10"],
  ["tiktok", "https://vm.tiktok.com/Abc123/"],
  ["tiktok", "https://vt.tiktok.com/Abc123/"],
  ["tiktok", "https://www.tiktok.com/t/Abc123/"],
  ["instagram", "https://www.instagram.com/share/reel/Abc123/"],
  ["instagram", "https://www.instagram.com/share/p/Abc123/"],
  ["instagram", "https://www.instagram.com/p/Abc123/?utm_source=share"],
  ["instagram", "https://www.instagram.com/reels/Abc123/"],
  ["instagram", "https://www.instagram.com/tv/Abc123/"],
  ["facebook", "https://fb.watch/Abc123/"],
  ["facebook", "https://www.facebook.com/share/v/Abc123/"],
  ["facebook", "https://www.facebook.com/share/r/Abc123/"],
  ["facebook", "https://www.facebook.com/watch/?v=123456789"],
  ["facebook", "https://www.facebook.com/artist/videos/123456789/"],
  ["x", "https://t.co/Abc123"],
  ["x", "https://twitter.com/i/web/status/123456789"],
  ["pinterest", "https://pin.it/Abc123"],
  ["pinterest", "https://www.pinterest.com/pin/example-video--123456789/"],
  ["reddit", "https://redd.it/abc123"],
  ["reddit", "https://www.reddit.com/r/videos/s/Abc123"],
  ["vimeo", "https://vimeo.com/1"],
  ["vimeo", "https://vimeo.com/123456789/abcDEF123"],
  ["vimeo", "https://player.vimeo.com/video/123456789?h=abcDEF123"],
  ["twitch", "https://www.twitch.tv/artist/clip/ExampleClip_123"],
  ["dailymotion", "https://dai.ly/x5kesuj"],
  ["dailymotion", "https://www.dailymotion.com/video/x5kesuj_example-video"],
  ["linkedin", "https://www.linkedin.com/feed/update/urn%3Ali%3Aactivity%3A1234567890123/"],
  ["snapchat", "https://t.snapchat.com/Abc123"],
])("accepts the supported %s share or alternate link %s", (platform, url) => {
  expect(validateDownloadUrl(url, platform)).toBeNull();
});

const invalidLinks = [
  ["youtube", "https://www.youtube.com/@artist"],
  ["youtube", "https://www.youtube.com/playlist?list=PL123"],
  ["youtube", "https://www.youtube.com/watch?v=too-short"],
  ["youtube", "https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PL123"],
  ["tiktok", "https://www.tiktok.com/@artist"],
  ["tiktok", "https://www.tiktok.com/@artist/photo/123456789"],
  ["tiktok", "https://www.tiktok.com/@artist/video/123"],
  ["tiktok", "https://www.tiktok.com/@artist/video/not-a-number"],
  ["instagram", "https://www.instagram.com/artist/"],
  ["instagram", "https://www.instagram.com/stories/artist/123456/"],
  ["instagram", "https://www.instagram.com/reel/ab/"],
  ["facebook", "https://www.facebook.com/artist"],
  ["facebook", "https://www.facebook.com/artist/posts/123456789"],
  ["facebook", "https://www.facebook.com/watch/?v=123"],
  ["x", "https://x.com/artist"],
  ["x", "https://x.com/artist/status/123"],
  ["pinterest", "https://www.pinterest.com/artist/videos/"],
  ["pinterest", "https://www.pinterest.com/pin/not-a-number/"],
  ["reddit", "https://www.reddit.com/r/videos/"],
  ["reddit", "https://www.reddit.com/r/videos/comments/ab/title/"],
  ["reddit", "https://www.reddit.com/r/videos/comments/abc123/title/comment123/"],
  ["vimeo", "https://vimeo.com/channels/staffpicks"],
  ["vimeo", "https://vimeo.com/not-a-number"],
  ["vimeo", "https://player.vimeo.com/video/123456789?h=ab"],
  ["vimeo", "https://vimeo.com/123456789/abcDEF123?h=different123"],
  ["twitch", "https://www.twitch.tv/artist"],
  ["twitch", "https://www.twitch.tv/videos/123456789"],
  ["twitch", "https://clips.twitch.tv/ab"],
  ["dailymotion", "https://www.dailymotion.com/artist"],
  ["dailymotion", "https://www.dailymotion.com/playlist/x12345"],
  ["dailymotion", "https://www.dailymotion.com/video/123456"],
  ["linkedin", "https://www.linkedin.com/in/artist/"],
  ["linkedin", "https://www.linkedin.com/posts/creator_launch-activity-1234567890123-abc/"],
  ["linkedin", "https://www.linkedin.com/feed/update/urn:li:activity:123/"],
  ["linkedin", "https://lnkd.in/Abc123"],
  ["snapchat", "https://www.snapchat.com/add/artist"],
  ["snapchat", "https://www.snapchat.com/stories/artist/Abc123"],
  ["snapchat", "https://www.snapchat.com/spotlight/ab"],
  ["tiktok", "https://www.youtube.com/watch?v=jNQXAC9IVRw"],
  ["youtube", "https://youtube.com.evil.example/watch?v=jNQXAC9IVRw"],
  ["youtube", "https://notyoutube.com/watch?v=jNQXAC9IVRw"],
  ["youtube", "https://www.yоutube.com/watch?v=jNQXAC9IVRw"],
];

test.each(invalidLinks)("rejects unsupported or mismatched %s link %s", (platform, url) => {
  expect(validateDownloadUrl(url, platform)).toEqual(expect.any(String));
  expect(validateDownloadUrl(url, platform)).not.toBe("");
});

const invalidSyntax = [
  ["empty input", ""],
  ["whitespace only", " \t\n "],
  ["plain text", "a video link"],
  ["missing scheme", "www.youtube.com/watch?v=jNQXAC9IVRw"],
  ["HTTP", "http://www.youtube.com/watch?v=jNQXAC9IVRw"],
  ["credentials", "https://name:password@www.youtube.com/watch?v=jNQXAC9IVRw"],
  ["non-default port", "https://www.youtube.com:8443/watch?v=jNQXAC9IVRw"],
  ["explicit default port", "https://www.youtube.com:443/watch?v=jNQXAC9IVRw"],
  ["fragment", "https://www.youtube.com/watch?v=jNQXAC9IVRw#video"],
  ["embedded whitespace", "https://www.you\ntube.com/watch?v=jNQXAC9IVRw"],
  ["backslash", "https://www.youtube.com\\watch?v=jNQXAC9IVRw"],
  ["encoded separator", "https://www.youtube.com/%2fwatch?v=jNQXAC9IVRw"],
  ["encoded dot segment", "https://www.youtube.com/%2e/watch?v=jNQXAC9IVRw"],
  ["duplicate identifier", "https://www.youtube.com/watch?v=jNQXAC9IVRw&v=jNQXAC9IVRw"],
  ["duplicate tracking parameter", "https://www.youtube.com/watch?v=jNQXAC9IVRw&si=one&si=two"],
  ["oversized link", `https://www.youtube.com/watch?v=jNQXAC9IVRw&si=${"a".repeat(4096)}`],
];

test.each(invalidSyntax)("rejects %s before URL normalization can hide it", (_label, url) => {
  expect(validateDownloadUrl(url, "youtube")).toEqual(expect.any(String));
});

test.each([
  "list",
  "playlist",
  "password",
  "passwd",
  "pass",
  "access_token",
  "auth",
  "authorization",
  "token",
  "session",
  "sessionid",
  "cookie",
  "AcCeSs_ToKeN",
])("rejects the sensitive or collection query parameter %s", (parameter) => {
  expect(validateDownloadUrl(`https://youtu.be/jNQXAC9IVRw?${parameter}=value`, "youtube")).toEqual(expect.any(String));
});

test.each([
  ...invalidLinks,
  ...invalidSyntax.map(([_label, url]) => ["youtube", url]),
  ["youtube", "https://youtu.be/jNQXAC9IVRw?access_token=secret"],
])("rejecting a %s link has no network, recovery storage or request-ID side effects: %s", async (platform, url) => {
  const fetcher = vi.fn();
  const requestId = vi.fn(() => "must-not-be-created");
  const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
  const controller = createDownloadJobController({ platform, fetcher, requestId, storage });
  await controller.start(url, "1080");
  expect(fetcher).not.toHaveBeenCalled();
  expect(requestId).not.toHaveBeenCalled();
  for (const operation of Object.values(storage)) expect(operation).not.toHaveBeenCalled();
  expect(controller.getSnapshot()).toMatchObject({
    busy: false,
    operation: null,
    job: null,
    recoverable: false,
    error: { code: "invalid-url", retryable: false },
  });
});

test.each(platformLinks)("trims a valid %s input before submitting it", async (platform, url) => {
  const fetcher = vi.fn(async (path) =>
    path.endsWith("/guest") ? reply({ owner }) : reply({ job: job("queued", { platform }) }, 202),
  );
  const requestId = vi.fn(() => "request-one");
  const controller = createDownloadJobController({ platform, fetcher, requestId });
  await controller.start(` \t${url}\n `, "1080");
  expect(fetcher.mock.calls.map(([path]) => path)).toEqual(["/api/downloads/guest", "/api/downloads/jobs"]);
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({ platform, url, requestId: "request-one" });
  expect(requestId).toHaveBeenCalledTimes(1);
  expect(controller.getSnapshot().job).toMatchObject({ platform, state: "queued" });
});

test("establishes owner, saves only opaque recovery IDs before submitting and suppresses duplicate activation", async () => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const { controller, values, fetcher } = setup(async (url) => {
    if (url.endsWith("/guest")) return reply({ owner });
    expect([...values.values()][0]).not.toContain("https://");
    expect([...values.values()][0]).toContain("request-one");
    await pending;
    return reply({ job: job() }, 202);
  });
  const first = controller.start("https://www.tiktok.com/@artist/video/123456", "1080");
  await controller.start("https://www.tiktok.com/@artist/video/123456", "1080");
  release();
  await first;
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/downloads/guest", "/api/downloads/jobs"]);
  expect(controller.getSnapshot().job.state).toBe("queued");
  expect([...values.values()][0]).not.toContain("tiktok.com");
});

test("lost creation response is recovered by request ID, never automatically resubmitted", async () => {
  const { controller, fetcher } = setup(async (url) => {
    if (url.endsWith("/guest")) return reply({ owner });
    if (url === "/api/downloads/jobs") throw new TypeError("offline");
    return reply({ job: job("running") });
  });
  await controller.start("https://www.tiktok.com/@artist/video/123456", "720");
  expect(controller.getSnapshot().recoverable).toBe(true);
  await controller.resume();
  expect(controller.getSnapshot().job.state).toBe("running");
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/downloads/jobs")).toHaveLength(1);
  expect(fetcher.mock.calls.some(([url]) => url.endsWith("/submissions/request-one"))).toBe(true);
});

test("explicit cancellation is required; stopping observation ignores a late response without cancelling the server", async () => {
  let release;
  const { controller, fetcher } = setup(async (url) => {
    if (url.endsWith("/guest")) return reply({ owner });
    return new Promise((resolve) => {
      release = () => resolve(reply({ job: job() }));
    });
  });
  const pending = controller.start("https://www.tiktok.com/@artist/video/123456", "1080");
  while (!release) await Promise.resolve();
  controller.stop();
  release();
  await pending;
  expect(controller.getSnapshot().job).toBeNull();
  expect(fetcher.mock.calls.some(([url]) => url.endsWith("/cancel"))).toBe(false);
});

test("owner changes clear private results and do not resume the previous owner's reference", async () => {
  let currentOwner = { kind: "account", id: "first-account" };
  const { controller } = setup(async (url) =>
    url.endsWith("/guest") ? reply({ owner: currentOwner }) : reply({ job: job() }),
  );
  await controller.start("https://www.tiktok.com/@artist/video/123456", "1080");
  currentOwner = { kind: "account", id: "another-account" };
  await controller.resume();
  expect(controller.getSnapshot().job).toBeNull();
  expect(controller.getSnapshot().owner).toEqual(currentOwner);
});

test("safe API failures carry retry delay and cannot turn into fabricated completion", async () => {
  const { controller } = setup(async (url) =>
    url.endsWith("/guest")
      ? reply({ owner })
      : new Response(
          JSON.stringify({
            error: { code: "capacity", message: "All slots are busy. Try again shortly.", retryable: true },
          }),
          { status: 429, headers: { "Retry-After": "30" } },
        ),
  );
  await controller.start("https://www.tiktok.com/@artist/video/123456", "1080");
  expect(controller.getSnapshot().job).toBeNull();
  expect(controller.getSnapshot().error.retryAfterSeconds).toBe(30);
  expect(controller.getSnapshot().recoverable).toBe(false);
});

test("an unconfigured service rejects a fresh submission without retaining it and allows a new request ID", async () => {
  let creates = 0;
  const ids = vi.fn().mockReturnValueOnce("request-one").mockReturnValueOnce("request-two");
  const { storage, values } = setup(() => {});
  const controller = createDownloadJobController({
    platform: "tiktok",
    storage,
    requestId: ids,
    fetcher: async (url, init) => {
      if (url.endsWith("/guest")) return reply({ owner });
      if (++creates === 1)
        return reply(
          { error: { code: "DOWNLOADS_NOT_CONFIGURED", message: "Downloads are unavailable.", retryable: false } },
          503,
        );
      return reply({ job: job("queued", { requestId: JSON.parse(init.body).requestId }) }, 202);
    },
  });
  await controller.start("https://www.tiktok.com/@artist/video/123456", "1080");
  expect(controller.getSnapshot().recoverable).toBe(false);
  expect(controller.getSnapshot().error.retryable).toBe(false);
  expect(controller.getSnapshot().error.retryAfterSeconds).toBeNull();
  expect(values.size).toBe(0);
  await controller.start("https://www.tiktok.com/@artist/video/123456", "1080");
  expect(controller.getSnapshot().job.requestId).toBe("request-two");
});

test.each([true, false])(
  "a generic 503 with retryable=%s still preserves the uncertain submission",
  async (retryable) => {
    const { controller, fetcher, values } = setup(async (url) =>
      url.endsWith("/guest")
        ? reply({ owner })
        : reply({ error: { code: "unavailable", message: "Try again later.", retryable } }, 503),
    );
    await controller.start("https://www.tiktok.com/@artist/video/123456", "1080");
    expect(controller.getSnapshot().recoverable).toBe(true);
    expect(JSON.parse(values.get("canopy:downloads:v1:tiktok:guest:guest-scope"))).toEqual({
      requestId: "request-one",
    });
    await controller.start("https://www.tiktok.com/@artist/video/123456", "1080");
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/downloads/jobs")).toHaveLength(1);
  },
);

test("an unconfigured status lookup retains the earlier submission reference for later recovery", async () => {
  const { controller, values } = setup(async (url) =>
    url.endsWith("/guest")
      ? reply({ owner })
      : reply(
          { error: { code: "DOWNLOADS_NOT_CONFIGURED", message: "Downloads are unavailable.", retryable: false } },
          503,
        ),
  );
  const saved = { requestId: "request-one" };
  values.set("canopy:downloads:v1:tiktok:guest:guest-scope", JSON.stringify(saved));
  await controller.resume();
  expect(controller.getSnapshot().recoverable).toBe(true);
  expect(JSON.parse(values.get("canopy:downloads:v1:tiktok:guest:guest-scope"))).toEqual(saved);
});

test("rejects unexpected response shapes instead of exposing unsafe facts", async () => {
  const { controller } = setup(async (url) =>
    url.endsWith("/guest")
      ? reply({ owner })
      : reply({ job: job("succeeded", { artifacts: [{ id: "bad", name: "bad" }] }) }),
  );
  await controller.start("https://www.tiktok.com/@artist/video/123456", "1080");
  expect(controller.getSnapshot().job).toBeNull();
  expect(controller.getSnapshot().error.code).toBe("invalid-response");
});

test("an owner change during submission verification does not send the previous owner's source link", async () => {
  let currentOwner = owner;
  const { controller, fetcher } = setup(async () => reply({ owner: currentOwner }));
  await controller.resume();
  currentOwner = { kind: "account", id: "second-owner" };
  await controller.start("https://www.tiktok.com/@private_interest/video/123456", "1080");
  expect(controller.getSnapshot().error.code).toBe("session-changed");
  expect(fetcher.mock.calls.some(([url]) => url === "/api/downloads/jobs")).toBe(false);
});

test("a guest reference survives sign-in and remount but its result requires a fresh authorized lookup", async () => {
  let currentOwner = owner;
  let release;
  const { controller, storage, fetcher, values } = setup(async (url) => {
    if (url.endsWith("/guest")) return reply({ owner: currentOwner });
    if (currentOwner.kind === "account")
      return new Promise((resolve) => {
        release = resolve;
      });
    return reply({ job: job() });
  });
  await controller.start("https://www.tiktok.com/@artist/video/123456", "1080");
  controller.stop();
  currentOwner = { kind: "account", id: "signed-in-account" };
  const remounted = createDownloadJobController({ platform: "tiktok", fetcher, storage });
  const pending = remounted.resume();
  for (let i = 0; i < 20 && !release; i++) await Promise.resolve();
  expect(release).toBeTypeOf("function");
  expect(remounted.getSnapshot().job).toBeNull();
  release(reply({ job: job("running") }));
  await pending;
  expect(remounted.getSnapshot().job.state).toBe("running");
  expect(fetcher.mock.calls.at(-1)[0]).toBe("/api/downloads/jobs/job-one");
  expect(values.has("canopy:downloads:v1:tiktok:account:signed-in-account")).toBe(false);
});

test("an uncertain submission not found yet retains its original ID for a same-owner manual retry, even after reset", async () => {
  let creates = 0;
  const ids = vi.fn().mockReturnValueOnce("request-one").mockReturnValue("must-not-be-used");
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const fetcher = vi.fn(async (url, init) => {
    if (url.endsWith("/guest")) return reply({ owner });
    if (url.includes("/submissions/"))
      return reply({ error: { code: "not_found", message: "Not found.", retryable: false } }, 404);
    creates++;
    if (creates === 1) throw new TypeError("unknown create result");
    return reply({ job: job("queued", { requestId: JSON.parse(init.body).requestId }) }, 202);
  });
  const controller = createDownloadJobController({ platform: "tiktok", fetcher, storage, requestId: ids });
  await controller.start("https://www.tiktok.com/@artist/video/123456", "1080");
  await controller.resume();
  expect(controller.getSnapshot().recoverable).toBe(false);
  expect(JSON.parse(values.get("canopy:downloads:v1:tiktok:guest:guest-scope"))).toEqual({ requestId: "request-one" });
  controller.reset();
  await controller.start("https://www.tiktok.com/@artist/video/123456", "1080");
  expect(ids).toHaveBeenCalledTimes(1);
  expect(
    fetcher.mock.calls
      .filter(([url]) => url === "/api/downloads/jobs")
      .map(([, init]) => JSON.parse(init.body).requestId),
  ).toEqual(["request-one", "request-one"]);
});

test("a pending guest submission after sign-in stays lookup-only when not found", async () => {
  let currentOwner = owner;
  const { controller, fetcher } = setup(async (url) => {
    if (url.endsWith("/guest")) return reply({ owner: currentOwner });
    if (url === "/api/downloads/jobs") throw new TypeError("unknown create result");
    return reply({ error: { code: "not_found", message: "Not found.", retryable: false } }, 404);
  });
  await controller.start("https://www.tiktok.com/@artist/video/123456", "1080");
  currentOwner = { kind: "account", id: "signed-in-account" };
  await controller.resume();
  expect(controller.getSnapshot().recoverable).toBe(true);
  expect(controller.getSnapshot().error.message).toMatch(/original guest session/i);
  await controller.start("https://www.tiktok.com/@artist/video/123456", "1080");
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/downloads/jobs")).toHaveLength(1);
});

test("a definite admission rejection discards its request ID so a fresh submission can use another", async () => {
  const ids = vi.fn().mockReturnValueOnce("request-one").mockReturnValueOnce("request-two");
  let creates = 0;
  const controller = createDownloadJobController({
    platform: "tiktok",
    requestId: ids,
    fetcher: async (url, init) => {
      if (url.endsWith("/guest")) return reply({ owner });
      if (++creates === 1) return reply({ error: { code: "capacity", message: "Try later.", retryable: true } }, 429);
      return reply({ job: job("queued", { requestId: JSON.parse(init.body).requestId }) });
    },
  });
  await controller.start("https://www.tiktok.com/@artist/video/123456", "1080");
  await controller.start("https://www.tiktok.com/@artist/video/123456", "1080");
  expect(controller.getSnapshot().job.requestId).toBe("request-two");
});

test.each([400, 403, 429, 503])(
  "a %i rejection of a retry cannot discard an earlier uncertain submission identity",
  async (status) => {
    let creates = 0;
    const { controller, values } = setup(async (url) => {
      if (url.endsWith("/guest")) return reply({ owner });
      if (url.includes("/submissions/"))
        return reply({ error: { code: "not_found", message: "Not found.", retryable: false } }, 404);
      if (++creates === 1) throw new TypeError("unknown create result");
      return reply(
        {
          error: {
            code: status === 503 ? "DOWNLOADS_NOT_CONFIGURED" : "rejected",
            message: "Try again later.",
            retryable: false,
          },
        },
        status,
      );
    });
    await controller.start("https://www.tiktok.com/@artist/video/123456", "1080");
    await controller.resume();
    await controller.start("https://www.tiktok.com/@artist/video/123456", "1080");
    expect(controller.getSnapshot().recoverable).toBe(true);
    expect(JSON.parse(values.get("canopy:downloads:v1:tiktok:guest:guest-scope"))).toEqual({
      requestId: "request-one",
    });
  },
);

test("a guest lookup after sign-in clears the reference when the server no longer authorizes it", async () => {
  let currentOwner = owner;
  const { controller, values } = setup(async (url) => {
    if (url.endsWith("/guest")) return reply({ owner: currentOwner });
    if (currentOwner.kind === "account")
      return reply({ error: { code: "forbidden", message: "Access denied.", retryable: false } }, 403);
    return reply({ job: job() });
  });
  await controller.start("https://www.tiktok.com/@artist/video/123456", "1080");
  currentOwner = { kind: "account", id: "signed-in-account" };
  await controller.resume();
  expect(controller.getSnapshot().job).toBeNull();
  expect(controller.getSnapshot().recoverable).toBe(false);
  expect(values.size).toBe(0);
});

test("a changed-input conflict after an uncertain submission recovers the original job without a new ID", async () => {
  let creates = 0,
    lookups = 0;
  const { controller, values } = setup(async (url) => {
    if (url.endsWith("/guest")) return reply({ owner });
    if (url.includes("/submissions/")) {
      if (++lookups === 1) return reply({ error: { code: "not_found", message: "Not found.", retryable: false } }, 404);
      return reply({ job: job("running") });
    }
    if (++creates === 1) throw new TypeError("unknown create result");
    return reply(
      {
        error: { code: "request_conflict", message: "The original request is already in progress.", retryable: false },
      },
      409,
    );
  });
  await controller.start("https://www.tiktok.com/@artist/video/123456", "1080");
  await controller.resume();
  await controller.start("https://www.tiktok.com/@artist/video/456789", "720");
  expect(controller.getSnapshot().recoverable).toBe(true);
  expect(JSON.parse(values.get("canopy:downloads:v1:tiktok:guest:guest-scope")).requestId).toBe("request-one");
  await controller.resume();
  expect(controller.getSnapshot().job.state).toBe("running");
});

const format = (extra = {}) => ({
  id: "format-720",
  container: "mp4",
  width: 1280,
  height: 720,
  fps: 30,
  bytes: 20000,
  estimatedBytes: false,
  hasAudio: true,
  requiresMerge: false,
  videoCodec: "avc1",
  ...extra,
});
const inspectedJob = (extra = {}) =>
  job("ready", {
    expiresAt: "2099-06-01T01:00:00Z",
    inspection: {
      title: "An inspected video",
      durationSeconds: 12,
      formats: [format(), format({ id: "format-1080+audio", height: 1080, requiresMerge: true })],
    },
    selectedFormat: null,
    ...extra,
  });

test("inspection submits the source once with inspect enabled and preserves legacy request shape", async () => {
  const { controller, fetcher, values } = setup(async (url) =>
    url.endsWith("/guest") ? reply({ owner }) : reply({ job: inspectedJob() }, 202),
  );
  await controller.inspect(" https://www.tiktok.com/@artist/video/123456 ");
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
    platform: "tiktok",
    url: "https://www.tiktok.com/@artist/video/123456",
    quality: "1080",
    requestId: "request-one",
    inspect: true,
  });
  expect(controller.getSnapshot().job.inspection.formats).toHaveLength(2);
  expect(controller.getSnapshot().job.state).toBe("ready");
  expect([...values.values()].join()).not.toContain("An inspected video");
});

test("invalid inspection input does not establish an owner or allocate recovery IDs", async () => {
  const { controller, fetcher, values } = setup(() => {});
  await controller.inspect("https://www.tiktok.com/@artist");
  expect(fetcher).not.toHaveBeenCalled();
  expect(values.size).toBe(0);
  expect(controller.getSnapshot().error.code).toBe("invalid-url");
});

test("selecting an inspected format uses the same job and suppresses concurrent selections", async () => {
  let release;
  const { controller, fetcher, values } = setup(async (url, init) => {
    if (url.endsWith("/guest")) return reply({ owner });
    if (url.endsWith("/select")) {
      expect(JSON.parse(init.body)).toEqual({ formatId: "format-1080+audio" });
      return new Promise((resolve) => {
        release = () => resolve(reply({ job: inspectedJob({ state: "queued", selectedFormat: "format-1080+audio" }) }));
      });
    }
    return reply({ job: inspectedJob() });
  });
  await controller.inspect("https://www.tiktok.com/@artist/video/123456");
  const pending = controller.selectFormat("format-1080+audio");
  await controller.selectFormat("format-720");
  for (let i = 0; i < 20 && !release; i++) await Promise.resolve();
  expect(controller.getSnapshot().operation).toBe("select");
  release();
  await pending;
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/select"))).toHaveLength(1);
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/downloads/jobs")).toHaveLength(1);
  expect(controller.getSnapshot().job).toMatchObject({
    id: "job-one",
    requestId: "request-one",
    state: "queued",
    selectedFormat: "format-1080+audio",
  });
  expect(JSON.parse(values.get("canopy:downloads:v1:tiktok:guest:guest-scope"))).toEqual({
    requestId: "request-one",
    jobId: "job-one",
  });
});

test("an unknown or expired format is rejected before any selection request", async () => {
  const { controller, fetcher } = setup(async (url) =>
    url.endsWith("/guest") ? reply({ owner }) : reply({ job: inspectedJob() }),
  );
  await controller.inspect("https://www.tiktok.com/@artist/video/123456");
  fetcher.mockClear();
  await controller.selectFormat("untrusted-format");
  expect(fetcher).not.toHaveBeenCalled();
  expect(controller.getSnapshot().error.code).toBe("invalid-format");
  controller.reset();
  fetcher.mockImplementation(async (url) =>
    url.endsWith("/guest") ? reply({ owner }) : reply({ job: inspectedJob({ expiresAt: "2000-01-01T00:00:00Z" }) }),
  );
  await controller.inspect("https://www.tiktok.com/@artist/video/123456");
  fetcher.mockClear();
  await controller.selectFormat("format-720");
  expect(fetcher).not.toHaveBeenCalled();
  expect(controller.getSnapshot().error.status).toBe(410);
});

test("a lost selection survives reload and retries only the same format without another create", async () => {
  const { controller, fetcher, storage, values } = setup(async (url) => {
    if (url.endsWith("/guest")) return reply({ owner });
    if (url.endsWith("/select")) throw new TypeError("response lost");
    return reply({ job: inspectedJob() });
  });
  await controller.inspect("https://www.tiktok.com/@artist/video/123456");
  await controller.selectFormat("format-720");
  expect(controller.getSnapshot()).toMatchObject({ recoverable: true, pendingFormatId: "format-720" });
  expect(controller.getSnapshot().job.id).toBe("job-one");
  controller.stop();
  const recovered = createDownloadJobController({
    platform: "tiktok",
    fetcher,
    storage,
    requestId: () => {
      throw Error("must reuse job");
    },
  });
  await recovered.resume();
  expect(recovered.getSnapshot()).toMatchObject({
    recoverable: false,
    pendingFormatId: "format-720",
    job: { state: "ready" },
  });
  await recovered.selectFormat("format-1080+audio");
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/select"))).toHaveLength(1);
  await recovered.selectFormat("format-720");
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/select"))).toHaveLength(2);
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/downloads/jobs")).toHaveLength(1);
  expect([...values.values()].join()).not.toContain("An inspected video");
});

test("selection reauthorizes and never submits the previous owner's private format choice", async () => {
  let currentOwner = owner;
  const { controller, fetcher } = setup(async (url) =>
    url.endsWith("/guest") ? reply({ owner: currentOwner }) : reply({ job: inspectedJob() }),
  );
  await controller.inspect("https://www.tiktok.com/@artist/video/123456");
  currentOwner = { kind: "account", id: "different-owner" };
  await controller.selectFormat("format-720");
  expect(controller.getSnapshot().job).toBeNull();
  expect(fetcher.mock.calls.some(([url]) => url.endsWith("/select"))).toBe(false);
});

test("selection rejects another job's response without replacing the saved identity", async () => {
  const { controller, values } = setup(async (url) =>
    url.endsWith("/guest")
      ? reply({ owner })
      : reply({ job: inspectedJob(url.endsWith("/select") ? { id: "other-job" } : {}) }),
  );
  await controller.inspect("https://www.tiktok.com/@artist/video/123456");
  await controller.selectFormat("format-720");
  expect(controller.getSnapshot().error.code).toBe("invalid-response");
  expect(controller.getSnapshot().recoverable).toBe(true);
  expect(JSON.parse(values.get("canopy:downloads:v1:tiktok:guest:guest-scope")).jobId).toBe("job-one");
});

test.each([
  undefined,
  { title: "Video", durationSeconds: 12, formats: [] },
  { title: "Video", durationSeconds: 12, formats: [format(), format()] },
  { title: "Video", durationSeconds: 12, formats: [format({ bytes: -1 })] },
])("malformed inspection data never becomes a ready format choice", async (inspection) => {
  const { controller } = setup(async (url) =>
    url.endsWith("/guest") ? reply({ owner }) : reply({ job: inspectedJob({ inspection }) }),
  );
  await controller.inspect("https://www.tiktok.com/@artist/video/123456");
  expect(controller.getSnapshot().job).toBeNull();
  expect(controller.getSnapshot().error.code).toBe("invalid-response");
});

test("a lost inspection response recovers ready formats using its original submission ID", async () => {
  const { controller, fetcher } = setup(async (url) => {
    if (url.endsWith("/guest")) return reply({ owner });
    if (url === "/api/downloads/jobs") throw new TypeError("inspection response lost");
    return reply({ job: inspectedJob() });
  });
  await controller.inspect("https://www.tiktok.com/@artist/video/123456");
  expect(controller.getSnapshot().recoverable).toBe(true);
  await controller.resume();
  expect(controller.getSnapshot().job.state).toBe("ready");
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/downloads/jobs")).toHaveLength(1);
  expect(fetcher.mock.calls.at(-1)[0]).toBe("/api/downloads/submissions/request-one");
});

test("a definite fresh selection rejection keeps the inspected job and permits another choice", async () => {
  const { controller, fetcher } = setup(async (url) => {
    if (url.endsWith("/guest")) return reply({ owner });
    if (url.endsWith("/select"))
      return reply({ error: { code: "capacity", message: "Try later.", retryable: true } }, 429);
    return reply({ job: inspectedJob() });
  });
  await controller.inspect("https://www.tiktok.com/@artist/video/123456");
  await controller.selectFormat("format-720");
  expect(controller.getSnapshot()).toMatchObject({
    pendingFormatId: null,
    recoverable: false,
    job: { state: "ready" },
  });
  await controller.selectFormat("format-1080+audio");
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/select"))).toHaveLength(2);
});

test("a rejected retry cannot forget an earlier unconfirmed format selection", async () => {
  let selections = 0;
  const { controller, values } = setup(async (url) => {
    if (url.endsWith("/guest")) return reply({ owner });
    if (url.endsWith("/select")) {
      if (++selections === 1) throw new TypeError("unknown selection result");
      return reply({ error: { code: "capacity", message: "Try later.", retryable: true } }, 429);
    }
    return reply({ job: inspectedJob() });
  });
  await controller.inspect("https://www.tiktok.com/@artist/video/123456");
  await controller.selectFormat("format-720");
  await controller.resume();
  await controller.selectFormat("format-720");
  expect(controller.getSnapshot()).toMatchObject({ pendingFormatId: "format-720", recoverable: true });
  expect(JSON.parse(values.get("canopy:downloads:v1:tiktok:guest:guest-scope")).formatId).toBe("format-720");
  controller.reset();
  expect(controller.getSnapshot().job.id).toBe("job-one");
});

test("an active selected job cannot start another inspection or format selection", async () => {
  const { controller, fetcher } = setup(async (url) =>
    url.endsWith("/guest")
      ? reply({ owner })
      : reply({ job: inspectedJob(url.endsWith("/select") ? { state: "queued", selectedFormat: "format-720" } : {}) }),
  );
  await controller.inspect("https://www.tiktok.com/@artist/video/123456");
  await controller.selectFormat("format-720");
  fetcher.mockClear();
  await controller.inspect("https://www.tiktok.com/@artist/video/456789");
  await controller.selectFormat("format-1080+audio");
  expect(fetcher).not.toHaveBeenCalled();
});

test("inspection intent is saved before create and survives a lost response plus remount", async () => {
  const { controller, fetcher, storage, values } = setup(async (url) => {
    if (url.endsWith("/guest")) return reply({ owner });
    if (url === "/api/downloads/jobs") {
      expect(JSON.parse(values.get("canopy:downloads:v1:tiktok:guest:guest-scope"))).toMatchObject({ inspect: true });
      throw new TypeError("create outcome unknown");
    }
    return reply({ error: { code: "unavailable", message: "Try again.", retryable: false } }, 503);
  });
  await controller.inspect("https://www.tiktok.com/@artist/video/123456");
  expect(controller.getSnapshot()).toMatchObject({ intent: "inspect", recoverable: true });
  const remounted = createDownloadJobController({ platform: "tiktok", fetcher, storage });
  await remounted.resume();
  expect(remounted.getSnapshot()).toMatchObject({ intent: "inspect", recoverable: true });
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/downloads/jobs")).toHaveLength(1);
});

test.each([
  [{ inspect: true, state: "queued", selectedFormat: null }, "inspect"],
  [{ inspect: true, state: "running", phase: "resolving", selectedFormat: null }, "inspect"],
  [{ inspect: true, state: "queued", selectedFormat: "format-720" }, "download"],
  [{ state: "running", phase: "inspecting" }, "download"],
])("authorized job data repairs intent without guessing from its phase", async (extra, intent) => {
  const { controller, values } = setup(async (url) =>
    url.endsWith("/guest") ? reply({ owner }) : reply({ job: job("queued", extra) }),
  );
  values.set(
    "canopy:downloads:v1:tiktok:guest:guest-scope",
    JSON.stringify({ requestId: "request-one", jobId: "job-one" }),
  );
  await controller.resume();
  expect(controller.getSnapshot().intent).toBe(intent);
});

test("selecting immediately switches to download intent before owner verification resolves", async () => {
  let hold = false,
    resolveOwner;
  const { controller } = setup(async (url) => {
    if (url.endsWith("/guest"))
      return hold
        ? new Promise((resolve) => {
            resolveOwner = resolve;
          })
        : reply({ owner });
    return reply({
      job: inspectedJob(url.endsWith("/select") ? { state: "queued", selectedFormat: "format-720" } : {}),
    });
  });
  await controller.inspect("https://www.tiktok.com/@artist/video/123456");
  hold = true;
  const pending = controller.selectFormat("format-720");
  expect(controller.getSnapshot()).toMatchObject({ intent: "download", operation: "select" });
  resolveOwner(reply({ owner }));
  await pending;
  expect(controller.getSnapshot().intent).toBe("download");
});

test("retry after an unconfirmed inspection lookup retains its original intent and request ID", async () => {
  let creates = 0;
  const { controller, fetcher } = setup(async (url, init) => {
    if (url.endsWith("/guest")) return reply({ owner });
    if (url.includes("/submissions/"))
      return reply({ error: { code: "not_found", message: "Not found.", retryable: false } }, 404);
    if (++creates === 1) throw new TypeError("create result unknown");
    return reply({ job: inspectedJob({ requestId: JSON.parse(init.body).requestId, inspect: true }) });
  });
  await controller.inspect("https://www.tiktok.com/@artist/video/123456");
  await controller.resume();
  expect(controller.getSnapshot()).toMatchObject({ recoverable: false, intent: "inspect" });
  await controller.inspect("https://www.tiktok.com/@artist/video/123456");
  const createsSent = fetcher.mock.calls
    .filter(([url]) => url === "/api/downloads/jobs")
    .map(([, init]) => JSON.parse(init.body));
  expect(createsSent.map((body) => ({ requestId: body.requestId, inspect: body.inspect }))).toEqual([
    { requestId: "request-one", inspect: true },
    { requestId: "request-one", inspect: true },
  ]);
  expect(controller.getSnapshot().job.state).toBe("ready");
});
