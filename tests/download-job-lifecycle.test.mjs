// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useDownloadJob } from "../lib/tool-runtime/useDownloadJob.ts";

const owner = { kind: "account", id: "account-one" };
const storageKey = "canopy:downloads:v1:tiktok:account:account-one";
const source = "https://www.tiktok.com/@artist/video/123123";
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
const reply = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers });
const failure = (status = 503, retryable = true, headers = {}) =>
  reply({ error: { code: "unavailable", message: "Try again later.", retryable } }, status, headers);
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
let root, container, current, fetcher;
function Probe({ platform = "tiktok" }) {
  current = useDownloadJob(platform);
  return React.createElement("output", null, current.job?.state ?? (current.recoverable ? "recovering" : "idle"));
}
async function mount({ saved = true, handler, strict = false } = {}) {
  if (saved) sessionStorage.setItem(storageKey, JSON.stringify({ requestId: "request-one", jobId: "job-one" }));
  fetcher = vi.fn(handler ?? ((url) => Promise.resolve(reply(url.endsWith("/guest") ? { owner } : { job: job() }))));
  vi.stubGlobal("fetch", fetcher);
  await act(async () =>
    root.render(
      strict ? React.createElement(React.StrictMode, null, React.createElement(Probe)) : React.createElement(Probe),
    ),
  );
}
async function advance(ms) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
const jobReads = () => fetcher.mock.calls.filter(([url]) => url === "/api/downloads/jobs/job-one");
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  sessionStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  if (root) await act(() => root.unmount());
  container.remove();
  sessionStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("active polling backs off from 1.5 seconds to a bounded 15 seconds", async () => {
  await mount();
  expect(jobReads()).toHaveLength(1);
  for (const delay of [1500, 2250, 3375, 5063, 7595, 11393, 15000, 15000]) {
    const before = jobReads().length;
    await advance(delay - 1);
    expect(jobReads()).toHaveLength(before);
    await advance(1);
    expect(jobReads()).toHaveLength(before + 1);
  }
});

test("healthy inspections poll twice a second for five seconds, then once a second until ready", async () => {
  let state = job("running", { inspect: true });
  await mount({ handler: async (url) => reply(url.endsWith("/guest") ? { owner } : { job: state }) });
  for (const delay of [...Array(10).fill(500), 1000, 1000]) {
    const before = jobReads().length;
    await advance(delay - 1);
    expect(jobReads()).toHaveLength(before);
    await advance(1);
    expect(jobReads()).toHaveLength(before + 1);
  }
  state = inspected();
  await advance(1000);
  expect(current.job.state).toBe("ready");
  const reads = jobReads().length;
  await advance(60000);
  expect(jobReads()).toHaveLength(reads);
});

test("faster inspection polling never overlaps an outstanding status request", async () => {
  const pending = deferred();
  let reads = 0;
  await mount({
    handler: async (url) => {
      if (url.endsWith("/guest")) return reply({ owner });
      if (++reads === 2) return pending.promise;
      return reply({ job: job("running", { inspect: true }) });
    },
  });
  await advance(500);
  expect(current.operation).toBe("observe");
  await advance(10000);
  expect(jobReads()).toHaveLength(2);
  await act(async () => pending.resolve(reply({ job: job("running", { inspect: true }) })));
  await advance(999);
  expect(jobReads()).toHaveLength(2);
  await advance(1);
  expect(jobReads()).toHaveLength(3);
});

test.each(["download", "inspect"])(
  "%s Retry-After prevents early polling and transient errors stop after a finite retry budget",
  async (intent) => {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({ requestId: "request-one", jobId: "job-one", inspect: intent === "inspect" }),
    );
    await mount({
      saved: false,
      handler: async (url) => (url.endsWith("/guest") ? reply({ owner }) : failure(503, true, { "Retry-After": "30" })),
    });
    expect(current.intent).toBe(intent);
    await advance(29999);
    expect(jobReads()).toHaveLength(1);
    await advance(1);
    expect(jobReads()).toHaveLength(2);
    for (let attempt = 0; attempt < 8; attempt++) await advance(30000);
    expect(jobReads()).toHaveLength(6);
    expect(current.recoverable).toBe(true);
    const count = fetcher.mock.calls.length;
    await advance(300000);
    expect(fetcher).toHaveBeenCalledTimes(count);
    await act(async () => current.controller.resume());
    expect(jobReads()).toHaveLength(7);
  },
);

