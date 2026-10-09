// @vitest-environment jsdom
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import React from "react";
import { createTranslator } from "next-intl";
import { getCommonMessages } from "../lib/i18n/messages.ts";
import { beforeEach, expect, test, vi } from "vitest";
import { MediaOutputGallery } from "../components/MediaOutputGallery.tsx";
import { readArtifact } from "../lib/tool-framework/artifacts.ts";
import { button, click, mountTool, setupReactTools } from "./helpers/react-tools.mjs";

vi.mock("../lib/tool-framework/artifacts.ts", async (importOriginal) => ({
  ...(await importOriginal()),
  readArtifact: vi.fn(),
}));

setupReactTools();

let downloads;
let objectUrls;

beforeEach(() => {
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal("File", NodeFile);
  downloads = [];
  objectUrls = new Map();
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL(blob) {
        const url = `blob:gallery-test-${objectUrls.size + 1}`;
        objectUrls.set(url, blob);
        return url;
      }
      static revokeObjectURL() {}
    },
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
    downloads.push({ name: this.download, blob: objectUrls.get(this.href) });
  });
  vi.mocked(readArtifact).mockReset();
  vi.mocked(readArtifact).mockImplementation(async (file) => new File([file.blob], file.name, { type: file.mime }));
});

function artifact(name, content) {
  const blob = new Blob([content], { type: "image/png" });
  return {
    storage: "blob",
    id: name,
    jobId: "gallery-test",
    name,
    mime: blob.type,
    size: blob.size,
    createdAt: 0,
    blob,
  };
}

async function mountGallery(props, i18n = {}) {
  const view = await mountTool(React.createElement(MediaOutputGallery, props), i18n);
  return {
    ...view,
    async update(next) {
      props = { ...props, ...next };
      await view.rerender(React.createElement(MediaOutputGallery, props));
    },
  };
}

test("each batch image downloads its original bytes and filename", async () => {
  const files = [artifact("first.png", new Uint8Array([137, 80, 78, 71, 0, 255])), artifact("second.png", "second")];
  const gallery = await mountGallery({ files });
  for (const file of files) {
    await click(button(`Download ${file.name}`, gallery.container));
    const download = downloads.find((entry) => entry.name === file.name);
    expect(download).toBeTruthy();
    expect(new Uint8Array(await download.blob.arrayBuffer())).toEqual(new Uint8Array(await file.blob.arrayBuffer()));
    expect(download.blob.type).toBe(file.mime);
  }
  expect(downloads).toHaveLength(2);
});

test("the primary image downloads from its preview while other card downloads remain available", async () => {
  const primary = artifact("primary.png", "primary bytes");
  const extra = artifact("extra.png", "extra bytes");
  const gallery = await mountGallery({ files: [primary, extra], primaryOutputId: primary.id, header: "sr-only" });
  expect(button(`Download ${primary.name}`, gallery.container)).toBeUndefined();
  await click(button(`Download ${extra.name}`, gallery.container));
  await click(button(`Preview ${primary.name}`, gallery.container));
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog).toBeTruthy();
  await click(button(`Download ${primary.name}`, dialog));
  expect(downloads.map((entry) => entry.name)).toEqual([extra.name, primary.name]);
  expect(await downloads[1].blob.text()).toBe("primary bytes");
});

test("processing disables card and open-preview downloads, then restores them", async () => {
  const file = artifact("previous.png", "previous output");
  const gallery = await mountGallery({ files: [file] });
  await click(button(`Preview ${file.name}`, gallery.container));
  await gallery.update({ disabled: true });
  const dialog = document.querySelector('[role="dialog"]');
  const previewDownload = button(`Download ${file.name}`, dialog);
  const cardDownload = button(`Download ${file.name}`, gallery.container);
  expect(previewDownload.disabled).toBe(true);
  expect(cardDownload.disabled).toBe(true);
  await click(previewDownload);
  expect(downloads).toHaveLength(0);

  await gallery.update({ disabled: false });
  expect(button(`Download ${file.name}`, dialog).disabled).toBe(false);
  expect(button(`Download ${file.name}`, gallery.container).disabled).toBe(false);
  await click(button(`Download ${file.name}`, dialog));
  expect(downloads).toHaveLength(1);
  expect(downloads[0].name).toBe(file.name);
  expect(await downloads[0].blob.text()).toBe("previous output");
});

test("localized image previews and downloads preserve exact artifact bytes and names", async () => {
  const file = artifact("unchanged.png", new Uint8Array([137, 80, 78, 71, 0, 255]));
  const gallery = await mountGallery({ files: [file] }, { locale: "hi" });
  expect(gallery.container.textContent).toContain("1 इमेज");
  await click(button("unchanged.png का प्रीव्यू देखें", gallery.container));
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog.textContent).toContain("बनाई गई इमेज");
  const t = createTranslator({ locale: "hi", namespace: "Workbench", messages: getCommonMessages("hi") });
  await click(button(t("mediaFileAction", { action: t("download"), name: file.name }), dialog));
  expect(downloads).toHaveLength(1);
  expect(downloads[0].name).toBe(file.name);
  expect(new Uint8Array(await downloads[0].blob.arrayBuffer())).toEqual(new Uint8Array(await file.blob.arrayBuffer()));
  await click(button(/प्रीव्यू बंद करें/, dialog));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
