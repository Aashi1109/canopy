import assert from "node:assert/strict";
import test from "node:test";
import {
  cropBlogImage,
  fitCropRatio,
  resizeCrop,
  validateCropDimensions,
} from "../app/admin/(protected)/blog/lib/imageCrop.ts";

test("aspect presets fit and center within landscape and portrait originals", () => {
  assert.deepEqual(fitCropRatio({ width: 1200, height: 800 }, 1), {
    x: 200,
    y: 0,
    width: 800,
    height: 800,
  });
  assert.deepEqual(fitCropRatio({ width: 600, height: 900 }, 4 / 3), {
    x: 0,
    y: 225,
    width: 600,
    height: 450,
  });
  assert.deepEqual(fitCropRatio({ width: 1200, height: 800 }, null), {
    x: 0,
    y: 0,
    width: 1200,
    height: 800,
  });
});

test("locked crops keep their ratio when resized at edges and can move without resizing", () => {
  const bounds = { width: 1200, height: 800 };
  const previous = { x: 700, y: 300, width: 400, height: 400 };
  assert.deepEqual(resizeCrop({ ...previous, width: 500 }, previous, bounds, 1), {
    ...previous,
    width: 500,
    height: 500,
  });
  assert.deepEqual(resizeCrop({ ...previous, height: 100 }, previous, bounds, 1), {
    ...previous,
    width: 100,
    height: 100,
  });
  assert.deepEqual(resizeCrop({ ...previous, x: 800 }, previous, bounds, 1), {
    ...previous,
    x: 800,
  });
  assert.deepEqual(resizeCrop({ ...previous, height: 100 }, previous, bounds, null), {
    ...previous,
    height: 100,
  });
});

test("invalid and excessive decoded dimensions are rejected", () => {
  for (const bounds of [
    { width: 0, height: 3 },
    { width: NaN, height: 3 },
    { width: 30001, height: 1 },
    { width: 10000, height: 10000 },
  ]) {
    assert.throws(() => validateCropDimensions(bounds), /image|Image/);
  }
  assert.doesNotThrow(() => validateCropDimensions({ width: 8000, height: 5000 }));
});

function canvasFixture(t, result) {
  const calls = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: (...args) => calls.push(args) }),
    toBlob: (callback, type) =>
      callback(result === undefined ? new Blob(["crop"], { type }) : result),
  };
  const previous = globalThis.document;
  globalThis.document = { createElement: () => canvas };
  t.after(() => {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  });
  return { canvas, calls };
}

test("export uses natural pixels and preserves JPEG, PNG, and WebP output formats", async (t) => {
  const { canvas, calls } = canvasFixture(t);
  const source = { naturalWidth: 1200, naturalHeight: 800 };
  for (const [format, type] of [
    ["jpg", "image/jpeg"],
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"],
  ]) {
    const result = await cropBlogImage(source, { x: 100, y: 50, width: 300, height: 200 }, format);
    assert.equal(result.type, type);
    assert.equal(result.size, 4);
    assert.deepEqual(calls.at(-1), [source, 100, 50, 300, 200, 0, 0, 300, 200]);
    assert.equal(canvas.width, 0, "release canvas allocation after export");
  }
});

test("failed, oversized, fallback-format and out-of-bounds crops reject without an uploadable file", async (t) => {
  const source = { naturalWidth: 1200, naturalHeight: 800 };
  const box = { x: 0, y: 0, width: 300, height: 200 };
  const { canvas } = canvasFixture(t, null);
  await assert.rejects(cropBlogImage(source, box, "png"), /crop|Crop/);
  canvas.toBlob = (callback) =>
    callback(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/png" }));
  await assert.rejects(cropBlogImage(source, box, "png"), /5 MiB/);
  canvas.toBlob = (callback) => callback(new Blob(["crop"], { type: "image/png" }));
  await assert.rejects(cropBlogImage(source, box, "webp"), /support/);
  for (const invalid of [
    { ...box, x: -1 },
    { ...box, width: 1201 },
    { ...box, width: NaN },
    { ...box, height: 0 },
  ]) {
    await assert.rejects(cropBlogImage(source, invalid, "png"), /crop|Crop/);
  }
  canvas.toBlob = () => {
    throw new DOMException("Tainted canvas", "SecurityError");
  };
  await assert.rejects(cropBlogImage(source, box, "png"), /crop|Crop/);
  assert.equal(canvas.width, 0);
});
