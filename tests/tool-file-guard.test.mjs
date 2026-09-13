import assert from "node:assert/strict";
import test from "node:test";

import {
  assertFileSizes,
  assertRunnableFiles,
  resolveFileLimits,
} from "../lib/tool-framework/fileGuard.ts";
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
  assert.deepEqual(resolveFileLimits(filesInput()), {
    accept: "image/jpeg",
    maxBytes: PLATFORM_MAX_BYTES,
    maxFiles: 50,
    maxTotalBytes: PLATFORM_MAX_BYTES,
  });
  assert.deepEqual(
    resolveFileLimits(
      filesInput({
        maxBytes: PLATFORM_MAX_BYTES * 2,
        maxTotalBytes: PLATFORM_MAX_BYTES * 2,
      }),
    ),
    {
      accept: "image/jpeg",
      maxBytes: PLATFORM_MAX_BYTES,
      maxFiles: 50,
      maxTotalBytes: PLATFORM_MAX_BYTES,
    },
  );
});

test("file size checks accept exact boundaries and reject one byte over", () => {
  const limits = resolveFileLimits(filesInput());
  assert.ok(limits);
  assert.doesNotThrow(() => assertFileSizes(limits, [{ size: PLATFORM_MAX_BYTES }]));
  assert.throws(
    () => assertFileSizes(limits, [{ size: PLATFORM_MAX_BYTES + 1 }]),
    (error) => error?.code === "file-too-large",
  );
  assert.throws(
    () => assertFileSizes(limits, [{ size: PLATFORM_MAX_BYTES - 1 }, { size: 2 }]),
    (error) => error?.code === "total-too-large",
  );
});

test("lower per-tool and aggregate limits remain authoritative", () => {
  const limits = resolveFileLimits(
    filesInput({ maxBytes: 25, maxFiles: 2, maxTotalBytes: 40 }),
  );
  assert.ok(limits);
  assert.doesNotThrow(() => assertFileSizes(limits, [{ size: 20 }, { size: 20 }]));
  assert.throws(
    () => assertFileSizes(limits, [{ size: 21 }, { size: 20 }]),
    (error) => error?.code === "total-too-large",
  );
  assert.throws(
    () => assertFileSizes(limits, [{ size: 26 }]),
    (error) => error?.code === "file-too-large",
  );
});

test("worker file validation reads only a bounded signature prefix", async () => {
  class TrackingFile extends File {
    slices = [];
    slice(start, end, type) {
      this.slices.push([start, end]);
      return super.slice(start, end, type);
    }
  }
  const source = new TrackingFile(
    [Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])],
    "photo.jpg",
    { type: "image/jpeg" },
  );
  const spec = {
    input: filesInput({ maxBytes: 25, maxTotalBytes: 25 }),
  };

  await assertRunnableFiles(spec, [createToolRunFile("photo", source)]);
  assert.equal(source.slices.length, 1);
  assert.equal(source.slices[0][0], 0);
  assert.ok(source.slices[0][1] <= 64 * 1024);
});

test("worker file validation rejects a media file whose bytes have no valid signature", async () => {
  const source = new File(["not an image"], "photo.jpg", { type: "image/jpeg" });
  const spec = {
    input: filesInput({ maxBytes: 25, maxTotalBytes: 25 }),
  };

  await assert.rejects(
    assertRunnableFiles(spec, [createToolRunFile("photo", source)]),
    (error) => error?.code === "invalid-signature",
  );
});

test("PDF tools accept explicitly declared watermark images but reject disguised images", async () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const image = createToolRunFile("logo", new File([png], "logo.png", { type: "image/png" }));
  const document = createToolRunFile("pdf", new File(["%PDF-1.7"], "source.pdf", { type: "application/pdf" }));
  await assertRunnableFiles({ input: filesInput({ engine: "pdf", accept: "application/pdf,image/jpeg,image/png" }) }, [document, image]);
  const disguised = createToolRunFile("fake", new File([png], "fake.pdf", { type: "application/octet-stream" }));
  await assert.rejects(
    assertRunnableFiles({ input: filesInput({ engine: "pdf", accept: "application/pdf,.pdf" }) }, [disguised]),
    (error) => error?.code === "unsupported-type",
  );
});
