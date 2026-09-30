// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

// Replace only unrelated page chrome; entry, results, actions, controller and hook are real.
vi.mock("../components/canopy/CanopyFooter", () => ({ CanopyFooter: () => null }));
vi.mock("../components/ToolIcon", () => ({ ToolIcon: () => null }));
vi.mock("../components/ui/index.tsx", async () => {
  const { Button } = await import("../components/ui/components/button");
  const typography = await import("../components/ui/components/typography.tsx");
  return {
    ...typography,
    Button,
    AccountNavigation: () => null,
    Badge: ({ children }) => React.createElement("span", null, children),
    Caption: ({ children, ...props }) => React.createElement("p", props, children),
    Toaster: () => null,
    toast: { error: vi.fn(), dismiss: vi.fn() },
    ToolPageShell: ({ children }) => React.createElement("main", null, children),
    WorkbenchShell: ({ children, toolbarActions, status }) =>
      React.createElement("section", null, toolbarActions, children, status),
    ContentState: ({ title, description, action, secondaryAction }) =>
      React.createElement(
        "section",
        null,
        React.createElement("h2", null, title),
        React.createElement("p", null, description),
        action,
        secondaryAction,
      ),
  };
});
import DownloaderWorkspace from "../app/downloaders/components/DownloaderWorkspace.tsx";
import { toast } from "../components/ui/index.tsx";

const accountOwner = { kind: "account", id: "owner-one" };
const storageKey = "canopy:downloads:v1:tiktok:account:owner-one";
const artifact = {
  id: "file-one",
  name: "private-filename.mp4",
  mime: "video/mp4",
  bytes: 20000,
  width: 1280,
  height: 720,
  durationSeconds: 12,
  hasAudio: true,
};
const job = (extra = {}) => ({
  id: "job-one",
  requestId: "request-one",
  platform: "tiktok",
  state: "succeeded",
  phase: null,
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
  expiresAt: "2026-06-01T01:00:00Z",
  error: null,
  artifacts: [artifact],
  ...extra,
});
const props = {
  account: { returnTo: "/media/tiktok-video-downloader", user: { name: "First account" } },
  category: "Media",
  definitionKey: "tiktok-video-downloader",
  description: "Save a public video.",
  icon: null,
  relatedTools: [],
  title: "TikTok video downloader",
  spec: {
    job: { kind: "download", platform: "tiktok", platformName: "TikTok" },
    content: { howToUse: [], limitations: [] },
  },
};
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status });
let root, container, fetcher, anchorClick;
const button = (label) => [...container.querySelectorAll("button")].find((node) => node.textContent.trim() === label);
async function render(overrides = {}) {
  await act(async () => root.render(React.createElement(DownloaderWorkspace, { ...props, ...overrides })));
}
async function enter(value) {
  const input = container.querySelector('input[name="videoUrl"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () =>
    container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
function recover(handler = async (url) => reply(url.endsWith("/guest") ? { owner: accountOwner } : { job: job() })) {
  sessionStorage.setItem(storageKey, JSON.stringify({ requestId: "request-one", jobId: "job-one" }));
  fetcher.mockImplementation(handler);
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })),
  );
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  sessionStorage.clear();
  toast.error.mockClear();
  fetcher = vi.fn(async () => reply({ owner: accountOwner }));
  vi.stubGlobal("fetch", fetcher);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  sessionStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("invalid URL submission gives associated inline feedback, not a toast or network request", async () => {
  await render();
  fetcher.mockClear();
  await enter("not a public link");
  await submit();
  const input = container.querySelector('input[name="videoUrl"]');
  expect(input.getAttribute("aria-invalid")).toBe("true");
  const descriptions = input
    .getAttribute("aria-describedby")
    .split(" ")
    .map((id) => document.getElementById(id));
  expect(descriptions.some((node) => node?.textContent.includes("https://"))).toBe(true);
  expect(fetcher).not.toHaveBeenCalled();
  expect(toast.error).not.toHaveBeenCalled();
  await enter("https://www.tiktok.com/@artist/video/123123");
  expect(input.getAttribute("aria-invalid")).toBe("false");
});

