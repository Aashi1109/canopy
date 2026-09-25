// @vitest-environment jsdom
import { Blob as NodeBlob } from "node:buffer";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { ArtifactDownloadMenu } from "../components/ResultView.tsx";
import { toast } from "../components/ui/index.tsx";

let container;
let root;
let downloads;
let blobs;
let errors;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  downloads = [];
  blobs = [];
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL(blob) {
        blobs.push(blob);
        return `blob:artifact-${blobs.length}`;
      }
      static revokeObjectURL() {}
    },
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
    downloads.push({ name: this.download, href: this.href });
  });
  errors = vi.spyOn(toast, "error").mockImplementation(() => "test-toast");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  if (root) await act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><text>你好 → Café &amp; 👋</text></svg>';
const svgArtifact = () => ({
  storage: "inline",
  name: "diagram.svg",
  mimeType: "image/svg+xml;charset=utf-8",
  content: svg,
});
const pngArtifact = (getContent) => ({
  storage: "deferred",
  name: "diagram.png",
  mimeType: "image/png",
  getContent,
});
const trigger = () => container.querySelector('button[aria-haspopup="menu"]');

function pendingContent() {
  let resolve;
  let reject;
  const promise = new Promise((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return { promise, resolve, reject };
}

async function render(artifacts) {
  await act(() => root.render(React.createElement(ArtifactDownloadMenu, { artifacts })));
}

async function openMenu() {
  expect(trigger()).not.toBeNull();
  await act(() => trigger().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
}

async function select(name) {
  const item = [...document.querySelectorAll('[role="menuitem"]')].find((entry) => entry.textContent === name);
  expect(item).toBeTruthy();
  await act(() => item.click());
}

async function unmount() {
  await act(() => root.unmount());
  root = null;
}

test("opening the format menu and downloading inline SVG never prepares deferred PNG", async () => {
  const getContent = vi.fn(async () => new Blob(["png"], { type: "image/png" }));
  await render([svgArtifact(), pngArtifact(getContent)]);
  expect(getContent).not.toHaveBeenCalled();
  await openMenu();
  expect(getContent).not.toHaveBeenCalled();
  expect(downloads).toEqual([]);
  await select("diagram.svg");

  expect(getContent).not.toHaveBeenCalled();
  expect(downloads).toEqual([{ name: "diagram.svg", href: "blob:artifact-1" }]);
  expect(blobs[0].type).toBe("image/svg+xml;charset=utf-8");
  expect(await blobs[0].text()).toBe(svg);
  expect(document.querySelector('[role="menu"]')).toBeNull();
});

test("PNG is prepared only on selection and downloads exact bytes with its declared name and MIME", async () => {
  const content = pendingContent();
  const getContent = vi.fn(() => content.promise);
  await render([svgArtifact(), pngArtifact(getContent)]);
  await openMenu();
  await select("diagram.png");

  expect(getContent).toHaveBeenCalledTimes(1);
  expect(downloads).toEqual([]);
  expect(trigger().disabled).toBe(true);
  expect(document.querySelector('[role="menu"]')).toBeNull();
  await act(() => trigger().click());
  expect(getContent).toHaveBeenCalledTimes(1);

  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 255]);
  await act(async () => content.resolve(new Blob([bytes], { type: "image/png" })));
  expect(downloads).toEqual([{ name: "diagram.png", href: "blob:artifact-1" }]);
  expect(blobs[0].type).toBe("image/png");
  expect(new Uint8Array(await blobs[0].arrayBuffer())).toEqual(bytes);
  expect(trigger().disabled).toBe(false);
  expect(errors).not.toHaveBeenCalled();
});

test("replacing the result closes the menu and suppresses a pending old download", async () => {
  const content = pendingContent();
  await render([pngArtifact(() => content.promise)]);
  await openMenu();
  await select("diagram.png");
  await render([svgArtifact()]);
  await act(async () => content.resolve(new Blob(["old diagram"])));

  expect(downloads).toEqual([]);
  expect(blobs).toEqual([]);
  expect(errors).not.toHaveBeenCalled();
  await openMenu();
  await render([]);
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(trigger().disabled).toBe(true);
});

test("unmounting the menu prevents a pending conversion from downloading later", async () => {
  const content = pendingContent();
  await render([pngArtifact(() => content.promise)]);
  await openMenu();
  await select("diagram.png");
  await unmount();
  await act(async () => content.resolve(new Blob(["old diagram"])));

  expect(downloads).toEqual([]);
  expect(blobs).toEqual([]);
  expect(errors).not.toHaveBeenCalled();
});

test("failed conversion reports an error and allows the same format to be retried", async () => {
  const getContent = vi
    .fn()
    .mockRejectedValueOnce(new Error("Canvas is unavailable"))
    .mockResolvedValueOnce(new Blob(["converted"], { type: "image/png" }));
  await render([pngArtifact(getContent)]);
  await openMenu();
  await select("diagram.png");

  expect(downloads).toEqual([]);
  expect(errors).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(errors.mock.calls[0])).toMatch(/Canvas is unavailable/);
  expect(trigger().disabled).toBe(false);

  await openMenu();
  await select("diagram.png");
  expect(getContent).toHaveBeenCalledTimes(2);
  expect(downloads).toEqual([{ name: "diagram.png", href: "blob:artifact-1" }]);
  expect(await blobs[0].text()).toBe("converted");
  expect(errors).toHaveBeenCalledTimes(1);
});

test.each(["replaced", "unmounted"])("a %s result does not surface a late conversion error", async (change) => {
  const content = pendingContent();
  await render([pngArtifact(() => content.promise)]);
  await openMenu();
  await select("diagram.png");
  if (change === "unmounted") await unmount();
  else await render([svgArtifact()]);
  await act(async () => content.reject(new Error("Stale conversion failed")));

  expect(downloads).toEqual([]);
  expect(errors).not.toHaveBeenCalled();
});
