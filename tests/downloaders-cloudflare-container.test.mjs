import { afterEach, expect, test, vi } from "vitest";

vi.mock("@cloudflare/containers", () => ({
  Container: class {
    async startAndWaitForPorts() {}
    constructor(ctx, env) {
      this.ctx = ctx;
      this.env = env;
      this.containerFetch = vi.fn(async () => Response.json(nativeStatus()));
      this.destroy = vi.fn(async () => {});
      this.getState = vi.fn(async () => ({ status: "stopped" }));
      this.renewActivityTimeout = vi.fn();
    }
  },
  ContainerProxy: class {},
}));
import { DownloaderContainer } from "../lib/downloaders/cloudflareContainer.ts";

test("local storage readiness bypasses cold-start slot RPC only for the exact health request", async () => {
  const slot = { authorizeOutbound: vi.fn(async () => null) };
  const get = vi.fn(() => slot);
  const env = {
    DOWNLOADERS_LOCAL: "true",
    DOWNLOAD_FILES: {},
    DOWNLOAD_CONTAINERS: { idFromString: (id) => id, get },
  };
  const health = "https://download-storage.local/__download-storage/health";
  const response = await DownloaderContainer.outbound(new Request(health), env, { containerId: "slot" });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ storage: "canopy-local-r2", protocolVersion: 1 });
  expect(get).not.toHaveBeenCalled();
  for (const request of [new Request(`${health}?extra=1`), new Request(health, { method: "POST" })]) {
    expect((await DownloaderContainer.outbound(request, env, { containerId: "slot" })).status).toBe(403);
  }
  env.DOWNLOADERS_LOCAL = "false";
  expect((await DownloaderContainer.outbound(new Request(health), env, { containerId: "slot" })).status).toBe(403);
});

