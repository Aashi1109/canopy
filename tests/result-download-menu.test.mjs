// @vitest-environment jsdom
import { Blob as NodeBlob } from "node:buffer";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ResultActions } from "../components/ResultView.tsx";
import { run } from "../tools/palette-generator/run.ts";

let container;
let root;
let downloads;
let blobs;

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
  blobs = [];
  downloads = [];
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

const palette = () =>
  run({ settings: { seed: "#3366ff", harmony: "analogous", count: 3, variation: 0, colors: "", format: "css" } });

async function render(result, downloadMenu = true) {
  await act(() =>
    root.render(React.createElement(ResultActions, { canCopy: true, canDownload: true, downloadMenu, result })),
  );
}

const button = (label) => [...container.querySelectorAll("button")].find((item) => item.textContent === label);

async function openMenu() {
  const trigger = button("Download format");
  expect(trigger).toBeTruthy();
  await act(() => trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
  return trigger;
}

test.each(["palette.css", "palette.json", "palette.svg"])(
  "selecting %s downloads the matching artifact and closes the format menu",
  async (filename) => {
    const result = palette();
    await render(result);
    await openMenu();
    const item = [...document.querySelectorAll('[role="menuitem"]')].find((entry) => entry.textContent === filename);
    expect(item).toBeTruthy();
    await act(() => item.click());
    const artifact = result.artifacts.find((entry) => entry.name === filename);
    expect(downloads).toEqual([{ name: filename, href: "blob:test-1" }]);
    expect(blobs).toHaveLength(1);
    expect(blobs[0].type).toBe(artifact.mimeType);
    expect(await blobs[0].text()).toBe(artifact.content);
    expect(document.querySelector('[role="menu"]')).toBeNull();
  },
);

test("the download menu is disabled without a current result and closes when a result is invalidated", async () => {
  await render(null);
  expect(button("Download format").disabled).toBe(true);
  expect(button("Copy all").disabled).toBe(true);
  await render(palette());
  await openMenu();
  await render(null);
  expect(button("Download format").disabled).toBe(true);
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(downloads).toEqual([]);
});

test("the default toolbar action still downloads its primary output directly", async () => {
  const result = palette();
  await render(result, false);
  await act(() => button("Download .css").click());
  expect(downloads).toEqual([{ name: "palette.css", href: "blob:test-1" }]);
  expect(await blobs[0].text()).toBe(result.code);
  expect(document.querySelector('[role="menu"]')).toBeNull();
});