test("an inspection resumes its one-second cadence after a Retry-After error clears", async () => {
  let reads = 0;
  await mount({
    handler: async (url) => {
      if (url.endsWith("/guest")) return reply({ owner });
      if (++reads === 2) return failure(503, true, { "Retry-After": "30" });
      return reply({ job: job("running", { inspect: true }) });
    },
  });
  await advance(500);
  expect(current.error?.retryAfterSeconds).toBe(30);
  await advance(29999);
  expect(jobReads()).toHaveLength(2);
  await advance(1);
  expect(jobReads()).toHaveLength(3);
  expect(current.error).toBeNull();
  await advance(999);
  expect(jobReads()).toHaveLength(3);
  await advance(1);
  expect(jobReads()).toHaveLength(4);
});

test.each(["download", "inspect"])(
  "a new %s does not inherit the previous job's 15-second polling delay",
  async (intent) => {
    let state = job();
    await mount({
      handler: async (url, init) => {
        if (url.endsWith("/guest")) return reply({ owner });
        if (url === "/api/downloads/jobs") {
          const request = JSON.parse(init.body);
          state = job("queued", { id: "job-two", requestId: request.requestId, inspect: request.inspect === true });
        }
        return reply({ job: state });
      },
    });
    for (const delay of [1500, 2250, 3375, 5063, 7595, 11393]) await advance(delay);
    state = job("succeeded");
    await advance(15000);
    await act(async () => {
      current.controller.reset();
      if (intent === "inspect") await current.controller.inspect(source);
      else await current.controller.start(source, "1080");
    });
    const reads = () => fetcher.mock.calls.filter(([url]) => url === "/api/downloads/jobs/job-two").length;
    const firstDelay = intent === "inspect" ? 500 : 1500;
    await advance(firstDelay - 1);
    expect(reads()).toBe(0);
    await advance(1);
    expect(reads()).toBe(1);
    await advance(intent === "inspect" ? 500 : 2250);
    expect(reads()).toBe(2);
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/downloads/jobs")).toHaveLength(1);
  },
);

test.each(["succeeded", "failed", "cancelled", "expired"])(
  "%s is terminal and stops background polling",
  async (state) => {
    await mount({ handler: async (url) => reply(url.endsWith("/guest") ? { owner } : { job: job(state) }) });
    await advance(120000);
    expect(jobReads()).toHaveLength(1);
    expect(current.job.state).toBe(state);
  },
);

test("Strict Mode remount recovers a saved job without admitting another job", async () => {
  await mount({ strict: true });
  expect(current.job.id).toBe("job-one");
  expect(fetcher.mock.calls.some(([url]) => url === "/api/downloads/jobs")).toBe(false);
  await advance(1500);
  expect(jobReads()).toHaveLength(2);
});

test("double submission and a lost create response recover by the original persisted request ID", async () => {
  const pending = deferred();
  let submitted;
  await mount({
    saved: false,
    handler: async (url, init) => {
      if (url.endsWith("/guest")) return reply({ owner });
      if (url === "/api/downloads/jobs") {
        submitted = JSON.parse(init.body);
        expect(JSON.parse(sessionStorage.getItem(storageKey))).toEqual({ requestId: submitted.requestId });
        await pending.promise;
        throw new TypeError("connection lost after admission");
      }
      expect(url).toBe(`/api/downloads/submissions/${submitted.requestId}`);
      return reply({ job: job("running", { requestId: submitted.requestId }) });
    },
  });
  let first;
  await act(async () => {
    first = current.controller.start(source, "1080");
    void current.controller.start(source, "1080");
  });
  await act(async () => {
    pending.resolve();
    await first;
  });
  expect(current.recoverable).toBe(true);
  await act(async () => current.controller.start(source, "720"));
  await advance(1500);
  expect(current.job.state).toBe("running");
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/downloads/jobs")).toHaveLength(1);
  expect(sessionStorage.getItem(storageKey)).not.toContain(source);
});

test("unmount aborts observation and ignores a late response without cancelling the durable job", async () => {
  const pending = deferred();
  let signal;
  await mount({
    handler: async (url, init) => {
      if (url.endsWith("/guest")) return reply({ owner });
      signal = init.signal;
      return pending.promise;
    },
  });
  const controller = current.controller;
  await act(() => root.unmount());
  root = null;
  expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve(reply({ job: job("succeeded") })));
  expect(controller.getSnapshot().job).toBeNull();
  await advance(120000);
  expect(jobReads()).toHaveLength(1);
  expect(fetcher.mock.calls.some(([url]) => url.endsWith("/cancel"))).toBe(false);
  expect(sessionStorage.getItem(storageKey)).toContain("job-one");
});

test("focus reauthorization clears old private results before waiting for the new owner", async () => {
  const pending = deferred();
  let changed = false;
  await mount({
    handler: async (url) => {
      if (url.endsWith("/guest")) return changed ? pending.promise : reply({ owner });
      return reply({ job: job("succeeded") });
    },
  });
  expect(current.job).not.toBeNull();
  changed = true;
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(current.job).toBeNull();
  await act(async () => pending.resolve(reply({ owner: { kind: "account", id: "account-two" } })));
  expect(current.owner.id).toBe("account-two");
  expect(current.job).toBeNull();
  expect(sessionStorage.getItem(storageKey)).toBeNull();
  expect(jobReads()).toHaveLength(1);
});

