// @vitest-environment jsdom
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ResultSurface } from "../components/ResultSurface.tsx";

const IMAGE_URL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const spec = {
  capabilities: { copy: true, download: true },
  labels: { empty: "Decode content to see a result.", running: "Decoding…" },
};
let container;
let root;
let downloads;
let blobs;
let writeText;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal("File", NodeFile);
  downloads = [];
  blobs = [];
  writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL(blob) {
        blobs.push(blob);
        return `blob:test-${blobs.length}`;
      }
      static revokeObjectURL() {}
    },
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
    downloads.push({ name: this.download, href: this.href });
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render(result, props = {}) {
  await act(() => root.render(React.createElement(ResultSurface, { result, spec, variant: "card", ...props })));
}

const buttons = () => [...container.querySelectorAll("button")];
const button = (label) => buttons().find((item) => item.textContent === label);

function file(name, content) {
  const blob = new Blob([content], { type: "application/octet-stream" });
  return {
    storage: "blob",
    id: name.replaceAll(".", "-"),
    jobId: "result-test",
    name,
    mime: blob.type,
    size: blob.size,
    createdAt: 0,
    blob,
  };
}

test("an image copies its complete data URL and downloads its original image", async () => {
  await render({ render: "image", src: IMAGE_URL, alt: "Decoded GIF", mime: "image/gif", downloadName: "decoded.gif" });
  const copy = button("Copy image data URL");
  expect(copy?.disabled).toBe(false);
  await act(() => copy.click());
  expect(writeText).toHaveBeenCalledExactlyOnceWith(IMAGE_URL);
  await act(() => button("Download .gif").click());
  expect(downloads).toEqual([{ name: "decoded.gif", href: IMAGE_URL }]);
});

test("a temporary image URL is downloadable without offering a misleading copy action", async () => {
  await render({
    render: "image",
    src: "blob:temporary-image",
    alt: "Image",
    mime: "image/png",
    downloadName: "image.png",
  });
  expect(buttons().filter((item) => item.textContent.startsWith("Copy"))).toHaveLength(0);
  await act(() => button("Download .png").click());
  expect(downloads).toEqual([{ name: "image.png", href: "blob:temporary-image" }]);
  expect(writeText).not.toHaveBeenCalled();
});

test("an unreadable image keeps its download and retries the preview for a replacement image", async () => {
  const result = {
    render: "image",
    src: "data:image/gif;base64,R0lGODlh",
    alt: "Image",
    mime: "image/gif",
    downloadName: "image.gif",
  };
  await render(result);
  await act(() => container.querySelector("img").dispatchEvent(new Event("error")));
  expect(container.textContent).toContain("Image preview unavailable");
  await act(() => button("Download .gif").click());
  expect(downloads).toEqual([{ name: "image.gif", href: result.src }]);
  await render({ ...result, src: IMAGE_URL });
  expect(container.querySelector("img")?.getAttribute("src")).toBe(IMAGE_URL);
  expect(container.textContent).not.toContain("Image preview unavailable");
});

test("a single binary file has one working download and no copy action", async () => {
  const bytes = new Uint8Array([0, 255, 1, 127]);
  await render({ render: "files", files: [file("decoded.bin", bytes)] });
  expect(buttons()).toHaveLength(1);
  await act(() => button("Download file").click());
  expect(downloads).toEqual([{ name: "decoded.bin", href: "blob:test-1" }]);
  expect(new Uint8Array(await blobs[0].arrayBuffer())).toEqual(bytes);
  expect(writeText).not.toHaveBeenCalled();
});

test("multiple files retain a working download for each file", async () => {
  await render({ render: "files", files: [file("first.bin", "first"), file("second.bin", "second")] });
  const actions = buttons().filter((item) => item.textContent === "Download file");
  expect(actions).toHaveLength(2);
  for (const action of actions) await act(() => action.click());
  expect(downloads.map((entry) => entry.name)).toEqual(["first.bin", "second.bin"]);
  expect(await Promise.all(blobs.map((blob) => blob.text()))).toEqual(["first", "second"]);
});

test("retained file results cannot download a stale output", async () => {
  const result = { render: "files", files: [file("previous.bin", "previous")] };
  await render(result);
  await render(null, { retainedResult: result, running: true });
  expect(buttons().every((item) => item.disabled)).toBe(true);
  for (const action of buttons()) await act(() => action.click());
  expect(downloads).toEqual([]);
});