function nativeStatus(overrides = {}) {
  return {
    state: "running",
    stopped: false,
    phase: "downloading",
    usage: { workMs: 0, sourceBytes: 0 },
    artifacts: [],
    evidence: null,
    error: null,
    ...overrides,
  };
}
const identity = { jobId: "job", attemptGeneration: 1, slotGeneration: 1, startOrdinal: 1 };
function input(overrides = {}) {
  return {
    ...identity,
    protocolVersion: 1,
    deadline: new Date(100_000).toISOString(),
    limits: {
      workMs: 100_000,
      sourceBytes: 1000,
      outputBytes: 5000,
      fileBytes: 1000,
      scratchBytes: 10000,
      durationSeconds: 600,
      maxItems: 5,
    },
    request: {
      engine: "yt-dlp",
      url: "https://www.youtube.com/watch?v=BaW_jenozKc",
      quality: "720",
      noPlaylist: true,
      sourceId: "BaW_jenozKc",
      extractorKeys: ["Youtube"],
      sourceComposition: "single-video",
    },
    stagingArtifacts: [],
    ...overrides,
  };
}
function fixture() {
  let now = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const values = new Map();
  const storage = {
    get: async (key) => structuredClone(values.get(key)),
    put: async (key, value) => {
      values.set(key, structuredClone(value));
    },
    delete: async (key) => values.delete(key),
    transaction: async (callback) => callback(storage),
  };
  let pending = Promise.resolve();
  const ctx = {
    storage,
    abort: vi.fn(),
    blockConcurrencyWhile(callback) {
      const result = pending.then(callback);
      pending = result.catch(() => {});
      return result;
    },
  };
  const slot = new DownloaderContainer(ctx, { DOWNLOADERS_CONTROL_SECRET: "s".repeat(48) });
  ctx.container = { running: true, getTcpPort: () => ({ fetch: (request) => slot.containerFetch(request) }) };
  return {
    slot,
    values,
    ctx,
    advance: (value) => {
      now = value;
    },
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("container timing separates startup and aggregates status without control data", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const { slot } = fixture();
  slot.containerFetch.mockImplementationOnce(async () => {
    await slot.startAndWaitForPorts(8080);
    return Response.json(nativeStatus());
  });
  await slot.startExecution(input(), ["*.youtube.com"]);
  await slot.statusExecution(identity);
  slot.containerFetch.mockResolvedValueOnce(Response.json(nativeStatus({ state: "cancelled", stopped: true })));
  await slot.statusExecution(identity);
  const events = log.mock.calls.map(([line]) => JSON.parse(line));
  expect(events.map((event) => event.stage)).toEqual(
    expect.arrayContaining([
      "container.startup",
      "container.control_start",
      "container.start_total",
      "container.control_status",
    ]),
  );
  const statuses = events.filter((event) => event.stage === "container.control_status");
  expect(statuses).toHaveLength(1);
  expect(statuses[0]).toMatchObject({ event: "downloader_timing", jobId: "job", count: 2 });
  expect(events.every((event) => Number.isFinite(event.durationMs) && event.durationMs >= 0)).toBe(true);
  expect(JSON.stringify(events)).not.toMatch(/youtube|Authorization|Bearer|BaW_jenozKc|https:|secret/);
});

test("recovery excludes new starts until destruction finishes, then permits only a newer slot generation", async () => {
  const { slot } = fixture();
  await slot.startExecution(input(), ["*.youtube.com"]);
  let completeDestroy, enteredDestroy;
  const entered = new Promise((resolve) => {
    enteredDestroy = resolve;
  });
  slot.destroy.mockImplementation(() => {
    enteredDestroy();
    return new Promise((resolve) => {
      completeDestroy = resolve;
    });
  });
  const recovery = slot.recoverExecution(identity);
  await entered;
  const next = slot.startExecution(input({ jobId: "new", attemptGeneration: 2, slotGeneration: 2 }), ["*.youtube.com"]);
  expect(slot.containerFetch).toHaveBeenCalledTimes(1);
  completeDestroy();
  expect(await recovery).toMatchObject({ stopped: true });
  await next;
  await expect(slot.startExecution(input(), ["*.youtube.com"])).rejects.toThrow();
  expect(slot.containerFetch).toHaveBeenCalledTimes(2);
});

test("recovery without prior execution leaves a durable generation fence", async () => {
  const { slot } = fixture();
  expect(await slot.recoverExecution(identity)).toMatchObject({ stopped: true });
  await expect(slot.startExecution(input(), ["*.youtube.com"])).rejects.toThrow();
  expect(slot.containerFetch).not.toHaveBeenCalled();
});

test("a failed destruction keeps the slot fenced until recovery proves stop", async () => {
  const { slot } = fixture();
  await slot.startExecution(input(), ["*.youtube.com"]);
  slot.destroy.mockRejectedValueOnce(new Error("destroy uncertain"));
  await expect(slot.recoverExecution(identity)).rejects.toThrow("destroy uncertain");
  await expect(slot.startExecution(input({ jobId: "new", slotGeneration: 2 }), ["*.youtube.com"])).rejects.toThrow();
  expect(await slot.recoverExecution(identity)).toMatchObject({ stopped: true });
  await slot.startExecution(input({ jobId: "new", slotGeneration: 2 }), ["*.youtube.com"]);
});

test("stale recovery cannot destroy a newer execution or overwrite its meter", async () => {
  const { slot, values } = fixture();
  await slot.startExecution(input({ jobId: "new", slotGeneration: 2 }), ["*.youtube.com"]);
  expect(await slot.recoverExecution(identity)).toMatchObject({ stopped: false });
  expect(slot.destroy).not.toHaveBeenCalled();
  expect(values.get("execution").identity.jobId).toBe("new");
});

test("a recovered attempt cannot be restarted at a later engine ordinal", async () => {
  const { slot } = fixture();
  await slot.startExecution(input(), ["*.youtube.com"]);
  await slot.recoverExecution(identity);
  await expect(slot.startExecution(input({ startOrdinal: 2 }), ["*.youtube.com"])).rejects.toThrow();
});

test("fallback cannot enlarge cumulative source or wall-time budgets", async () => {
  const { slot, values } = fixture();
  await slot.startExecution(input(), ["*.youtube.com"]);
  expect(await slot.debitOutbound(identity, 800, false)).toBe(true);
  slot.containerFetch.mockImplementation(async () => Response.json(nativeStatus({ state: "failed", stopped: true })));
  await slot.statusExecution(identity);
  slot.containerFetch.mockImplementation(async () => Response.json(nativeStatus()));
  await slot.startExecution(input({ startOrdinal: 2, deadline: new Date(200_000).toISOString() }), ["*.youtube.com"]);
  expect(values.get("execution")).toMatchObject({ sourceBytes: 800, sourceLimit: 1000, deadline: 100_000 });
  expect(await slot.debitOutbound({ ...identity, startOrdinal: 2 }, 201, false)).toBe(false);
});

test("a fatal source cap cannot be reset by fallback", async () => {
  const { slot } = fixture();
  await slot.startExecution(input(), ["*.youtube.com"]);
  expect(await slot.debitOutbound(identity, 1001, false)).toBe(false);
  slot.containerFetch.mockImplementation(async () => Response.json(nativeStatus({ state: "failed", stopped: true })));
  await slot.cancelExecution(identity);
  await expect(slot.startExecution(input({ startOrdinal: 2 }), ["*.youtube.com"])).rejects.toThrow();
});

test("expired attempts cannot start or poll but cancellation has bounded grace", async () => {
  const { slot, advance } = fixture();
  const timeout = vi.spyOn(AbortSignal, "timeout");
  await slot.startExecution(input({ deadline: new Date(500).toISOString() }), ["*.youtube.com"]);
  expect(timeout).toHaveBeenCalledWith(500);
  advance(600);
  await expect(slot.statusExecution(identity)).rejects.toThrow();
  slot.containerFetch.mockImplementation(async () =>
    Response.json(nativeStatus({ state: "cancelled", stopped: true })),
  );
  expect(await slot.cancelExecution(identity)).toMatchObject({ stopped: true, usage: { workMs: 600 } });
  expect(timeout).toHaveBeenLastCalledWith(20_000);
});

test("recovery blocks outbound authorization and byte debits before destruction finishes", async () => {
  const { slot } = fixture();
  await slot.startExecution(input(), ["*.youtube.com"]);
  slot.destroy.mockRejectedValueOnce(new Error("not stopped"));
  await expect(slot.recoverExecution(identity)).rejects.toThrow();
  expect(await slot.authorizeOutbound("https://www.youtube.com/page", "GET")).toBeNull();
  expect(await slot.debitOutbound(identity, 1, false)).toBe(false);
});

test("recovery waits for an in-flight native startup before destroying its container", async () => {
  const { slot } = fixture();
  let finishStart, enterStart;
  const entered = new Promise((resolve) => {
    enterStart = resolve;
  });
  slot.containerFetch.mockImplementationOnce(() => {
    enterStart();
    return new Promise((resolve) => {
      finishStart = resolve;
    });
  });
  const startup = slot.startExecution(input(), ["*.youtube.com"]);
  await entered;
  const recovery = slot.recoverExecution(identity);
  expect(slot.destroy).not.toHaveBeenCalled();
  finishStart(Response.json(nativeStatus()));
  await startup;
  expect(await recovery).toMatchObject({ stopped: true });
  expect(slot.destroy).toHaveBeenCalledTimes(1);
});

test("status response uses the latest authoritative meter, preserving concurrent byte debits", async () => {
  const { slot, values } = fixture();
  await slot.startExecution(input(), ["*.youtube.com"]);
  let finishStatus, enterStatus;
  const entered = new Promise((resolve) => {
    enterStatus = resolve;
  });
  slot.containerFetch.mockImplementationOnce(() => {
    enterStatus();
    return new Promise((resolve) => {
      finishStatus = resolve;
    });
  });
  const pending = slot.statusExecution(identity);
  await entered;
  await slot.debitOutbound(identity, 300, false);
  finishStatus(Response.json(nativeStatus({ state: "failed", stopped: true })));
  expect(await pending).toMatchObject({ usage: { sourceBytes: 300 } });
  expect(values.get("execution").sourceBytes).toBe(300);
});

test("a late status response cannot mark a recovered newer execution stopped", async () => {
  const { slot, values } = fixture();
  await slot.startExecution(input(), ["*.youtube.com"]);
  let finishStatus, enterStatus;
  const entered = new Promise((resolve) => {
    enterStatus = resolve;
  });
  slot.containerFetch.mockImplementationOnce(() => {
    enterStatus();
    return new Promise((resolve) => {
      finishStatus = resolve;
    });
  });
  const pending = slot.statusExecution(identity);
  await entered;
  await slot.recoverExecution(identity);
  await slot.startExecution(input({ jobId: "new", slotGeneration: 2 }), ["*.youtube.com"]);
  finishStatus(Response.json(nativeStatus({ state: "failed", stopped: true })));
  await expect(pending).rejects.toThrow();
  expect(values.get("execution")).toMatchObject({ identity: { jobId: "new" }, stopped: false });
});

test("status and cancellation do not auto-start a missing native container", async () => {
  const { slot, ctx } = fixture();
  await slot.startExecution(input(), ["*.youtube.com"]);
  ctx.container.running = false;
  await expect(slot.statusExecution(identity)).rejects.toThrow("Container is not running.");
  await expect(slot.cancelExecution(identity)).rejects.toThrow("Container is not running.");
  expect(slot.containerFetch).toHaveBeenCalledTimes(1);
});

test("a lifecycle stall requests object eviction before the platform guard limit, retaining its fence", async () => {
  vi.useFakeTimers();
  const { slot, ctx, values } = fixture();
  let finishDestroy, enterDestroy;
  const entered = new Promise((resolve) => {
    enterDestroy = resolve;
  });
  slot.destroy.mockImplementation(() => {
    enterDestroy();
    return new Promise((resolve) => {
      finishDestroy = resolve;
    });
  });
  const recovery = slot.recoverExecution(identity);
  await entered;
  await vi.advanceTimersByTimeAsync(24_999);
  expect(ctx.abort).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(ctx.abort).toHaveBeenCalledExactlyOnceWith("Downloader lifecycle timed out.");
  expect(values.get("recovery").recovering).toBe(true);
  // The mock does not evict the object; release its promise to clean the fixture.
  finishDestroy();
  await recovery;
});

const TRANSFER_BATCH = 256 * 1024;
function chunkedSource(chunks) {
  let index = 0;
  const cancel = vi.fn();
  const stream = new ReadableStream(
    {
      pull(controller) {
        if (index === chunks.length) controller.close();
        else controller.enqueue(chunks[index++]);
      },
      cancel,
    },
    { highWaterMark: 0 },
  );
  return { stream, cancel, readCount: () => index };
}
function outboundEnv(slot) {
  return { DOWNLOAD_CONTAINERS: { idFromString: (value) => value, get: () => slot } };
}
function outboundSlot(storage = false) {
  return {
    authorizeOutbound: vi.fn(async () => ({ identity, storage, timeoutMs: 5_000 })),
    debitOutbound: vi.fn(async () => true),
  };
}

test("outbound metering groups small chunks into exact 256KiB batches under backpressure", async () => {
  const slot = outboundSlot();
  const chunks = Array.from({ length: 1024 }, (_, index) => new Uint8Array(1024).fill(index % 251));
  const source = chunkedSource(chunks);
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(source.stream));
  const response = await DownloaderContainer.outbound(new Request("https://www.youtube.com/video"), outboundEnv(slot), {
    containerId: "slot",
  });
  expect(source.readCount()).toBe(0);
  const actual = new Uint8Array(await response.arrayBuffer());
  expect(actual).toEqual(new Uint8Array(Buffer.concat(chunks)));
  expect(slot.debitOutbound.mock.calls.map(([, bytes]) => bytes)).toEqual(Array(4).fill(TRANSFER_BATCH));
  expect(slot.debitOutbound.mock.calls.every(([key, , storage]) => key === identity && storage === false)).toBe(true);
});