test("explicit cancellation remains active until server confirmation and blocks duplicate cancel/start", async () => {
  let state = "queued";
  await mount({
    handler: async (url) => {
      if (url.endsWith("/guest")) return reply({ owner });
      if (url.endsWith("/cancel")) state = "cancelling";
      return reply({ job: job(state) });
    },
  });
  await act(async () => {
    const first = current.controller.cancel();
    await current.controller.cancel();
    await first;
  });
  expect(current.job.state).toBe("cancelling");
  await act(async () => current.controller.start(source, "1080"));
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/cancel"))).toHaveLength(1);
  expect(fetcher.mock.calls.some(([url]) => url === "/api/downloads/jobs")).toBe(false);
  state = "cancelled";
  await advance(2250);
  expect(current.job.state).toBe("cancelled");
});

test.each([
  "",
  "not a link",
  "http://www.tiktok.com/video/123123",
  "https://user:password@www.tiktok.com/video/123123",
])("invalid input %j never submits or becomes recoverable", async (value) => {
  await mount({ saved: false });
  fetcher.mockClear();
  await act(async () => current.controller.start(value, "1080"));
  expect(current.error.code).toBe("invalid-url");
  expect(current.recoverable).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});

test("a late old-platform response cannot replace the newly mounted platform's result", async () => {
  const pending = deferred();
  sessionStorage.setItem(
    "canopy:downloads:v1:youtube:account:account-one",
    JSON.stringify({ requestId: "request-two", jobId: "job-two" }),
  );
  await mount({
    handler: async (url) => {
      if (url.endsWith("/guest")) return reply({ owner });
      if (url.endsWith("/job-one")) return pending.promise;
      return reply({ job: job("succeeded", { platform: "youtube", id: "job-two", requestId: "request-two" }) });
    },
  });
  await act(async () => root.render(React.createElement(Probe, { platform: "youtube" })));
  expect(current.job.id).toBe("job-two");
  await act(async () => pending.resolve(reply({ job: job("succeeded") })));
  expect(current.job.id).toBe("job-two");
  expect(current.job.platform).toBe("youtube");
  expect(JSON.parse(sessionStorage.getItem(storageKey)).jobId).toBe("job-one");
});

test("non-retryable observation errors stop polling but retain a manual recovery path", async () => {
  await mount({ handler: async (url) => (url.endsWith("/guest") ? reply({ owner }) : failure(503, false)) });
  await advance(120000);
  expect(jobReads()).toHaveLength(1);
  expect(current.recoverable).toBe(true);
  expect(current.error.retryable).toBe(false);
  fetcher.mockImplementation(async (url) => reply(url.endsWith("/guest") ? { owner } : { job: job("running") }));
  await act(async () => current.controller.resume());
  expect(current.job.state).toBe("running");
});

test("a confirmed unconfigured rejection does not schedule background recovery", async () => {
  await mount({
    saved: false,
    handler: async (url) =>
      url.endsWith("/guest")
        ? reply({ owner })
        : reply(
            {
              error: { code: "DOWNLOADS_NOT_CONFIGURED", message: "Downloads are unavailable.", retryable: false },
            },
            503,
          ),
  });
  await act(async () => current.controller.start(source, "1080"));
  expect(current.recoverable).toBe(false);
  expect(sessionStorage.getItem(storageKey)).toBeNull();
  const calls = fetcher.mock.calls.length;
  await advance(120000);
  expect(fetcher).toHaveBeenCalledTimes(calls);
});

test("an unconfigured service stops polling an existing request but does not forget it", async () => {
  await mount({
    handler: async (url) =>
      url.endsWith("/guest")
        ? reply({ owner })
        : reply(
            {
              error: { code: "DOWNLOADS_NOT_CONFIGURED", message: "Downloads are unavailable.", retryable: false },
            },
            503,
          ),
  });
  expect(current.recoverable).toBe(true);
  expect(JSON.parse(sessionStorage.getItem(storageKey)).jobId).toBe("job-one");
  await advance(120000);
  expect(jobReads()).toHaveLength(1);
  await act(async () => current.controller.resume());
  expect(jobReads()).toHaveLength(2);
});

test.each([403, 404, 410])(
  "a %i observation failure clears inaccessible private data and recovery references",
  async (status) => {
    await mount();
    fetcher.mockImplementation(async (url) => (url.endsWith("/guest") ? reply({ owner }) : failure(status, false)));
    await advance(1500);
    expect(current.job).toBeNull();
    expect(current.recoverable).toBe(false);
    expect(sessionStorage.getItem(storageKey)).toBeNull();
    const count = fetcher.mock.calls.length;
    await advance(120000);
    expect(fetcher).toHaveBeenCalledTimes(count);
  },
);

