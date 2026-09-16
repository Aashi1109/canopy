import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import decodePng from "@jsquash/png/decode.js";
import { init as initPng } from "@jsquash/png/encode.js";
import initOptimizer from "@jsquash/oxipng/codec/pkg/squoosh_oxipng.js";
import { encodeImage } from "../lib/tool-framework/media/imageCodec.ts";

test("PNG conversion preserves RGBA pixels and explicit compression still optimizes", async () => {
  await initPng(
    await readFile(new URL(import.meta.resolve("@jsquash/png/codec/pkg/squoosh_png_bg.wasm"))),
  );
  const rgba = new Uint8ClampedArray([
    255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 12, 34, 56, 64,
  ]);
  const converted = await encodeImage(new ImageData(rgba, 2, 2), "png");
  const decoded = await decodePng(converted);
  assert.equal(decoded.width, 2);
  assert.equal(decoded.height, 2);
  assert.deepEqual(decoded.data, rgba);

  await initOptimizer(
    await readFile(
      new URL(import.meta.resolve("@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm")),
    ),
  );
  const opaque = new ImageData(new Uint8ClampedArray(64 * 64 * 4).fill(255), 64, 64);
  const ordinary = await encodeImage(opaque, "png");
  const compressed = await encodeImage(opaque, "png", 0.8, "#ffffff", 6);
  assert.ok(compressed.byteLength < ordinary.byteLength);
  assert.deepEqual((await decodePng(compressed)).data, opaque.data);
});
