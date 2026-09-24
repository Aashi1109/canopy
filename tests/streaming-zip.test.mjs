import { expect, test } from "vitest";

import { unzipSync } from "fflate";

import { ArtifactStorageError, createArtifactWriter, readArtifact } from "../lib/tool-framework/artifacts.ts";
import { writeArtifactBatch } from "../lib/tool-framework/media/zip.ts";

test("streams a byte-correct ZIP without retaining separate output artifacts", async () => {
  const controller = new AbortController();
  const artifacts = createArtifactWriter("streaming-zip-correct", {
    signal: controller.signal,
  });

  const files = await writeArtifactBatch(
    { signal: controller.signal, writeArtifact: artifacts.write },
    { archiveName: "images.zip", count: 2 },
    async (write) => {
      await write({
        name: "first.txt",
        mime: "text/plain",
        source: new TextEncoder().encode("first payload"),
      });
      await write({
        name: "second.txt",
        mime: "text/plain",
        source: new Blob(["second payload"]),
      });
    },
  );

  expect(files.length).toBe(1);
  expect(files[0].name).toBe("images.zip");
  expect(files[0].mime).toBe("application/zip");
  const archive = unzipSync(new Uint8Array(await (await readArtifact(files[0])).arrayBuffer()));
  expect(Object.keys(archive)).toEqual(["first.txt", "second.txt"]);
  expect(new TextDecoder().decode(archive["first.txt"])).toBe("first payload");
  expect(new TextDecoder().decode(archive["second.txt"])).toBe("second payload");
});

test("retains individually downloadable images alongside a byte-correct ZIP when requested", async () => {
  const signal = new AbortController().signal;
  const artifacts = createArtifactWriter("streaming-zip-retained", { signal });
  const files = await writeArtifactBatch(
    { signal, writeArtifact: artifacts.write },
    { archiveName: "images.zip", count: 2, retainEntries: true },
    async (write) => {
      await write({ name: "page-1.jpg", mime: "image/jpeg", source: new Blob(["first"]).stream() });
      await write({ name: "page-2.jpg", mime: "image/jpeg", source: new Uint8Array([1, 2, 3]) });
    },
  );
  expect(files.map((file) => file.name)).toEqual(["images.zip", "page-1.jpg", "page-2.jpg"]);
  const archive = unzipSync(new Uint8Array(await (await readArtifact(files[0])).arrayBuffer()));
  for (const file of files.slice(1)) {
    expect(file.mime).toBe("image/jpeg");
    expect(new Uint8Array(await (await readArtifact(file)).arrayBuffer())).toEqual(archive[file.name]);
  }
});

test("writes one output directly instead of wrapping it in a ZIP", async () => {
  const signal = new AbortController().signal;
  const artifacts = createArtifactWriter("streaming-zip-single", { signal });

  const files = await writeArtifactBatch(
    { signal, writeArtifact: artifacts.write },
    { archiveName: "unused.zip", count: 1 },
    (write) =>
      write({
        name: "converted.png",
        mime: "image/png",
        source: new Uint8Array([1, 2, 3]),
      }),
  );

  expect(files.length).toBe(1);
  expect(files[0].name).toBe("converted.png");
  expect(files[0].mime).toBe("image/png");
  expect(new Uint8Array(await (await readArtifact(files[0])).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
});

test("can force a valid ZIP for a one-entry batch", async () => {
  const signal = new AbortController().signal;
  const artifacts = createArtifactWriter("streaming-zip-forced-single", { signal });

  const files = await writeArtifactBatch(
    { signal, writeArtifact: artifacts.write },
    { archiveName: "single.zip", count: 1, forceArchive: true },
    (write) =>
      write({
        name: "part.pdf",
        mime: "application/pdf",
        source: new Uint8Array([37, 80, 68, 70]),
      }),
  );

  expect(files[0].mime).toBe("application/zip");
  const archive = unzipSync(new Uint8Array(await (await readArtifact(files[0])).arrayBuffer()));
  expect(archive["part.pdf"]).toEqual(new Uint8Array([37, 80, 68, 70]));
});

test("renames duplicate entry filenames so a batch cannot overwrite data", async () => {
  const signal = new AbortController().signal;
  const artifacts = createArtifactWriter("streaming-zip-duplicates", { signal });

  const files = await writeArtifactBatch(
    { signal, writeArtifact: artifacts.write },
    { archiveName: "duplicates.zip", count: 2 },
    async (write) => {
      await write({
        name: "same.txt",
        mime: "text/plain",
        source: new Blob(["first"]),
      });
      await write({
        name: "same.txt",
        mime: "text/plain",
        source: new Blob(["second"]),
      });
    },
  );

  const archive = unzipSync(new Uint8Array(await (await readArtifact(files[0])).arrayBuffer()));
  expect(Object.keys(archive)).toEqual(["same.txt", "same-2.txt"]);
  expect(new TextDecoder().decode(archive["same.txt"])).toBe("first");
  expect(new TextDecoder().decode(archive["same-2.txt"])).toBe("second");
});

test("aborts the ZIP artifact stream when processing is canceled", async () => {
  const controller = new AbortController();
  const artifacts = createArtifactWriter("streaming-zip-cancel", {
    signal: controller.signal,
  });

  await expect(
    writeArtifactBatch(
      { signal: controller.signal, writeArtifact: artifacts.write },
      { archiveName: "canceled.zip", count: 2 },
      async (write) => {
        await write({
          name: "first.bin",
          mime: "application/octet-stream",
          source: new Uint8Array([1, 2, 3]),
        });
        controller.abort();
        await write({
          name: "second.bin",
          mime: "application/octet-stream",
          source: new Uint8Array([4, 5, 6]),
        });
      },
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(artifacts.bytesWritten).toBe(0);
});

test("propagates the artifact output ceiling while the ZIP is streaming", async () => {
  const signal = new AbortController().signal;
  const artifacts = createArtifactWriter("streaming-zip-limit", {
    maxOutputBytes: 32,
    signal,
  });

  await (async () => {
    let __err;
    try {
      await writeArtifactBatch(
        { signal, writeArtifact: artifacts.write },
        { archiveName: "too-large.zip", count: 2 },
        async (write) => {
          await write({
            name: "first.bin",
            mime: "application/octet-stream",
            source: new Uint8Array(64).fill(1),
          });
          await write({
            name: "second.bin",
            mime: "application/octet-stream",
            source: new Uint8Array(64).fill(2),
          });
        },
      );
    } catch (__e) {
      __err = __e;
    }
    expect(__err).toBeDefined();
    expect(((error) => error instanceof ArtifactStorageError && error.code === "output-too-large")(__err)).toBe(true);
  })();
  expect(artifacts.bytesWritten).toBe(0);
});
