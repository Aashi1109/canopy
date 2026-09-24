import { expect, test } from "vitest";

import { assertFileSizes, assertRunnableFiles, resolveFileLimits } from "../lib/tool-framework/fileGuard.ts";
import { PLATFORM_MAX_BYTES } from "../lib/tool-framework/limits.ts";
import { createToolRunFile } from "../lib/tool-framework/workerProtocol.ts";

const filesInput = (overrides = {}) => ({
  kind: "files",
  label: "Files",
  accept: "image/jpeg",
  multiple: true,
  engine: "image",
  ...overrides,
});

test("file limits default to and clamp at the 100 MiB platform ceiling", () => {
  expect(resolveFileLimits(filesInput())).toEqual({
    accept: "image/jpeg",
    maxBytes: PLATFORM_MAX_BYTES,
    maxFiles: 50,
    maxTotalBytes: PLATFORM_MAX_BYTES,
  });
  expect(
    resolveFileLimits(
      filesInput({
        maxBytes: PLATFORM_MAX_BYTES * 2,
        maxTotalBytes: PLATFORM_MAX_BYTES * 2,
      }),
    ),
  ).toEqual({
    accept: "image/jpeg",
    maxBytes: PLATFORM_MAX_BYTES,
    maxFiles: 50,
    maxTotalBytes: PLATFORM_MAX_BYTES,
  });
});

test("file size checks accept exact boundaries and reject one byte over", () => {
  const limits = resolveFileLimits(filesInput());
  expect(limits).toBeTruthy();
  expect(() => assertFileSizes(limits, [{ size: PLATFORM_MAX_BYTES }])).not.toThrow();
  (() => {
    let __err;
    try {
      (() => assertFileSizes(limits, [{ size: PLATFORM_MAX_BYTES + 1 }]))();
    } catch (__e) {
      __err = __e;
    }
    expect(__err).toBeDefined();
    expect(((error) => error?.code === "file-too-large")(__err)).toBe(true);
  })();
  (() => {
    let __err;
    try {
      (() => assertFileSizes(limits, [{ size: PLATFORM_MAX_BYTES - 1 }, { size: 2 }]))();
    } catch (__e) {
      __err = __e;
    }
    expect(__err).toBeDefined();
    expect(((error) => error?.code === "total-too-large")(__err)).toBe(true);
  })();
});

test("lower per-tool and aggregate limits remain authoritative", () => {
  const limits = resolveFileLimits(filesInput({ maxBytes: 25, maxFiles: 2, maxTotalBytes: 40 }));
  expect(limits).toBeTruthy();
  expect(() => assertFileSizes(limits, [{ size: 20 }, { size: 20 }])).not.toThrow();
  (() => {
    let __err;
    try {
      (() => assertFileSizes(limits, [{ size: 21 }, { size: 20 }]))();
    } catch (__e) {
      __err = __e;
    }
    expect(__err).toBeDefined();
    expect(((error) => error?.code === "total-too-large")(__err)).toBe(true);
  })();
  (() => {
    let __err;
    try {
      (() => assertFileSizes(limits, [{ size: 26 }]))();
    } catch (__e) {
      __err = __e;
    }
    expect(__err).toBeDefined();
    expect(((error) => error?.code === "file-too-large")(__err)).toBe(true);
  })();
});

test("worker file validation reads only a bounded signature prefix", async () => {
  class TrackingFile extends File {
    slices = [];
    slice(start, end, type) {
      this.slices.push([start, end]);
      return super.slice(start, end, type);
    }
  }
  const source = new TrackingFile([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])], "photo.jpg", {
    type: "image/jpeg",
  });
  const spec = {
    input: filesInput({ maxBytes: 25, maxTotalBytes: 25 }),
  };

  await assertRunnableFiles(spec, [createToolRunFile("photo", source)]);
  expect(source.slices.length).toBe(1);
  expect(source.slices[0][0]).toBe(0);
  expect(source.slices[0][1] <= 64 * 1024).toBeTruthy();
});

test("worker file validation rejects a media file whose bytes have no valid signature", async () => {
  const source = new File(["not an image"], "photo.jpg", { type: "image/jpeg" });
  const spec = {
    input: filesInput({ maxBytes: 25, maxTotalBytes: 25 }),
  };

  await (async () => {
    let __err;
    try {
      await assertRunnableFiles(spec, [createToolRunFile("photo", source)]);
    } catch (__e) {
      __err = __e;
    }
    expect(__err).toBeDefined();
    expect(((error) => error?.code === "invalid-signature")(__err)).toBe(true);
  })();
});

test("PDF tools accept explicitly declared watermark images but reject disguised images", async () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const image = createToolRunFile("logo", new File([png], "logo.png", { type: "image/png" }));
  const document = createToolRunFile("pdf", new File(["%PDF-1.7"], "source.pdf", { type: "application/pdf" }));
  await assertRunnableFiles({ input: filesInput({ engine: "pdf", accept: "application/pdf,image/jpeg,image/png" }) }, [
    document,
    image,
  ]);
  const disguised = createToolRunFile("fake", new File([png], "fake.pdf", { type: "application/octet-stream" }));
  await (async () => {
    let __err;
    try {
      await assertRunnableFiles({ input: filesInput({ engine: "pdf", accept: "application/pdf,.pdf" }) }, [disguised]);
    } catch (__e) {
      __err = __e;
    }
    expect(__err).toBeDefined();
    expect(((error) => error?.code === "unsupported-type")(__err)).toBe(true);
  })();
});
