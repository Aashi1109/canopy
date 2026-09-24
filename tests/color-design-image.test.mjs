import { test, expect, onTestFinished } from "vitest";
import { paletteFromPixels, pixelCoordinates, validateImageFile } from "../tools/image-color-picker/model.ts";
import { run } from "../tools/image-color-picker/run.ts";

test("palette ignores transparent pixels and weights visible colors by alpha", () => {
  const pixels = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 128, 0, 255, 0, 0]);
  const palette = paletteFromPixels(pixels, 6);
  expect(palette.length).toBe(2);
  expect(palette[0].hex).toBe("#FF0000");
  expect(palette[1].hex).toBe("#0000FF");
  expect(palette[0].share > 79 && palette[0].share < 81).toBeTruthy();
});

test("palette is bounded, deterministic and reports fully transparent images", () => {
  const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
  expect(paletteFromPixels(pixels, 2)).toEqual(paletteFromPixels(pixels, 2));
  expect(paletteFromPixels(pixels, 2).length).toBe(2);
  expect(paletteFromPixels(new Uint8ClampedArray([20, 20, 20, 0]), 6)).toEqual([]);
});

test("pixel coordinates map a fitted image and clamp to valid exact pixels", () => {
  expect(pixelCoordinates(100, 50, 200, 100, 400, 200)).toEqual({ x: 200, y: 100 });
  expect(pixelCoordinates(200, 100, 200, 100, 400, 200)).toEqual({ x: 399, y: 199 });
  expect(pixelCoordinates(-1, -1, 200, 100, 400, 200)).toEqual({ x: 0, y: 0 });
});

test("image intake rejects unsupported formats, empty files and oversized files", () => {
  expect(() => validateImageFile({ type: "image/png", size: 1024 })).not.toThrow();
  for (const file of [
    { type: "image/svg+xml", size: 1024 },
    { type: "image/png", size: 21 * 1024 * 1024 },
    { type: "image/jpeg", size: 0 },
  ])
    expect(() => validateImageFile(file)).toThrow();
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
  onTestFinished(() => {
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
  onTestFinished(() => {
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
  expect(result.sections[0].body.entries.find((entry) => entry.label === "HEX").value).toBe("#0A141E80");
  expect(result.text).toMatch(/--sampled-color: #0A141E80;/);
  expect(result.downloadName).toBe("image-palette.css");
  expect(closed).toBe(true);
});