test.each(["submit", "click"])("a wrong-platform link is rejected through %s and focuses the input", async (action) => {
  await render();
  fetcher.mockClear();
  await enter("https://www.youtube.com/watch?v=jNQXAC9IVRw");
  if (action === "submit") await submit();
  else await act(async () => button("Download").click());
  const input = container.querySelector('input[name="videoUrl"]');
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(input);
  expect(container.textContent).toContain("tiktok.com");
  expect(fetcher).not.toHaveBeenCalled();
  expect(sessionStorage.length).toBe(0);
  expect(toast.error).not.toHaveBeenCalled();
});

test("leaving a populated field validates the link and correction keeps feedback accurate", async () => {
  await render();
  fetcher.mockClear();
  const input = container.querySelector('input[name="videoUrl"]');
  await enter("https://www.tiktok.com/@artist");
  await act(async () => {
    input.focus();
    input.blur();
  });
  expect(input.getAttribute("aria-invalid")).toBe("true");
  await enter("https://www.tiktok.com/@artist/video/12");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  await enter("https://www.tiktok.com/@artist/video/123456");
  expect(input.getAttribute("aria-invalid")).toBe("false");
  expect(fetcher).not.toHaveBeenCalled();
  expect(toast.error).not.toHaveBeenCalled();
});

test("leaving an untouched empty field does not show an error, but submitting does", async () => {
  await render();
  fetcher.mockClear();
  const input = container.querySelector('input[name="videoUrl"]');
  await act(async () => {
    input.focus();
    input.blur();
  });
  expect(input.getAttribute("aria-invalid")).toBe("false");
  await submit();
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(input);
  expect(fetcher).not.toHaveBeenCalled();
});

test("clearing the link also clears its validation error and returns focus without submitting", async () => {
  await render();
  await enter("invalid link");
  await submit();
  fetcher.mockClear();
  await act(async () => container.querySelector('button[aria-label="Clear link"]').click());
  const input = container.querySelector('input[name="videoUrl"]');
  expect(input.value).toBe("");
  expect(input.getAttribute("aria-invalid")).toBe("false");
  expect(document.activeElement).toBe(input);
  expect(fetcher).not.toHaveBeenCalled();
});

test("the initial action inspects formats without starting a download", async () => {
  await render();
  await enter("https://www.tiktok.com/@artist/video/123123");
  fetcher.mockClear();
  await submit();
  const request = fetcher.mock.calls.find(([url]) => url === "/api/downloads/jobs");
  expect(request).toBeDefined();
  expect(JSON.parse(request[1].body)).toMatchObject({ quality: "1080", inspect: true });
});

test("server URL validation stays beside the input and preserves the link for correction", async () => {
  fetcher.mockImplementation(async (url) =>
    url.endsWith("/guest")
      ? reply({ owner: accountOwner })
      : reply(
          {
            error: {
              code: "INVALID_URL",
              message: "This platform does not support that link.",
              retryable: false,
            },
          },
          400,
        ),
  );
  await render();
  await enter("https://www.tiktok.com/@artist/video/123456");
  await submit();
  const input = container.querySelector('input[name="videoUrl"]');
  expect(input.value).toBe("https://www.tiktok.com/@artist/video/123456");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(container.textContent).toContain("This platform does not support that link.");
  expect(toast.error).not.toHaveBeenCalled();
});

test("a confirmed unavailable service keeps the submitted link editable and permits a manual retry", async () => {
  fetcher.mockImplementation(async (url) =>
    url.endsWith("/guest")
      ? reply({ owner: accountOwner })
      : reply(
          {
            error: {
              code: "DOWNLOADS_NOT_CONFIGURED",
              message: "The download service is not configured.",
              retryable: false,
            },
          },
          503,
        ),
  );
  await render();
  await enter("https://www.tiktok.com/@artist/video/123123");
  await submit();
  expect(container.querySelector('input[name="videoUrl"]')?.value).toBe("https://www.tiktok.com/@artist/video/123123");
  expect(container.textContent).toContain("Download service unavailable");
  expect(container.textContent).not.toContain("Checking your download request");
  expect(container.textContent).not.toContain("may still be processing");
  expect(toast.error).toHaveBeenLastCalledWith(
    "The download service is not configured.",
    expect.objectContaining({ description: undefined }),
  );
  expect(sessionStorage.getItem(storageKey)).toBeNull();
  await submit();
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/downloads/jobs")).toHaveLength(2);
});