test("an oversized upstream chunk is sliced into bounded batches and an exact EOF tail", async () => {
  const slot = outboundSlot();
  const bytes = Uint8Array.from({ length: 3 * TRANSFER_BATCH + 37 }, (_, index) => index % 251);
  const source = chunkedSource([new Uint8Array(0), bytes, new Uint8Array(0)]);
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(source.stream));
  const response = await DownloaderContainer.outbound(new Request("https://www.youtube.com/video"), outboundEnv(slot), {
    containerId: "slot",
  });
  expect(Buffer.from(await response.arrayBuffer()).equals(bytes)).toBe(true);
  expect(slot.debitOutbound.mock.calls.map(([, count]) => count)).toEqual([
    TRANSFER_BATCH,
    TRANSFER_BATCH,
    TRANSFER_BATCH,
    37,
  ]);
});

test("a denied batch is never forwarded and cancels the upstream reader", async () => {
  const slot = outboundSlot();
  slot.debitOutbound.mockResolvedValueOnce(true).mockResolvedValue(false);
  const source = chunkedSource(Array.from({ length: 1024 }, () => new Uint8Array(1024)));
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(source.stream));
  const response = await DownloaderContainer.outbound(new Request("https://www.youtube.com/video"), outboundEnv(slot), {
    containerId: "slot",
  });
  const reader = response.body.getReader();
  expect((await reader.read()).value.byteLength).toBe(TRANSFER_BATCH);
  await expect(reader.read()).rejects.toThrow("Transfer budget exceeded");
  expect(source.cancel).toHaveBeenCalledTimes(1);
  expect(source.readCount()).toBe(512);
  expect(slot.debitOutbound).toHaveBeenCalledTimes(2);
});

