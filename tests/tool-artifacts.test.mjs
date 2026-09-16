import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import {
  ARTIFACT_STALE_MS,
  BLOB_FALLBACK_MAX_BYTES,
  PLATFORM_MAX_OUTPUT_BYTES,
  ArtifactStorageError,
  cleanupArtifactJob,
  cleanupArtifactJobWithRetry,
  createArtifactWriter,
  readArtifact,
  sweepStaleArtifactJobs,
  sweepStaleArtifactJobsOnce,
} from "../lib/tool-framework/artifacts.ts";

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

afterEach(() => {
  if (originalNavigator) {
    Object.defineProperty(globalThis, "navigator", originalNavigator);
  } else {
    delete globalThis.navigator;
  }
});

test("publishes the fixed platform and fallback output ceilings", () => {
  assert.equal(PLATFORM_MAX_OUTPUT_BYTES, 100 * 1024 * 1024);
  assert.equal(BLOB_FALLBACK_MAX_BYTES, 16 * 1024 * 1024);
  assert.equal(ARTIFACT_STALE_MS, 24 * 60 * 60 * 1000);
});

test("uses a bounded Blob artifact when OPFS is unavailable", async () => {
  installNavigator();
  const writer = createArtifactWriter("job-fallback");

  const artifact = await writer.write({
    name: "../report?.txt",
    mime: "text/plain",
    source: new Uint8Array([104, 101, 108, 108, 111]),
  });

  assert.equal(artifact.storage, "blob");
  assert.equal(artifact.name, "report.txt");
  assert.equal(artifact.size, 5);
  assert.equal(writer.bytesWritten, 5);
  assert.equal(await (await readArtifact(artifact)).text(), "hello");
  assert.doesNotThrow(() => structuredClone(artifact));
});

test("streams into OPFS and reads the committed artifact as a named File", async () => {
  const root = new MemoryDirectoryHandle("root");
  installNavigator(root);
  const writer = createArtifactWriter("job-opfs");
  const source = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2]));
      controller.enqueue(new Uint8Array([3, 4, 5]));
      controller.close();
    },
  });

  const artifact = await writer.write({
    name: "result.bin",
    mime: "application/octet-stream",
    source,
  });

  assert.equal(artifact.storage, "opfs");
  assert.equal(artifact.size, 5);
  assert.equal(writer.bytesWritten, 5);
  assert.doesNotThrow(() => structuredClone(artifact));
  const file = await readArtifact(artifact);
  assert.equal(file.name, "result.bin");
  assert.equal(file.type, "application/octet-stream");
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), new Uint8Array([1, 2, 3, 4, 5]));
});

test("warns about estimated storage pressure without treating the estimate as authoritative", async () => {
  const root = new MemoryDirectoryHandle("root");
  const warnings = [];
  installNavigator(root, { quota: 10, usage: 9 });
  const writer = createArtifactWriter("job-low-storage", {
    onStorageWarning: (warning) => warnings.push(warning),
  });

  const artifact = await writer.write({
    name: "result.bin",
    mime: "application/octet-stream",
    source: new Uint8Array([1, 2, 3]),
  });

  assert.equal(artifact.size, 3);
  assert.deepEqual(warnings, [
    {
      availableBytes: 1,
      requiredBytes: 3,
      message: "Browser storage may be low. The tool will still try to save the result.",
    },
  ]);
});

test("enforces the aggregate output limit while consuming an unknown stream", async () => {
  installNavigator();
  const writer = createArtifactWriter("job-limit", { maxOutputBytes: 5 });
  await writer.write({
    name: "first.bin",
    mime: "application/octet-stream",
    source: new Uint8Array([1, 2, 3]),
  });

  await assert.rejects(
    writer.write({
      name: "second.bin",
      mime: "application/octet-stream",
      source: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([4, 5]));
          controller.enqueue(new Uint8Array([6]));
          controller.close();
        },
      }),
    }),
    (error) => error instanceof ArtifactStorageError && error.code === "output-too-large",
  );
  assert.equal(writer.bytesWritten, 3);
});