test("an ambiguous inspection failure recovers through Download without another submission", async () => {
  fetcher.mockImplementation(async (url) =>
    url.endsWith("/guest")
      ? reply({ owner: accountOwner })
      : new Response(
          JSON.stringify({
            error: { code: "unavailable", message: "Downloads are temporarily unavailable.", retryable: true },
          }),
          { status: 503, headers: { "Retry-After": "30" } },
        ),
  );
  await render();
  await enter("https://www.tiktok.com/@artist/video/123123");
  await submit();
  expect(container.querySelector("form")).not.toBeNull();
  expect(button("Download").disabled).toBe(false);
  expect(container.querySelector('input[name="videoUrl"]').disabled).toBe(true);
  expect(button("Download").getAttribute("aria-busy")).not.toBe("true");
  expect(button("Check status")).toBeUndefined();
  expect(button("Cancel check")).toBeUndefined();
  const saved = JSON.parse(sessionStorage.getItem(storageKey));
  expect(saved.requestId).toBeTruthy();
  await act(async () => button("Download").click());
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/downloads/jobs")).toHaveLength(1);
  expect(fetcher.mock.calls.some(([url]) => url === `/api/downloads/submissions/${saved.requestId}`)).toBe(true);
  expect(JSON.parse(sessionStorage.getItem(storageKey)).requestId).toBe(saved.requestId);
  expect(toast.error).toHaveBeenLastCalledWith(
    "Downloads are temporarily unavailable.",
    expect.objectContaining({ description: "Try again in 30 seconds." }),
  );
});

test("an unavailable lookup preserves the earlier request and offers status recovery without claiming it is processing", async () => {
  recover(async (url) =>
    url.endsWith("/guest")
      ? reply({ owner: accountOwner })
      : reply(
          {
            error: {
              code: "DOWNLOADS_NOT_CONFIGURED",
              message: "The download service is not configured.",
              retryable: false,
            },
          },
          503,
        ),
  );
  await render();
  expect(container.textContent).toContain("Download service unavailable");
  expect(container.textContent).toContain("could not confirm");
  expect(container.textContent).not.toContain("Checking your download request");
  expect(container.textContent).not.toContain("may still be processing");
  expect(container.querySelector("form")).toBeNull();
  expect(button("Check status").disabled).toBe(false);
  expect(JSON.parse(sessionStorage.getItem(storageKey)).jobId).toBe("job-one");
});

test("artifact download uses the authorized native endpoint and makes no extra fetch or completion claim", async () => {
  recover();
  await render();
  fetcher.mockClear();
  await act(async () => button("Download file").click());
  expect(anchorClick).toHaveBeenCalledTimes(1);
  expect(anchorClick.mock.instances[0].getAttribute("href")).toBe(
    "/api/downloads/jobs/job-one/artifacts/file-one/download",
  );
  expect(fetcher).not.toHaveBeenCalled();
  expect(container.textContent).toContain("does not confirm the file was saved");
});

test("local expiry removes download actions and offers a return to source input", async () => {
  recover(async (url) =>
    reply(url.endsWith("/guest") ? { owner: accountOwner } : { job: job({ expiresAt: "2026-06-01T00:00:02Z" }) }),
  );
  await render();
  expect(button("Download file")).toBeTruthy();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(button("Download file")).toBeUndefined();
  expect(container.textContent).toContain("Download expired");
  await act(async () => button("Paste another link").click());
  expect(container.querySelector('input[name="videoUrl"]')).not.toBeNull();
  expect(anchorClick).not.toHaveBeenCalled();
});

test("signed-out account props clear a previous account's completed private result without requiring focus", async () => {
  recover();
  await render();
  expect(container.textContent).toContain(artifact.name);
  fetcher.mockImplementation(async () => reply({ owner: { kind: "guest", id: "guest-two" } }));
  await render({ account: { ...props.account, user: null } });
  expect(container.textContent).not.toContain(artifact.name);
  expect(button("Download file")).toBeUndefined();
});

test("a changed account clears the previous account's unsent source link", async () => {
  await render();
  await enter("https://www.tiktok.com/@private-interest/video/123123");
  fetcher.mockImplementation(async () => reply({ owner: { kind: "account", id: "owner-two" } }));
  await render({ account: { ...props.account, user: { name: "Second account" } } });
  const input = container.querySelector('input[name="videoUrl"]');
  expect(input?.value ?? "").toBe("");
});