test("upload bodies share exact batching and remain charged as storage transfers", async () => {
  const slot = outboundSlot(true);
  const bytes = new Uint8Array(TRANSFER_BATCH + 13).fill(7);
  const source = chunkedSource([bytes]);
  let received;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
    received = new Uint8Array(await new Response(options.body).arrayBuffer());
    return new Response(null, { status: 204 });
  });
  const response = await DownloaderContainer.outbound(
    new Request("https://storage.example/object", { method: "PUT", body: source.stream, duplex: "half" }),
    outboundEnv(slot),
    { containerId: "slot" },
  );
  expect(response.status).toBe(204);
  expect(received).toEqual(bytes);
  expect(slot.debitOutbound.mock.calls).toEqual([
    [identity, TRANSFER_BATCH, true],
    [identity, 13, true],
  ]);
});

test("recovery fences still deny a buffered outbound batch before it reaches the engine", async () => {
  const { slot } = fixture();
  await slot.startExecution(input({ limits: { ...input().limits, sourceBytes: 4 * TRANSFER_BATCH } }), [
    "*.youtube.com",
  ]);
  const source = chunkedSource(Array.from({ length: 1024 }, () => new Uint8Array(1024)));
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(source.stream));
  const response = await DownloaderContainer.outbound(new Request("https://www.youtube.com/video"), outboundEnv(slot), {
    containerId: "slot",
  });
  const reader = response.body.getReader();
  expect((await reader.read()).value.byteLength).toBe(TRANSFER_BATCH);
  await slot.recoverExecution(identity);
  await expect(reader.read()).rejects.toThrow("Transfer budget exceeded");
  expect(source.cancel).toHaveBeenCalledTimes(1);
});