test("cancellation rejects a response belonging to another submission instead of replacing recovery identity", async () => {
  await mount({
    handler: async (url) =>
      reply(
        url.endsWith("/guest")
          ? { owner }
          : {
              job: job(
                url.endsWith("/cancel") ? "cancelled" : "queued",
                url.endsWith("/cancel") ? { requestId: "unrelated-request" } : {},
              ),
            },
      ),
  });
  await act(async () => current.controller.cancel());
  expect(current.error?.code).toBe("invalid-response");
  expect(JSON.parse(sessionStorage.getItem(storageKey)).requestId).toBe("request-one");
});

test("cancellation interrupts an in-flight status poll and ignores its late completion", async () => {
  const pending = deferred();
  let reads = 0,
    pollSignal;
  await mount({
    handler: async (url, init) => {
      if (url.endsWith("/guest")) return reply({ owner });
      if (url.endsWith("/cancel")) return reply({ job: job("cancelling") });
      if (++reads > 1) {
        pollSignal = init.signal;
        return pending.promise;
      }
      return reply({ job: job() });
    },
  });
  await advance(1500);
  expect(current.operation).toBe("observe");
  await act(async () => current.controller.cancel());
  expect(pollSignal.aborted).toBe(true);
  expect(current.job.state).toBe("cancelling");
  expect(current.operation).toBeNull();
  await act(async () => pending.resolve(reply({ job: job("succeeded") })));
  expect(current.job.state).toBe("cancelling");
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/cancel"))).toHaveLength(1);
});

const inspected = () =>
  job("ready", {
    expiresAt: "2099-01-01T00:00:00Z",
    selectedFormat: null,
    inspection: {
      title: "Private inspected title",
      durationSeconds: 12,
      formats: [
        {
          id: "format-720",
          container: "mp4",
          width: 1280,
          height: 720,
          fps: 30,
          bytes: null,
          estimatedBytes: false,
          hasAudio: true,
          requiresMerge: false,
          videoCodec: "avc1",
        },
      ],
    },
  });

test("inspection polling stops when choices are ready and restarts after format selection", async () => {
  let state = inspected();
  await mount({
    handler: async (url) => {
      if (url.endsWith("/guest")) return reply({ owner });
      if (url.endsWith("/select"))
        state = { ...inspected(), state: "queued", expiresAt: null, selectedFormat: "format-720" };
      return reply({ job: state });
    },
  });
  await advance(120000);
  expect(jobReads()).toHaveLength(1);
  expect(current.job.inspection.title).toBe("Private inspected title");
  await act(async () => current.controller.selectFormat("format-720"));
  expect(current.job.state).toBe("queued");
  await advance(1499);
  expect(jobReads()).toHaveLength(1);
  await advance(1);
  expect(jobReads()).toHaveLength(2);
  await advance(2249);
  expect(jobReads()).toHaveLength(2);
  await advance(1);
  expect(jobReads()).toHaveLength(3);
  expect(fetcher.mock.calls.some(([url]) => url === "/api/downloads/jobs")).toBe(false);
});

test("selecting a format resets inspection error backoff before download polling", async () => {
  sessionStorage.setItem(storageKey, JSON.stringify({ requestId: "request-one", jobId: "job-one", inspect: true }));
  let reads = 0;
  let state = inspected();
  await mount({
    saved: false,
    handler: async (url) => {
      if (url.endsWith("/guest")) return reply({ owner });
      if (url.endsWith("/select")) {
        state = { ...state, state: "queued", selectedFormat: "format-720" };
      } else if (++reads <= 4) return failure();
      return reply({ job: state });
    },
  });
  for (const delay of [1500, 2250, 3375, 5063]) await advance(delay);
  expect(current.job.state).toBe("ready");
  await act(async () => current.controller.selectFormat("format-720"));
  const before = jobReads().length;
  await advance(1499);
  expect(jobReads()).toHaveLength(before);
  await advance(1);
  expect(jobReads()).toHaveLength(before + 1);
  await advance(2250);
  expect(jobReads()).toHaveLength(before + 2);
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/select"))).toHaveLength(1);
});

test("focus clears inspected metadata before a new owner's authorization completes", async () => {
  const pending = deferred();
  let changed = false;
  await mount({
    handler: async (url) =>
      url.endsWith("/guest") ? (changed ? pending.promise : reply({ owner })) : reply({ job: inspected() }),
  });
  expect(current.job.inspection.title).toBe("Private inspected title");
  changed = true;
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(current.job).toBeNull();
  expect(current.pendingFormatId).toBeNull();
  await act(async () => pending.resolve(reply({ owner: { kind: "account", id: "account-two" } })));
  expect(current.job).toBeNull();
});