test("initial authorization keeps the form mounted and only the primary button busy", async () => {
  let resolveOwner;
  fetcher.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveOwner = resolve;
      }),
  );
  await render();
  expect(container.querySelector('input[name="videoUrl"]')).not.toBeNull();
  expect(button("Download").getAttribute("aria-busy")).toBe("true");
  expect(button("Check status")).toBeUndefined();
  await act(async () => resolveOwner(reply({ owner: accountOwner })));
  expect(container.querySelector('input[name="videoUrl"]')).not.toBeNull();
});

test("a recovered expired request has explicit recovery instead of a missing-result screen", async () => {
  recover(async (url) =>
    url.endsWith("/guest")
      ? reply({ owner: accountOwner })
      : reply(
          {
            error: {
              code: "ARTIFACT_EXPIRED",
              message: "This download has expired.",
              retryable: false,
            },
          },
          410,
        ),
  );
  await render();
  expect(container.textContent).toContain("Download expired");
  expect(button("Download file")).toBeUndefined();
  await act(async () => button("Paste another link").click());
  expect(container.querySelector('input[name="videoUrl"]')).not.toBeNull();
  expect(container.textContent).not.toContain("Download expired");
});

test("a completed response without files never announces a ready download", async () => {
  recover(async (url) => reply(url.endsWith("/guest") ? { owner: accountOwner } : { job: job({ artifacts: [] }) }));
  await render();
  expect(container.textContent).toContain("No download files are available");
  expect(container.textContent).not.toContain("Your download is ready");
  expect(button("Download file")).toBeUndefined();
  expect(button("Check status")).toBeTruthy();
  await act(async () => button("Paste another link").click());
  expect(container.querySelector('input[name="videoUrl"]')).not.toBeNull();
});

test("clicking after expiry catches a delayed browser timer and offers recovery", async () => {
  recover(async (url) =>
    reply(url.endsWith("/guest") ? { owner: accountOwner } : { job: job({ expiresAt: "2026-06-01T00:00:02Z" }) }),
  );
  await render();
  vi.setSystemTime(new Date("2026-06-01T00:00:03Z"));
  await act(async () => button("Download file").click());
  expect(anchorClick).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Download expired");
  expect(button("Paste another link")).toBeTruthy();
});

test("a slow status observation does not block cancellation of an active download", async () => {
  let reads = 0;
  const activeJob = job({ state: "queued", artifacts: [], expiresAt: null });
  recover(async (url, init) => {
    if (url.endsWith("/guest")) return reply({ owner: accountOwner });
    if (url.endsWith("/cancel")) return reply({ job: { ...activeJob, state: "cancelling" } });
    if (++reads === 1) return reply({ job: activeJob });
    return new Promise((_, reject) =>
      init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }),
    );
  });
  await render();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(button("Cancel download").disabled).toBe(false);
  await act(async () => button("Cancel download").click());
  expect(fetcher.mock.calls.some(([url]) => url.endsWith("/cancel"))).toBe(true);
  expect(container.textContent).toContain("Cancelling download");
});

const ready = () =>
  job({
    state: "ready",
    artifacts: [],
    selectedFormat: null,
    inspection: {
      title: "A real inspected title",
      durationSeconds: 12,
      formats: [
        {
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
        },
        {
          id: "format-1080+audio",
          container: "webm",
          width: 1920,
          height: 1080,
          fps: 60,
          bytes: 45000,
          estimatedBytes: true,
          hasAudio: true,
          requiresMerge: true,
          videoCodec: "vp9",
        },
        {
          id: "format-480",
          container: "mp4",
          width: 854,
          height: 480,
          fps: null,
          bytes: null,
          estimatedBytes: false,
          hasAudio: false,
          requiresMerge: false,
          videoCodec: "avc1",
        },
      ],
    },
  });
const radio = (value) => container.querySelector(`button[role="radio"][value="${value}"]`);