test("accepts an aggregate exactly at its configured limit", async () => {
  installNavigator();
  const writer = createArtifactWriter("job-exact", { maxOutputBytes: 5 });

  await Promise.all([
    writer.write({
      name: "first.bin",
      mime: "application/octet-stream",
      source: new Uint8Array([1, 2]),
    }),
    writer.write({
      name: "second.bin",
      mime: "application/octet-stream",
      source: new Uint8Array([3, 4, 5]),
    }),
  ]);

  assert.equal(writer.bytesWritten, 5);
});

test("rejects an oversized fallback instead of retaining it in memory", async () => {
  installNavigator();
  const writer = createArtifactWriter("job-large-fallback");

  await assert.rejects(
    writer.write({
      name: "large.bin",
      mime: "application/octet-stream",
      source: new Uint8Array(BLOB_FALLBACK_MAX_BYTES + 1),
    }),
    (error) => error instanceof ArtifactStorageError && error.code === "storage-unavailable",
  );
  assert.equal(writer.bytesWritten, 0);
});

test("the Blob fallback limit applies to the whole job", async () => {
  const writer = createArtifactWriter("aggregate-fallback-job");
  const first = await writer.write({
    name: "first.bin",
    mime: "application/octet-stream",
    source: new Uint8Array(10 * 1024 * 1024),
  });
  assert.equal(first.storage, "blob");
  await assert.rejects(
    writer.write({
      name: "second.bin",
      mime: "application/octet-stream",
      source: new Uint8Array(7 * 1024 * 1024),
    }),
    (error) => error instanceof ArtifactStorageError && error.code === "storage-unavailable",
  );
});

test("detects a partial OPFS commit and falls back without returning corrupt bytes", async () => {
  const root = new MemoryDirectoryHandle("root");
  root.truncateNextWrite = true;
  installNavigator(root);
  const writer = createArtifactWriter("job-partial");

  const artifact = await writer.write({
    name: "safe.bin",
    mime: "application/octet-stream",
    source: new Uint8Array([1, 2, 3]),
  });

  assert.equal(artifact.storage, "blob");
  assert.deepEqual(new Uint8Array(await (await readArtifact(artifact)).arrayBuffer()), new Uint8Array([1, 2, 3]));
});

test("recovers from an OPFS quota error only within the Blob fallback ceiling", async () => {
  const root = new MemoryDirectoryHandle("root");
  root.failNextWrite = new DOMException("No space", "QuotaExceededError");
  installNavigator(root);
  const writer = createArtifactWriter("job-quota");

  const artifact = await writer.write({
    name: "small.txt",
    mime: "text/plain",
    source: new Blob(["recoverable"]),
  });

  assert.equal(artifact.storage, "blob");
  assert.equal(await artifact.blob.text(), "recoverable");
});

test("removes a job directory when its creation marker cannot be committed", async () => {
  const root = new MemoryDirectoryHandle("root");
  root.failMarkerWrite = true;
  installNavigator(root);

  const artifact = await createArtifactWriter("job-marker-failure").write({
    name: "small.txt",
    mime: "text/plain",
    source: new Blob(["recoverable"]),
  });

  assert.equal(artifact.storage, "blob");
  await assert.rejects(getJob(root, "job-marker-failure"), { name: "NotFoundError" });
});

test("does not return a partial Blob when an OPFS stream fails before completion", async () => {
  const root = new MemoryDirectoryHandle("root");
  root.failNextWrite = new DOMException("No space", "QuotaExceededError");
  installNavigator(root);
  const writer = createArtifactWriter("job-stream-quota");

  await assert.rejects(
    writer.write({
      name: "stream.bin",
      mime: "application/octet-stream",
      source: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2]));
          controller.enqueue(new Uint8Array([3, 4]));
          controller.close();
        },
      }),
    }),
    (error) => error instanceof ArtifactStorageError && error.code === "storage-full",
  );
  assert.equal(writer.bytesWritten, 0);
});

