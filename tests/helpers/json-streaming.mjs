import { describe, expect, test, vi } from "vitest";
import { ArtifactStorageError, createArtifactWriter, readArtifact } from "../../lib/tool-framework/artifacts.ts";
import { LARGE_TEXT_PREVIEW_BYTES } from "../../lib/tool-framework/limits.ts";
function context(text, settings = {}) {
  const file = new File([text], "large.json", { type: "application/json" });
  const artifacts = createArtifactWriter(crypto.randomUUID());
  return {
    input: {
      text: "only a bounded editor preview",
      files: [{ id: "input", name: file.name, mime: file.type, size: file.size, source: file }],
    },
    settings,
    progress: vi.fn(),
    signal: new AbortController().signal,
    writeArtifact: artifacts.write,
  };
}
export const payload = "👋".repeat(500_001);
const original = `{ "payload": "${payload}", "id": 9007199254740993, "last": false }`;

function testCancellation(run, name, settings) {
  test(`${name} cancels an in-progress file read before producing a completed result`, async () => {
    const ctx = context(original, settings);
    const file = ctx.input.files[0].source;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const cancel = vi.fn();
    let offset = 0;
    // Control the I/O chunk boundary so cancellation happens after a real
    // chunk was processed, not merely before starting an already-aborted run.
    vi.spyOn(file, "stream").mockImplementation(
      () =>
        new ReadableStream(
          {
            pull(controller) {
              if (offset === bytes.length) return controller.close();
              const next = Math.min(offset + 32_768, bytes.length);
              controller.enqueue(bytes.subarray(offset, next));
              offset = next;
            },
            cancel,
          },
          { highWaterMark: 0 },
        ),
    );
    const controller = new AbortController();
    ctx.signal = controller.signal;
    ctx.progress = vi.fn(() => controller.abort());
    await expect(run(ctx)).rejects.toMatchObject({ name: "AbortError" });
    expect(ctx.progress).toHaveBeenCalledOnce();
    expect(ctx.progress.mock.calls[0][0].completed).toBe(32_768);
    expect(offset).toBeLessThan(file.size);
    expect(cancel).toHaveBeenCalledOnce();
  });
}

export function testJsonStreamArtifact(run, name, settings, fileName, expected) {
  test(`${name} streams the complete Unicode file and exposes a bounded preview with a complete artifact`, async () => {
    const ctx = context(original, settings);
    expect(ctx.input.files[0].size).toBeGreaterThan(2_000_000);
    const result = await run(ctx);
    const artifact = result.sections[0].body.files[0];
    expect(artifact.name).toBe(fileName);
    expect(artifact.mime).toBe("application/json");
    expect(artifact.size).toBe(new TextEncoder().encode(expected).byteLength);
    expect(await (await readArtifact(artifact)).text()).toBe(expected);
    expect(expected.startsWith(result.code)).toBe(true);
    expect(new TextEncoder().encode(result.code).length).toBeLessThanOrEqual(LARGE_TEXT_PREVIEW_BYTES);
    expect(result.truncated).toBe(true);
    expect(ctx.progress).toHaveBeenLastCalledWith(
      expect.objectContaining({ completed: ctx.input.files[0].size, total: ctx.input.files[0].size }),
    );
  });
  testCancellation(run, name, settings);
  test(`${name} reports artifact storage failure and succeeds on a fresh retry`, async () => {
    const ctx = context(original, settings);
    const failure = new ArtifactStorageError("storage-full", "Browser storage is full.");
    ctx.writeArtifact = vi.fn(async ({ source }) => {
      // Artifact storage cancels its input on failure; preserve that boundary
      // so a writer error cannot leave the transform waiting for a reader.
      await source.cancel(failure);
      throw failure;
    });
    await expect(run(ctx)).rejects.toMatchObject({ code: "storage-full" });
    expect(ctx.writeArtifact).toHaveBeenCalledOnce();
    const recovered = await run(context(original, settings));
    expect(await (await readArtifact(recovered.sections[0].body.files[0])).text()).toBe(expected);
  });
}
export function testJsonStreamValidation(run, name, settings) {
  describe(`${name} large-file validation`, () => {
    test("validates beyond the editor preview and reports the complete input size", async () => {
      const ctx = context(original, settings);
      const result = await run(ctx);
      expect(result.stats).toMatchObject([
        { label: "Status", value: "Valid JSON" },
        { label: "Root type", value: "object" },
        { label: "Input", value: `${ctx.input.files[0].size.toLocaleString("en-US")} bytes` },
      ]);
      expect(result.truncated).toBe(true);
      expect(result.code).not.toContain("only a bounded editor preview");
    });
    test("rejects malformed bytes after the bounded preview", async () => {
      await expect(run(context(`${original.slice(0, -1)},}`, settings))).rejects.toMatchObject({
        code: "json-syntax",
        recovery: expect.any(String),
      });
    });
    test("honors cancellation before processing", async () => {
      const ctx = context(original, settings);
      ctx.signal = AbortSignal.abort();
      await expect(run(ctx)).rejects.toMatchObject({ name: "AbortError" });
    });
    testCancellation(run, name, settings);
  });
}
