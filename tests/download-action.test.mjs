// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DownloadAction } from "../app/downloaders/components/downloader/DownloadAction.tsx";
let root, container, onDownload;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  onDownload = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render(overrides = {}) {
  await act(async () => root.render(React.createElement(DownloadAction, { onDownload, ...overrides })));
}

test("the main action downloads directly without another selection step", async () => {
  await render();
  await act(async () => container.querySelector("button").click());
  expect(onDownload).toHaveBeenCalledTimes(1);
});

test.each([{ disabled: true }, { busy: true }])("an unavailable action cannot download: %j", async (props) => {
  await render(props);
  const button = container.querySelector("button");
  expect(button.disabled).toBe(true);
  await act(async () => button.click());
  expect(onDownload).not.toHaveBeenCalled();
});

test("the action becomes available when processing ends", async () => {
  await render({ busy: true });
  await render({ busy: false });
  await act(async () => container.querySelector("button").click());
  expect(onDownload).toHaveBeenCalledTimes(1);
});