test("inspection shows real formats and requires a choice before same-job download", async () => {
  let inspected = ready();
  fetcher.mockImplementation(async (url, init) => {
    if (url.endsWith("/guest")) return reply({ owner: accountOwner });
    if (url.endsWith("/select"))
      return reply({
        job: job({
          state: "queued",
          requestId: inspected.requestId,
          artifacts: [],
          expiresAt: null,
          selectedFormat: JSON.parse(init.body).formatId,
        }),
      });
    inspected = { ...ready(), requestId: JSON.parse(init.body).requestId };
    return reply({ job: inspected }, 202);
  });
  await render();
  await enter("https://www.tiktok.com/@artist/video/123456");
  await submit();
  expect(container.textContent).toContain("A real inspected title");
  expect(container.textContent).toContain("Estimated");
  expect(container.textContent).toContain("No audio");
  expect(container.querySelectorAll('[role="radio"]')).toHaveLength(3);
  expect(button("Download video").disabled).toBe(true);
  await act(async () => radio("format-1080+audio").click());
  expect(button("Download video").disabled).toBe(false);
  await act(async () => button("Download video").click());
  const selection = fetcher.mock.calls.filter(([url]) => url.endsWith("/select"));
  expect(selection).toHaveLength(1);
  expect(selection[0][0]).toBe("/api/downloads/jobs/job-one/select");
  expect(JSON.parse(selection[0][1].body)).toEqual({ formatId: "format-1080+audio" });
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/downloads/jobs")).toHaveLength(1);
  expect(container.textContent).toContain("Waiting for a processing slot");
});

test("saved inspection restores its actual formats without reinspection and Back returns to input", async () => {
  recover(async (url) => reply(url.endsWith("/guest") ? { owner: accountOwner } : { job: ready() }));
  await render();
  expect(container.textContent).toContain("A real inspected title");
  expect(fetcher.mock.calls.some(([url]) => url === "/api/downloads/jobs")).toBe(false);
  await act(async () => container.querySelector('button[aria-label="Back to video link"]').click());
  expect(button("Download")).toBeTruthy();
  expect(container.querySelector('input[name="videoUrl"]')).not.toBeNull();
  expect(sessionStorage.getItem(storageKey)).toBeNull();
});

test("expired inspection removes format choices and offers another check", async () => {
  recover(async (url) =>
    reply(
      url.endsWith("/guest") ? { owner: accountOwner } : { job: { ...ready(), expiresAt: "2026-06-01T00:00:02Z" } },
    ),
  );
  await render();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(container.textContent).toContain("Available formats expired");
  expect(container.querySelectorAll('[role="radio"]')).toHaveLength(0);
  await act(async () => button("Paste another link").click());
  expect(button("Download")).toBeTruthy();
});

test("ambiguous selection recovers status and permits only the original choice", async () => {
  recover(async (url) => {
    if (url.endsWith("/guest")) return reply({ owner: accountOwner });
    if (url.endsWith("/select")) throw new TypeError("selection response lost");
    return reply({ job: ready() });
  });
  await render();
  await act(async () => radio("format-720").click());
  await act(async () => button("Download video").click());
  expect(button("Check status")).toBeTruthy();
  expect(container.querySelectorAll('[role="radio"]')).toHaveLength(0);
  await act(async () => button("Check status").click());
  expect(radio("format-720").getAttribute("aria-checked")).toBe("true");
  expect(radio("format-1080+audio").disabled).toBe(true);
  expect(container.querySelector('button[aria-label="Back to video link"]').disabled).toBe(true);
  expect(button("Download video").disabled).toBe(false);
  await act(async () => button("Download video").click());
  expect(
    fetcher.mock.calls.filter(([url]) => url.endsWith("/select")).map(([, init]) => JSON.parse(init.body).formatId),
  ).toEqual(["format-720", "format-720"]);
});

test("an account change removes inspected title and formats before revealing another session", async () => {
  recover(async (url) => reply(url.endsWith("/guest") ? { owner: accountOwner } : { job: ready() }));
  await render();
  expect(container.textContent).toContain("A real inspected title");
  fetcher.mockImplementation(async () => reply({ owner: { kind: "guest", id: "guest-two" } }));
  await render({ account: { ...props.account, user: null } });
  expect(container.textContent).not.toContain("A real inspected title");
  expect(container.querySelectorAll('[role="radio"]')).toHaveLength(0);
});

test("expiry during an unconfirmed selection requires status recovery instead of discarding the job", async () => {
  let isExpired = false;
  recover(async (url) => {
    if (url.endsWith("/guest")) return reply({ owner: accountOwner });
    if (url.endsWith("/select")) throw new TypeError("selection response lost");
    return reply({
      job: { ...ready(), expiresAt: "2026-06-01T00:00:02Z", ...(isExpired ? { state: "expired" } : {}) },
    });
  });
  await render();
  await act(async () => radio("format-720").click());
  await act(async () => button("Download video").click());
  await act(async () => button("Check status").click());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(container.textContent).toContain("Check the previous format selection");
  expect(button("Paste another link")).toBeUndefined();
  expect(sessionStorage.getItem(storageKey)).toContain("format-720");
  isExpired = true;
  await act(async () => button("Check status").click());
  await act(async () => button("Paste another link").click());
  expect(button("Download")).toBeTruthy();
});

