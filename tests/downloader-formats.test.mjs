// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DownloaderFormats } from "../app/downloaders/components/downloader/DownloaderFormats.tsx";

const format = {
  id: "original",
  container: "mp4",
  width: 1080,
  height: 1920,
  fps: 30,
  bytes: null,
  estimatedBytes: false,
  hasAudio: true,
  requiresMerge: false,
  videoCodec: "avc1.640028",
};
let root, container, onSelect;
const radios = () => [...container.querySelectorAll('[role="radio"]')];
const download = () =>
  [...container.querySelectorAll("button")].find((button) => button.textContent === "Download video");
async function mount(formats, pendingFormatId = null, selectedFormat = null) {
  await act(async () =>
    root.render(
      React.createElement(DownloaderFormats, {
        job: { selectedFormat },
        inspection: { title: "Sample video", durationSeconds: 30, formats },
        source: "https://www.instagram.com/reel/Dd4dfPnRkgb/",
        platformName: "Instagram",
        pendingFormatId,
        busy: false,
        onBack() {},
        onSelect,
        onCheck() {},
      }),
    ),
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  onSelect = vi.fn();
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

test.each([
  [{}, {}],
  [{}, { estimatedBytes: true }],
  [{ bytes: 5000000 }, { bytes: 5000001 }],
])(
  "visually identical choices collapse while download retains the exact source format ID (%j, %j)",
  async (first, second) => {
    await mount([
      { ...format, ...first },
      { ...format, ...second, id: "alternate", videoCodec: "vp09.00.40.08" },
    ]);
    expect(radios()).toHaveLength(1);
    await act(async () => radios()[0].click());
    await act(async () => download().click());
    expect(onSelect).toHaveBeenCalledWith("original");
  },
);

test("different resolution, file type, frame rate, size and audio remain separate choices", async () => {
  const changes = [
    { width: 720, height: 1280 },
    { container: "webm" },
    { fps: 60 },
    { bytes: 5000000 },
    { hasAudio: false },
  ];
  await mount([format, ...changes.map((change, index) => ({ ...format, ...change, id: `choice-${index}` }))]);
  expect(radios()).toHaveLength(6);
  await act(async () => radios()[5].click());
  await act(async () => download().click());
  expect(onSelect).toHaveBeenCalledWith("choice-4");
});

test.each(["pending", "selected"])("an existing %s format is preserved when choices look identical", async (state) => {
  await mount(
    [format, { ...format, id: "alternate", videoCodec: "vp09.00.40.08" }],
    state === "pending" ? "alternate" : null,
    state === "selected" ? "alternate" : null,
  );
  expect(radios()).toHaveLength(1);
  expect(radios()[0].getAttribute("aria-checked")).toBe("true");
  await act(async () => download().click());
  expect(onSelect).toHaveBeenCalledWith("alternate");
});