test("consumer cancellation accounts for a read oversized remainder without forwarding it", async () => {
  const slot = outboundSlot();
  const source = chunkedSource([new Uint8Array(4 * TRANSFER_BATCH)]);
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(source.stream));
  const response = await DownloaderContainer.outbound(new Request("https://www.youtube.com/video"), outboundEnv(slot), {
    containerId: "slot",
  });
  const reader = response.body.getReader();
  expect((await reader.read()).value.byteLength).toBe(TRANSFER_BATCH);
  await reader.cancel();
  expect(slot.debitOutbound.mock.calls.map(([, count]) => count)).toEqual([TRANSFER_BATCH, 3 * TRANSFER_BATCH]);
  expect(source.cancel).toHaveBeenCalledTimes(1);
});

test("an upstream read failure accounts for the accumulated tail before failing closed", async () => {
  const slot = outboundSlot();
  let reads = 0;
  const stream = new ReadableStream(
    {
      pull(controller) {
        if (reads++ === 0) controller.enqueue(new Uint8Array(777));
        else controller.error(new Error("upstream interrupted"));
      },
    },
    { highWaterMark: 0 },
  );
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(stream));
  const response = await DownloaderContainer.outbound(new Request("https://www.youtube.com/video"), outboundEnv(slot), {
    containerId: "slot",
  });
  await expect(response.arrayBuffer()).rejects.toThrow("upstream interrupted");
  expect(slot.debitOutbound.mock.calls).toEqual([[identity, 777, false]]);
});