test("pending format selection replaces choices with download progress until the response arrives", async () => {
  let release;
  recover(async (url) => {
    if (url.endsWith("/guest")) return reply({ owner: accountOwner });
    if (url.endsWith("/select"))
      return new Promise((resolve) => {
        release = resolve;
      });
    return reply({ job: ready() });
  });
  await render();
  await act(async () => radio("format-720").click());
  await act(async () => button("Download video").click());
  expect(container.querySelector('[role="radio"]')).toBeNull();
  expect(container.querySelector('input[name="videoUrl"]')).toBeNull();
  expect(container.querySelector('button[aria-label="Back to video link"]')).toBeNull();
  expect(container.textContent).toContain("Starting your selected download");
  expect(button("Check status").disabled).toBe(true);
  await act(async () =>
    release(reply({ job: { ...ready(), state: "queued", expiresAt: null, selectedFormat: "format-720" } })),
  );
  expect(container.textContent).toContain("Waiting for a processing slot");
});

test("format choices distinguish codecs, use the portrait shorter edge and show readable duration", async () => {
  const inspected = ready();
  inspected.inspection.durationSeconds = 154;
  inspected.inspection.formats = [
    { ...inspected.inspection.formats[0], width: 720, height: 1280, videoCodec: "avc1.64001f" },
    { ...inspected.inspection.formats[0], id: "format-av1", width: 720, height: 1280, videoCodec: "av01.0.08M.08" },
  ];
  recover(async (url) => reply(url.endsWith("/guest") ? { owner: accountOwner } : { job: inspected }));
  await render();
  expect(container.textContent).toContain("Duration: 2 min 34 sec");
  const first = radio("format-720").closest("label");
  const second = radio("format-av1").closest("label");
  expect(first.textContent).toContain("720p · MP4");
  expect(first.textContent).toContain("H.264 (avc1.64001f)");
  expect(second.textContent).toContain("AV1 (av01.0.08M.08)");
  await act(async () => radio("format-av1").click());
  expect(radio("format-av1").getAttribute("aria-checked")).toBe("true");
});

test("format inspection keeps the input mounted through create, queue and running states", async () => {
  let releaseCreate;
  let inspected;
  fetcher.mockImplementation(async (url, init) => {
    if (url.endsWith("/guest")) return reply({ owner: accountOwner });
    if (url === "/api/downloads/jobs") {
      inspected = job({
        requestId: JSON.parse(init.body).requestId,
        inspect: true,
        state: "queued",
        artifacts: [],
        expiresAt: null,
      });
      return new Promise((resolve) => {
        releaseCreate = resolve;
      });
    }
    return reply({ job: inspected });
  });
  await render();
  await enter("https://www.tiktok.com/@artist/video/123456");
  const input = container.querySelector('input[name="videoUrl"]');
  await submit();
  expect(container.querySelector('input[name="videoUrl"]')).toBe(input);
  expect(button("Download").getAttribute("aria-busy")).toBe("true");
  expect(input.disabled).toBe(true);
  expect(button("Check status")).toBeUndefined();
  await act(async () => releaseCreate(reply({ job: inspected }, 202)));
  expect(container.querySelector('input[name="videoUrl"]')).toBe(input);
  expect(button("Download").getAttribute("aria-busy")).toBe("true");
  expect(button("Cancel check")).toBeUndefined();
  expect(button("Check status")).toBeUndefined();
  inspected = { ...inspected, state: "running", phase: "inspecting" };
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(container.querySelector('input[name="videoUrl"]')).toBe(input);
  expect(button("Download").getAttribute("aria-busy")).toBe("true");
  inspected = { ...ready(), requestId: inspected.requestId, inspect: true };
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2250);
  });
  expect(container.querySelectorAll('[role="radio"]')).toHaveLength(3);
  expect(button("Download video").disabled).toBe(true);
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/downloads/jobs")).toHaveLength(1);
});

