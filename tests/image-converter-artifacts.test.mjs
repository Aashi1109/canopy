import { expect, test, vi } from "vitest";
import { unzipSync } from "fflate";
import { createArtifactWriter, readArtifact } from "../lib/tool-framework/artifacts.ts";

// Isolate browser/WASM codecs only; exercise the real workers, ZIP and storage.
vi.mock("@/lib/tool-framework/media/imageCodec.ts", () => ({
  async decodeImage(input) {
    return { image: new Uint8Array(await input.arrayBuffer()) };
  },
  async encodeImage(image, format) {
    return new TextEncoder().encode(format + ":" + image.join(",")).buffer;
  },
}));

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
const runners = await Promise.all(keys.map(async (key) => [key, (await import(`../tools/${key}/run.worker.ts`)).run]));

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
      expect(result.render).toBe("files");
      expect(result.inputBytes).toBe(count * 2);
      expect(result.files.length).toBe(count === 1 ? 1 : count + 1);
      expect(result.outputBytes).toBe(result.files[0].size);
      const images = count === 1 ? result.files : result.files.slice(1);
      let archive;
      if (count > 1) {
        expect(result.files[0].mime).toBe("application/zip");
        expect(result.files[0].name).toBe("photo-0-converted.zip");
        archive = unzipSync(await bytes(result.files[0]));
        expect(Object.keys(archive).length).toBe(count);
        expect(writer.bytesWritten > result.outputBytes).toBeTruthy();
      }
      for (const [index, image] of images.entries()) {
        expect(image.name).toBe(`photo-${index}-converted.${target}`);
        expect(image.mime).toBe(`image/${format}`);
        const encoded = await bytes(image);
        expect(encoded).toEqual(new TextEncoder().encode(`${format}:${index + 1},42`));
        expect(image.size).toBe(encoded.byteLength);
        if (archive) expect(archive[image.name]).toEqual(encoded);
      }
    });
  }
  test(`${key}: cancellation does not publish a completed result`, async () => {
    const controller = new AbortController();
    controller.abort();
    let writes = 0;
    await expect(
      run({
        input: { files: [new File(["input"], `photo.${source}`)] },
        settings: { quality: 80 },
        signal: controller.signal,
        progress() {},
        writeArtifact() {
          writes += 1;
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(writes).toBe(0);
  });
}
