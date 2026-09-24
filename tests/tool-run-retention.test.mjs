import { afterAll, expect, test, vi } from "vitest";

const harnessKey = "__canopyToolRunRetentionHarness";
const originalWorker = globalThis.Worker;

// The factory may only reference globals, so it reads the harness off globalThis
// (populated per-test by createHost) instead of a module-scoped variable.
vi.mock("react", () => ({
  useRef: (current) => ({ current }),
  useCallback: (callback) => callback,
  useEffect: (effect) => {
    globalThis.__canopyToolRunRetentionHarness.cleanups.push(effect());
  },
  useState: (initial) => {
    const harness = globalThis.__canopyToolRunRetentionHarness;
    harness.state = typeof initial === "function" ? initial() : initial;
    return [
      harness.state,
      (next) => {
        harness.state = next;
      },
    ];
  },
}));
vi.mock("@/lib/tool-framework/artifacts.ts", () => ({
  cleanupArtifactJobWithRetry: async (jobId) => {
    globalThis.__canopyToolRunRetentionHarness.cleaned.push(jobId);
  },
}));

const { useToolRun } = await import("@/lib/tool-framework/useToolRun.ts");

afterAll(() => {
  delete globalThis[harnessKey];
  if (originalWorker) globalThis.Worker = originalWorker;
  else delete globalThis.Worker;
});

function createHost(t) {
  const harness = { cleaned: [], cleanups: [], state: null, workers: [] };
  globalThis[harnessKey] = harness;
  globalThis.Worker = class {
    constructor() {
      harness.workers.push(this);
    }
    postMessage() {}
    terminate() {}
    emit(data) {
      this.onmessage?.({ data });
    }
  };
  const host = useToolRun();
  const dispose = () => {
    for (const cleanup of harness.cleanups.splice(0)) cleanup?.();
  };
  t.onTestFinished(dispose);
  const start = () => {
    const jobId = host.start({ key: "test-tool", settings: {} });
    return { jobId, worker: harness.workers.at(-1) };
  };
  const complete = ({ jobId, worker }) =>
    worker.emit({ type: "success", jobId, result: { render: "files", files: [] } });
  return { ...harness, host, start, complete, dispose, getState: () => harness.state };
}

test("completed output stays readable through replacement success until the runtime releases it", (t) => {
  const { host, start, complete, cleaned } = createHost(t);
  const first = start();
  complete(first);
  const second = start();
  expect(cleaned.includes(first.jobId)).toBe(false);
  complete(second);
  expect(cleaned.includes(first.jobId)).toBe(false);
  const third = start();
  expect(cleaned.includes(second.jobId)).toBe(false);
  host.cancel();
  third.worker.emit({ type: "canceled", jobId: third.jobId });
  expect(cleaned.includes(first.jobId)).toBe(false);
  expect(cleaned.includes(second.jobId)).toBe(false);
  host.cleanupArtifacts();
  expect(cleaned.includes(first.jobId)).toBeTruthy();
  expect(cleaned.includes(second.jobId)).toBeTruthy();
});

test("stale success and replacement failure only remove their own artifacts", (t) => {
  const { host, start, complete, cleaned, getState } = createHost(t);
  const original = start();
  complete(original);
  const superseded = start();
  const latest = start();
  complete(superseded);
  expect(getState().jobId).toBe(latest.jobId);
  expect(getState().status).toBe("running");
  expect(cleaned.includes(superseded.jobId)).toBeTruthy();
  expect(cleaned.includes(original.jobId)).toBe(false);
  latest.worker.emit({ type: "failure", jobId: latest.jobId, code: "failed", message: "Unable to process" });
  expect(getState().status).toBe("failed");
  expect(cleaned.includes(original.jobId)).toBe(false);
  expect(cleaned.includes(latest.jobId)).toBeTruthy();
  host.reset();
  expect(getState().status).toBe("idle");
  expect(cleaned.includes(original.jobId)).toBeTruthy();
});

test("releasing an undelivered completed replacement keeps the displayed result alive", (t) => {
  const { host, start, complete, cleaned } = createHost(t);
  const displayed = start();
  complete(displayed);
  const undelivered = start();
  complete(undelivered);
  host.cleanupArtifacts(undelivered.jobId);
  expect(cleaned.includes(undelivered.jobId)).toBeTruthy();
  expect(cleaned.includes(displayed.jobId)).toBe(false);
  const cleanupCount = cleaned.length;
  host.cleanupArtifacts(undelivered.jobId);
  expect(cleaned.length).toBe(cleanupCount);
  const pending = start();
  host.cleanupArtifacts(pending.jobId);
  expect(cleaned.includes(pending.jobId)).toBe(false);
  expect(cleaned.includes(displayed.jobId)).toBe(false);
  host.cleanupArtifacts();
  expect(cleaned.includes(displayed.jobId)).toBeTruthy();
});

test("a canceled job's late success cannot replace or delete the retained output", (t) => {
  const { host, start, complete, cleaned, getState } = createHost(t);
  const original = start();
  complete(original);
  const canceled = start();
  host.cancel();
  complete(canceled);
  expect(getState().status).toBe("canceled");
  expect(cleaned.includes(original.jobId)).toBe(false);
  expect(cleaned.includes(canceled.jobId)).toBeTruthy();
});

test("unmount releases retained completed jobs and an unfinished replacement", (t) => {
  const { start, complete, cleaned, dispose } = createHost(t);
  const original = start();
  complete(original);
  const pending = start();
  expect(cleaned.includes(original.jobId)).toBe(false);
  dispose();
  expect(cleaned.includes(original.jobId)).toBeTruthy();
  expect(cleaned.includes(pending.jobId)).toBeTruthy();
});