test("a restored queued inspection keeps the form visible using server intent", async () => {
  recover(async (url) =>
    reply(
      url.endsWith("/guest")
        ? { owner: accountOwner }
        : { job: job({ inspect: true, state: "queued", artifacts: [], expiresAt: null }) },
    ),
  );
  await render();
  expect(container.querySelector('input[name="videoUrl"]')).not.toBeNull();
  expect(button("Download").disabled).toBe(true);
  expect(button("Download").getAttribute("aria-busy")).toBe("true");
  expect(button("Cancel check")).toBeUndefined();
  expect(button("Check status")).toBeUndefined();
});

test("a saved unconfirmed inspection stays in the form and status recovery cannot duplicate it", async () => {
  sessionStorage.setItem(storageKey, JSON.stringify({ requestId: "request-one", inspect: true }));
  fetcher.mockImplementation(async (url) =>
    url.endsWith("/guest")
      ? reply({ owner: accountOwner })
      : reply({ error: { code: "unavailable", message: "Try again.", retryable: false } }, 503),
  );
  await render();
  expect(container.querySelector('input[name="videoUrl"]')).not.toBeNull();
  expect(button("Download").disabled).toBe(false);
  expect(container.querySelector('input[name="videoUrl"]').disabled).toBe(true);
  expect(button("Download").getAttribute("aria-busy")).not.toBe("true");
  expect(button("Check status")).toBeUndefined();
  await act(async () => button("Download").click());
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/downloads/submissions/request-one")).toHaveLength(2);
  expect(fetcher.mock.calls.some(([url]) => url === "/api/downloads/jobs")).toBe(false);
  expect(JSON.parse(sessionStorage.getItem(storageKey)).inspect).toBe(true);
});

test("a restored cancelling inspection remains locked until background confirmation", async () => {
  let state = "cancelling";
  recover(async (url) =>
    reply(
      url.endsWith("/guest")
        ? { owner: accountOwner }
        : { job: job({ inspect: true, state, artifacts: [], expiresAt: null }) },
    ),
  );
  await render();
  expect(container.querySelector('input[name="videoUrl"]')).not.toBeNull();
  expect(button("Download").disabled).toBe(true);
  expect(button("Download").getAttribute("aria-busy")).toBe("true");
  expect(button("Cancel check")).toBeUndefined();
  expect(button("Check status")).toBeUndefined();
  state = "cancelled";
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  await act(async () => button("Paste another link").click());
  expect(button("Download").disabled).toBe(false);
  expect(fetcher.mock.calls.some(([url]) => url.endsWith("/cancel"))).toBe(false);
});

test("selected downloads keep full progress even when the original job was an inspection", async () => {
  recover(async (url) =>
    reply(
      url.endsWith("/guest")
        ? { owner: accountOwner }
        : {
            job: job({
              inspect: true,
              selectedFormat: "format-720",
              state: "running",
              phase: "downloading",
              artifacts: [],
              expiresAt: null,
            }),
          },
    ),
  );
  await render();
  expect(container.querySelector('input[name="videoUrl"]')).toBeNull();
  expect(button("Cancel download")).toBeTruthy();
  expect(container.textContent).toContain("Retrieving the video");
});

test("a failed inspection poll recovers through Download with an empty restored input", async () => {
  let reads = 0;
  recover(async (url) => {
    if (url.endsWith("/guest")) return reply({ owner: accountOwner });
    if (++reads === 2)
      return reply({ error: { code: "unavailable", message: "Status is unavailable.", retryable: false } }, 503);
    return reply({
      job: reads > 2 ? ready() : job({ inspect: true, state: "running", artifacts: [], expiresAt: null }),
    });
  });
  await render();
  const input = container.querySelector('input[name="videoUrl"]');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(container.querySelector('input[name="videoUrl"]')).toBe(input);
  expect(input.value).toBe("");
  expect(input.disabled).toBe(true);
  expect(button("Download").getAttribute("aria-busy")).not.toBe("true");
  expect(button("Download").disabled).toBe(false);
  expect(button("Check status")).toBeUndefined();
  expect(button("Cancel check")).toBeUndefined();
  await act(async () => button("Download").click());
  expect(container.querySelectorAll('[role="radio"]')).toHaveLength(3);
  expect(fetcher.mock.calls.some(([url]) => url === "/api/downloads/jobs")).toBe(false);
});