test("preserves cancellation and removes the partial OPFS file", async () => {
  const root = new MemoryDirectoryHandle("root");
  installNavigator(root);
  const controller = new AbortController();
  const writer = createArtifactWriter("job-cancel", { signal: controller.signal });
  let pulls = 0;

  await assert.rejects(
    writer.write({
      name: "cancel.bin",
      mime: "application/octet-stream",
      source: new ReadableStream(
        {
          pull(stream) {
            pulls += 1;
            if (pulls === 1) {
              stream.enqueue(new Uint8Array([1]));
            } else {
              controller.abort();
              stream.close();
            }
          },
        },
        { highWaterMark: 0 },
      ),
    }),
    { name: "AbortError" },
  );
  const job = await getJob(root, "job-cancel");
  assert.deepEqual([...job.children.keys()], [".created-at"]);
});

test("rejects invalid boundary data and missing or corrupt artifacts", async () => {
  installNavigator();
  assert.throws(() => createArtifactWriter("../job"), TypeError);
  assert.throws(() => createArtifactWriter("job", { maxOutputBytes: 0 }), RangeError);

  const writer = createArtifactWriter("job-invalid");
  await assert.rejects(
    writer.write({ name: "bad", mime: "not-a-mime", source: new Uint8Array() }),
    (error) => error instanceof ArtifactStorageError && error.code === "invalid-artifact",
  );
  await assert.rejects(
    writer.write({ name: "bad", mime: "text/plain", source: {} }),
    (error) => error instanceof ArtifactStorageError && error.code === "invalid-artifact",
  );

  await assert.rejects(
    readArtifact({
      storage: "blob",
      id: "artifact",
      jobId: "job-invalid",
      name: "bad.txt",
      mime: "text/plain",
      size: 2,
      createdAt: Date.now(),
      blob: new Blob(["x"]),
    }),
    (error) => error instanceof ArtifactStorageError && error.code === "artifact-corrupt",
  );
  await assert.rejects(
    readArtifact({
      storage: "opfs",
      id: "missing",
      jobId: "job-invalid",
      name: "missing.txt",
      mime: "text/plain",
      size: 1,
      createdAt: Date.now(),
    }),
    (error) => error instanceof ArtifactStorageError && error.code === "storage-unavailable",
  );

  for (const metadata of [
    null,
    { storage: "unknown" },
    {
      storage: "opfs",
      id: "artifact",
      jobId: "job-invalid",
      name: "bad.txt",
      mime: "text/plain",
      size: -1,
      createdAt: Date.now(),
    },
    {
      storage: "opfs",
      id: "artifact",
      jobId: "job-invalid",
      name: "bad.txt",
      mime: "text/plain",
      size: 1,
      createdAt: Number.NaN,
    },
    {
      storage: "opfs",
      id: "artifact",
      jobId: "job-invalid",
      name: "../bad.txt",
      mime: "text/plain",
      size: 1,
      createdAt: Date.now(),
    },
    {
      storage: "blob",
      id: "artifact",
      jobId: "job-invalid",
      name: "bad.txt",
      mime: "text/plain",
      size: 1,
      createdAt: Date.now(),
      blob: "not-a-blob",
    },
  ]) {
    await assert.rejects(
      readArtifact(metadata),
      (error) => error instanceof ArtifactStorageError && error.code === "invalid-artifact",
    );
  }
});