test("denial does not double-debit its rejected batch when an oversized remainder is discarded", async () => {
  const slot = outboundSlot();
  slot.debitOutbound.mockResolvedValue(false);
  const source = chunkedSource([new Uint8Array(2 * TRANSFER_BATCH + 17)]);
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(source.stream));
  const response = await DownloaderContainer.outbound(new Request("https://www.youtube.com/video"), outboundEnv(slot), {
    containerId: "slot",
  });
  await expect(response.arrayBuffer()).rejects.toThrow("Transfer budget exceeded");
  expect(slot.debitOutbound.mock.calls.map(([, count]) => count)).toEqual([TRANSFER_BATCH, TRANSFER_BATCH + 17]);
  expect(source.cancel).toHaveBeenCalledTimes(1);
});

test("cancelling while a batch is still filling accounts only the bytes already read", async () => {
  const slot = outboundSlot();
  let reads = 0,
    releasePull,
    enterWaiting;
  const waiting = new Promise((resolve) => {
    enterWaiting = resolve;
  });
  const cancel = vi.fn();
  const stream = new ReadableStream(
    {
      pull(controller) {
        if (reads++ === 0) controller.enqueue(new Uint8Array(31));
        else {
          enterWaiting();
          return new Promise((resolve) => {
            releasePull = resolve;
          });
        }
      },
      cancel,
    },
    { highWaterMark: 0 },
  );
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(stream));
  const response = await DownloaderContainer.outbound(new Request("https://www.youtube.com/video"), outboundEnv(slot), {
    containerId: "slot",
  });
  const reader = response.body.getReader();
  const pending = reader.read();
  await waiting;
  await reader.cancel();
  expect(await pending).toEqual({ done: true, value: undefined });
  expect(slot.debitOutbound.mock.calls).toEqual([[identity, 31, false]]);
  expect(cancel).toHaveBeenCalledTimes(1);
  releasePull();
});

test("cancelling during an in-flight debit never charges the batch twice or changes its fence", async () => {
  const slot = outboundSlot();
  let finishDebit, enterDebit;
  const entered = new Promise((resolve) => {
    enterDebit = resolve;
  });
  slot.debitOutbound.mockImplementationOnce(() => {
    enterDebit();
    return new Promise((resolve) => {
      finishDebit = resolve;
    });
  });
  const source = chunkedSource([new Uint8Array(2 * TRANSFER_BATCH + 13)]);
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(source.stream));
  const response = await DownloaderContainer.outbound(new Request("https://www.youtube.com/video"), outboundEnv(slot), {
    containerId: "slot",
  });
  const reader = response.body.getReader();
  const pending = reader.read();
  await entered;
  await reader.cancel();
  finishDebit(true);
  expect(await pending).toEqual({ done: true, value: undefined });
  expect(slot.debitOutbound.mock.calls).toEqual([
    [identity, TRANSFER_BATCH, false],
    [identity, TRANSFER_BATCH + 13, false],
  ]);
  expect(source.cancel).toHaveBeenCalledTimes(1);
});
