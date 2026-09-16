import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { unzipSync } from "fflate";
import { createArtifactWriter, readArtifact } from "../lib/tool-framework/artifacts.ts";

// Isolate browser/WASM codecs only; exercise the real workers, ZIP and storage.
const hooks = registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith("/lib/tool-framework/media/imageCodec.ts")) {
      return {
        format: "module",
        shortCircuit: true,
        source: `
        export async function decodeImage(input) {
          return { image: new Uint8Array(await input.arrayBuffer()) };
        }
        export async function encodeImage(image, format) {
          return new TextEncoder().encode(format + ':' + image.join(',')).buffer;
        }
      `,
      };
    }
    return nextLoad(url, context);
  },
});
const keys = [
  "jpg-to-png",
  "png-to-jpg",
  "jpg-to-webp",
  "png-to-webp",
  "webp-to-jpg",
  "webp-to-png",
  "heic-to-jpg",
  "heic-to-png",
];
const runners = await Promise.all(
  keys.map(async (key) => [key, (await import(`../tools/${key}/run.worker.ts`)).run]),
);
hooks.deregister();

async function bytes(artifact) {
  return new Uint8Array(await (await readArtifact(artifact)).arrayBuffer());
}

for (const [key, run] of runners) {
  const [source, target] = key.split("-to-");
  const format = target === "jpg" ? "jpeg" : target;
  for (const count of [1, 3]) {
    test(`${key}: ${count === 1 ? "single image remains one download" : "batch retains encoded images beside the ZIP without double-counting"}`, async () => {
      const signal = new AbortController().signal;
      const writer = createArtifactWriter(`${key}-${count}`, { signal });
      const inputs = Array.from(
        { length: count },
        (_, index) => new File([new Uint8Array([index + 1, 42])], `photo-${index}.${source}`),
      );
      const result = await run({
        input: { files: inputs },
        settings: { quality: 80, background: "#ffffff" },
        signal,
        progress() {},
        writeArtifact: writer.write,
      });
      assert.equal(result.render, "files");
      assert.equal(result.inputBytes, count * 2);
      assert.equal(result.files.length, count === 1 ? 1 : count + 1);
      assert.equal(result.outputBytes, result.files[0].size);
      const images = count === 1 ? result.files : result.files.slice(1);
      let archive;
      if (count > 1) {
        assert.equal(result.files[0].mime, "application/zip");
        assert.equal(result.files[0].name, "photo-0-converted.zip");
        archive = unzipSync(await bytes(result.files[0]));
        assert.equal(Object.keys(archive).length, count);
        assert.ok(writer.bytesWritten > result.outputBytes);
      }
      for (const [index, image] of images.entries()) {
        assert.equal(image.name, `photo-${index}-converted.${target}`);
        assert.equal(image.mime, `image/${format}`);
        const encoded = await bytes(image);
        assert.deepEqual(encoded, new TextEncoder().encode(`${format}:${index + 1},42`));
        assert.equal(image.size, encoded.byteLength);
        if (archive) assert.deepEqual(archive[image.name], encoded);
      }
    });
  }
  test(`${key}: cancellation does not publish a completed result`, async () => {
    const controller = new AbortController();
    controller.abort();
    let writes = 0;
    await assert.rejects(
      run({
        input: { files: [new File(["input"], `photo.${source}`)] },
        settings: { quality: 80 },
        signal: controller.signal,
        progress() {},
        writeArtifact() {
          writes += 1;
        },
      }),
      { name: "AbortError" },
    );
    assert.equal(writes, 0);
  });
}