test("validates streamed chunks in both OPFS and fallback modes", async () => {
  installNavigator();
  await assert.rejects(
    createArtifactWriter("job-invalid-fallback").write({
      name: "bad.bin",
      mime: "application/octet-stream",
      source: new ReadableStream({
        start(controller) {
          controller.enqueue("bad");
        },
      }),
    }),
    (error) => error instanceof ArtifactStorageError && error.code === "invalid-artifact",
  );

  installNavigator(new MemoryDirectoryHandle("root"));
  await assert.rejects(
    createArtifactWriter("job-invalid-opfs").write({
      name: "bad.bin",
      mime: "application/octet-stream",
      source: new ReadableStream({
        start(controller) {
          controller.enqueue("bad");
        },
      }),
    }),
    (error) => error instanceof ArtifactStorageError && error.code === "invalid-artifact",
  );
});

test("maps worker storage failures to stable recoverable codes", async () => {
  for (const [name, code] of [
    ["SecurityError", "storage-unavailable"],
    ["UnknownError", "artifact-write-failed"],
  ]) {
    const root = new MemoryDirectoryHandle("root");
    root.failNextWrite = new DOMException("Write failed", name);
    installNavigator(root);
    const writer = createArtifactWriter(`job-${name.toLowerCase()}`);
    await assert.rejects(
      writer.write({
        name: "stream.bin",
        mime: "application/octet-stream",
        source: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1]));
            controller.close();
          },
        }),
      }),
      (error) => error instanceof ArtifactStorageError && error.code === code,
    );
  }

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      storage: {
        getDirectory: async () => {
          throw new DOMException("Denied", "SecurityError");
        },
      },
    },
  });
  const fallback = await createArtifactWriter("job-root-denied").write({
    name: "fallback.txt",
    mime: "text/plain",
    source: new Blob(["safe"]),
  });
  assert.equal(fallback.storage, "blob");
});

test("reports missing and corrupt OPFS artifacts without exposing storage errors", async () => {
  const root = new MemoryDirectoryHandle("root");
  installNavigator(root);
  await seedJob(root, "job-read", Date.now());
  const metadata = {
    storage: "opfs",
    id: "artifact",
    jobId: "job-read",
    name: "artifact.txt",
    mime: "text/plain",
    size: 2,
    createdAt: Date.now(),
  };

  await assert.rejects(
    readArtifact(metadata),
    (error) => error instanceof ArtifactStorageError && error.code === "artifact-not-found",
  );

  const job = await getJob(root, "job-read");
  const handle = await job.getFileHandle("artifact", { create: true });
  const writable = await handle.createWritable();
  await writable.write(new Uint8Array([1]));
  await writable.close();
  await assert.rejects(
    readArtifact(metadata),
    (error) => error instanceof ArtifactStorageError && error.code === "artifact-corrupt",
  );
});

test("cleans one job and sweeps only stale marked OPFS jobs", async () => {
  const root = new MemoryDirectoryHandle("root");
  installNavigator(root);
  const now = 2_000_000_000_000;
  await seedJob(root, "stale-job", now - ARTIFACT_STALE_MS - 1);
  await seedJob(root, "fresh-job", now - ARTIFACT_STALE_MS + 1);

  assert.equal(await sweepStaleArtifactJobs({ now }), 1);
  await assert.rejects(getJob(root, "stale-job"), { name: "NotFoundError" });
  assert.ok(await getJob(root, "fresh-job"));

  await cleanupArtifactJob("fresh-job");
  await assert.rejects(getJob(root, "fresh-job"), { name: "NotFoundError" });
  await cleanupArtifactJob("already-missing");
  await assert.rejects(sweepStaleArtifactJobs({ now: Number.NaN }), RangeError);
});

test("retries transient cleanup failures and coalesces the startup stale sweep", async () => {
  const root = new MemoryDirectoryHandle("root");
  installNavigator(root);
  const now = Date.now();
  await seedJob(root, "retry-job", now);
  await seedJob(root, "startup-stale-job", now - ARTIFACT_STALE_MS - 1);
  const jobs = await (await root.getDirectoryHandle("smarttools")).getDirectoryHandle("jobs");
  jobs.failRemoveCount = 1;

  await cleanupArtifactJobWithRetry("retry-job", { retryDelayMs: 0 });
  await assert.rejects(getJob(root, "retry-job"), { name: "NotFoundError" });

  const [first, second] = await Promise.all([sweepStaleArtifactJobsOnce(), sweepStaleArtifactJobsOnce()]);
  assert.equal(first, 1);
  assert.equal(second, 1);
  await assert.rejects(getJob(root, "startup-stale-job"), { name: "NotFoundError" });
});

