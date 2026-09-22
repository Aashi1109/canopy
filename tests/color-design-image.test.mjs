import assert from "node:assert/strict";
import test from "node:test";
import { paletteFromPixels, pixelCoordinates, validateImageFile } from "../tools/image-color-picker/model.ts";
import { run } from "../tools/image-color-picker/run.ts";

test("palette ignores transparent pixels and weights visible colors by alpha", () => {
  const pixels = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 128, 0, 255, 0, 0]);
  const palette = paletteFromPixels(pixels, 6);
  assert.equal(palette.length, 2);
  assert.equal(palette[0].hex, "#FF0000");
  assert.equal(palette[1].hex, "#0000FF");
  assert.ok(palette[0].share > 79 && palette[0].share < 81);
});

test("palette is bounded, deterministic and reports fully transparent images", () => {
  const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
  assert.deepEqual(paletteFromPixels(pixels, 2), paletteFromPixels(pixels, 2));
  assert.equal(paletteFromPixels(pixels, 2).length, 2);
  assert.deepEqual(paletteFromPixels(new Uint8ClampedArray([20, 20, 20, 0]), 6), []);
});

test("pixel coordinates map a fitted image and clamp to valid exact pixels", () => {
  assert.deepEqual(pixelCoordinates(100, 50, 200, 100, 400, 200), { x: 200, y: 100 });
  assert.deepEqual(pixelCoordinates(200, 100, 200, 100, 400, 200), { x: 399, y: 199 });
  assert.deepEqual(pixelCoordinates(-1, -1, 200, 100, 400, 200), { x: 0, y: 0 });
});

test("image intake rejects unsupported formats, empty files and oversized files", () => {
  assert.doesNotThrow(() => validateImageFile({ type: "image/png", size: 1024 }));
  for (const file of [
    { type: "image/svg+xml", size: 1024 },
    { type: "image/png", size: 21 * 1024 * 1024 },
    { type: "image/jpeg", size: 0 },
  ])
    assert.throws(() => validateImageFile(file));
});

test("image sampling returns the exact selected alpha and matching palette artifact", async (t) => {
  let closed = false;
  const selected = new Uint8ClampedArray([10, 20, 30, 128]);
  const originalBitmap = globalThis.createImageBitmap;
  globalThis.createImageBitmap = async () => ({
    width: 2,
    height: 1,
    close: () => {
      closed = true;
    },
  });
  t.after(() => {
    if (originalBitmap === undefined) delete globalThis.createImageBitmap;
    else globalThis.createImageBitmap = originalBitmap;
  });
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage() {}, getImageData: () => ({ data: selected }) }),
  };
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ ...canvas }) };
  t.after(() => {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  });
  const result = await run({
    input: {
      text: "",
      files: [
        {
          id: "image",
          name: "pixel.png",
          mime: "image/png",
          size: 5,
          source: new File(["image"], "pixel.png", { type: "image/png" }),
        },
      ],
    },
    settings: { x: 1, y: 0, colors: 6 },
    signal: new AbortController().signal,
  });
  assert.equal(result.sections[0].body.entries.find((entry) => entry.label === "HEX").value, "#0A141E80");
  assert.match(result.text, /--sampled-color: #0A141E80;/);
  assert.equal(result.downloadName, "image-palette.css");
  assert.equal(closed, true);
});
