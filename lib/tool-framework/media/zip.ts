/**
 * Packages several produced files into one archive, for tools whose natural
 * output is a set rather than a single download.
 */

import { readArtifact } from "../artifacts.ts";
import type { ArtifactSource, ArtifactWriteInput, StoredToolArtifact } from "../artifacts.ts";
import type { ToolRunContext } from "../run.ts";
import { sanitizeFileName } from "./validation.ts";

/** Deflate level 6 — the balance the media runtime has always shipped. */
const ZIP_LEVEL = 6;

type ArtifactContext = Pick<ToolRunContext<unknown>, "signal" | "writeArtifact">;

type ArtifactBatchOptions = {
  readonly archiveName: string;
  readonly count: number;
  readonly forceArchive?: boolean;
  /** Keep full-resolution files for per-file preview/download as well as the ZIP. */
  readonly retainEntries?: boolean;
};

type AddArtifact = (input: ArtifactWriteInput) => Promise<void>;

export type ArtifactBatchWriter = {
  add(input: ArtifactWriteInput): Promise<void>;
  finish(): Promise<readonly StoredToolArtifact[]>;
  abort(reason?: unknown): Promise<void>;
};

/**
 * Writes one output directly, or several outputs into one streaming ZIP.
 * `produce` must await `add` before encoding its next file so only the active
 * encoded payload remains live.
 */
export async function writeArtifactBatch(
  ctx: ArtifactContext,
  options: ArtifactBatchOptions,
  produce: (add: AddArtifact) => Promise<void>,
): Promise<readonly StoredToolArtifact[]> {
  const batch = await createArtifactBatchWriter(ctx, options);
  try {
    await produce(batch.add);
    return await batch.finish();
  } catch (error) {
    await batch.abort(error);
    throw error;
  }
}

/** Incremental form for producers that learn their output count when work opens. */
export async function createArtifactBatchWriter(
  ctx: ArtifactContext,
  options: ArtifactBatchOptions,
): Promise<ArtifactBatchWriter> {
  if (!Number.isInteger(options.count) || options.count < 1) {
    throw new RangeError("Artifact batch count must be a positive integer.");
  }

  if (options.count === 1 && options.forceArchive !== true) {
    let output: StoredToolArtifact | undefined;
    return {
      async add(input) {
        ctx.signal.throwIfAborted();
        if (output) throw new RangeError("Artifact batch produced too many files.");
        output = await ctx.writeArtifact(input);
      },
      async finish() {
        if (!output) throw new RangeError("Artifact batch did not produce a file.");
        return [output];
      },
      async abort() {},
    };
  }

  if (options.retainEntries) {
    const entries: StoredToolArtifact[] = [];
    let archive: StreamingZip | undefined;
    return {
      async add(input) {
        ctx.signal.throwIfAborted();
        if (entries.length >= options.count) throw new RangeError("Artifact batch produced too many files.");
        entries.push(await ctx.writeArtifact(input));
      },
      async finish() {
        ctx.signal.throwIfAborted();
        if (entries.length !== options.count) throw new RangeError("Artifact batch did not produce every file.");
        // The artifact writer serializes writes. Finish individual files before
        // opening the ZIP stream, then read back one file at a time.
        archive = await createStreamingZip(ctx, options.archiveName);
        for (const entry of entries) {
          ctx.signal.throwIfAborted();
          await archive.add(entry.name, (await readArtifact(entry)).stream());
        }
        return [await archive.finish(), ...entries];
      },
      async abort(reason) {
        await archive?.abort(reason);
      },
    };
  }

  const archive = await createStreamingZip(ctx, options.archiveName);
  let added = 0;
  return {
    async add(input) {
      ctx.signal.throwIfAborted();
      if (added >= options.count) {
        throw new RangeError("Artifact batch produced too many files.");
      }
      await archive.add(input.name, input.source);
      added += 1;
    },
    async finish() {
      if (added !== options.count) {
        throw new RangeError("Artifact batch did not produce every file.");
      }
      return [await archive.finish()];
    },
    abort: archive.abort,
  };
}

type StreamingZip = {
  add(name: string, source: ArtifactSource): Promise<void>;
  finish(): Promise<StoredToolArtifact>;
  abort(reason?: unknown): Promise<void>;
};

async function createStreamingZip(ctx: ArtifactContext, archiveName: string): Promise<StreamingZip> {
  const { Zip, ZipDeflate } = await import("fflate");
  const channel = new TransformStream<Uint8Array, Uint8Array>();
  const output = channel.writable.getWriter();
  const artifactPromise = ctx.writeArtifact({
    name: sanitizeFileName(archiveName, "outputs.zip"),
    mime: "application/zip",
    source: channel.readable,
  });
  let artifactFailed = false;
  let artifactError: unknown;
  void artifactPromise.catch((error) => {
    artifactFailed = true;
    artifactError = error;
  });

  let writes: Promise<void> = Promise.resolve();
  let state: "open" | "ending" | "closed" | "aborted" = "open";
  const names = new Set<string>();

  const queue = (operation: () => void | Promise<void>) => {
    writes = writes.then(operation);
    void writes.catch(() => undefined);
  };

  const drain = async () => {
    try {
      await writes;
    } catch (error) {
      await Promise.resolve();
      throw artifactFailed ? artifactError : error;
    }
  };

  const archive = new Zip((error, data, final) => {
    if (error) {
      queue(() => Promise.reject(error));
      return;
    }
    const chunk = copyBytes(data);
    queue(async () => {
      ctx.signal.throwIfAborted();
      if (chunk.byteLength > 0) await output.write(chunk);
      if (final) await output.close();
    });
  });

  return {
    async add(name, source) {
      if (state !== "open") throw new Error("ZIP output is no longer writable.");
      ctx.signal.throwIfAborted();
      const entry = new ZipDeflate(uniqueEntryName(name, names), {
        level: ZIP_LEVEL,
      });
      archive.add(entry);
      const reader = sourceStream(source).getReader();
      try {
        while (true) {
          ctx.signal.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) break;
          if (!(value instanceof Uint8Array)) {
            throw new TypeError("ZIP entries must contain byte chunks.");
          }
          entry.push(copyBytes(value));
          await drain();
        }
        entry.push(new Uint8Array(), true);
        await drain();
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    },
    async finish() {
      if (state !== "open") throw new Error("ZIP output is already finalized.");
      state = "ending";
      ctx.signal.throwIfAborted();
      archive.end();
      await drain();
      const artifact = await artifactPromise;
      state = "closed";
      return artifact;
    },
    async abort(reason) {
      if (state === "closed" || state === "aborted") return;
      state = "aborted";
      archive.terminate();
      await output.abort(reason).catch(() => undefined);
      await writes.catch(() => undefined);
      await artifactPromise.catch(() => undefined);
    },
  };
}

function sourceStream(source: ArtifactSource): ReadableStream<Uint8Array> {
  if (source instanceof Blob) return source.stream();
  if (source instanceof Uint8Array) {
    return new ReadableStream({
      start(controller) {
        controller.enqueue(source);
        controller.close();
      },
    });
  }
  return source;
}

function uniqueEntryName(input: string, used: Set<string>): string {
  const name = sanitizeFileName(input);
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  let index = 2;
  while (used.has(`${base}-${index}${extension}`)) index += 1;
  const unique = `${base}-${index}${extension}`;
  used.add(unique);
  return unique;
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}