function installNavigator(root, estimate) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: root
      ? {
          storage: {
            estimate: estimate ? async () => estimate : undefined,
            getDirectory: async () => root,
          },
        }
      : { storage: {} },
  });
}

async function getJob(root, jobId) {
  const smarttools = await root.getDirectoryHandle("smarttools");
  const jobs = await smarttools.getDirectoryHandle("jobs");
  return jobs.getDirectoryHandle(jobId);
}

async function seedJob(root, jobId, createdAt) {
  const smarttools = await root.getDirectoryHandle("smarttools", { create: true });
  const jobs = await smarttools.getDirectoryHandle("jobs", { create: true });
  const job = await jobs.getDirectoryHandle(jobId, { create: true });
  const marker = await job.getFileHandle(".created-at", { create: true });
  const writable = await marker.createWritable();
  await writable.write(new TextEncoder().encode(String(createdAt)));
  await writable.close();
}

class MemoryDirectoryHandle {
  kind = "directory";
  children = new Map();
  failNextWrite = null;
  failMarkerWrite = false;
  failRemoveCount = 0;
  truncateNextWrite = false;

  constructor(name, root = null) {
    this.name = name;
    this.root = root ?? this;
  }

  async getDirectoryHandle(name, options = {}) {
    const existing = this.children.get(name);
    if (existing?.kind === "directory") return existing;
    if (!options.create) throw new DOMException("Missing", "NotFoundError");
    const directory = new MemoryDirectoryHandle(name, this.root);
    this.children.set(name, directory);
    return directory;
  }

  async getFileHandle(name, options = {}) {
    const existing = this.children.get(name);
    if (existing?.kind === "file") return existing;
    if (!options.create) throw new DOMException("Missing", "NotFoundError");
    const file = new MemoryFileHandle(name, this.root);
    this.children.set(name, file);
    return file;
  }

  async removeEntry(name) {
    if (this.failRemoveCount > 0) {
      this.failRemoveCount -= 1;
      throw new DOMException("Busy", "InvalidStateError");
    }
    if (!this.children.delete(name)) throw new DOMException("Missing", "NotFoundError");
  }

  async *entries() {
    yield* this.children.entries();
  }
}

class MemoryFileHandle {
  kind = "file";
  bytes = new Uint8Array();
  lastModified = Date.now();

  constructor(name, root) {
    this.name = name;
    this.root = root;
  }

  async createWritable() {
    return new MemoryWritable(this, this.root);
  }

  async getFile() {
    return new File([this.bytes], this.name, { lastModified: this.lastModified });
  }
}

class MemoryWritable {
  chunks = [];
  closed = false;

  constructor(file, root) {
    this.file = file;
    this.root = root;
  }

  async write(chunk) {
    if (this.root.failMarkerWrite && this.file.name === ".created-at") {
      this.root.failMarkerWrite = false;
      throw new DOMException("No space", "QuotaExceededError");
    }
    if (this.root.failNextWrite && this.file.name !== ".created-at") {
      const error = this.root.failNextWrite;
      this.root.failNextWrite = null;
      throw error;
    }
    this.chunks.push(new Uint8Array(chunk));
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    const size = this.chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of this.chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (this.root.truncateNextWrite && this.file.name !== ".created-at") {
      this.file.bytes = bytes.slice(0, -1);
      this.root.truncateNextWrite = false;
    } else {
      this.file.bytes = bytes;
    }
    this.file.lastModified = Date.now();
  }

  async abort() {
    this.closed = true;
  }
}
