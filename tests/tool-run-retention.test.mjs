import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const hookUrl = new URL("../lib/tool-framework/useToolRun.ts", import.meta.url).href;
const harnessKey = "__canopyToolRunRetentionHarness";
const originalWorker = globalThis.Worker;
const stub = (source) => ({ shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` });
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === hookUrl) {
      if (specifier === "react")
        return stub(`
          const harness = () => globalThis.${harnessKey};
          export const useRef = current => ({ current });
          export const useCallback = callback => callback;
          export const useEffect = effect => { harness().cleanups.push(effect()); };
          export const useState = initial => {
            harness().state = typeof initial === 'function' ? initial() : initial;
            return [harness().state, next => { harness().state = next; }];
          };
        `);
      if (specifier === "./artifacts")
        return stub(`
          export const cleanupArtifactJobWithRetry = async jobId => {
            globalThis.${harnessKey}.cleaned.push(jobId);
          };
        `);
      if (specifier.startsWith("./")) return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { useToolRun } = await import(hookUrl);

test.after(() => {
  hooks.deregister();
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
  t.after(dispose);
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
  assert.equal(cleaned.includes(first.jobId), false);
  complete(second);
  assert.equal(cleaned.includes(first.jobId), false);
  const third = start();
  assert.equal(cleaned.includes(second.jobId), false);
  host.cancel();
  third.worker.emit({ type: "canceled", jobId: third.jobId });
  assert.equal(cleaned.includes(first.jobId), false);
  assert.equal(cleaned.includes(second.jobId), false);
  host.cleanupArtifacts();
  assert.ok(cleaned.includes(first.jobId));
  assert.ok(cleaned.includes(second.jobId));
});

test("stale success and replacement failure only remove their own artifacts", (t) => {
  const { host, start, complete, cleaned, getState } = createHost(t);
  const original = start();
  complete(original);
  const superseded = start();
  const latest = start();
  complete(superseded);
  assert.equal(getState().jobId, latest.jobId);
  assert.equal(getState().status, "running");
  assert.ok(cleaned.includes(superseded.jobId));
  assert.equal(cleaned.includes(original.jobId), false);
  latest.worker.emit({ type: "failure", jobId: latest.jobId, code: "failed", message: "Unable to process" });
  assert.equal(getState().status, "failed");
  assert.equal(cleaned.includes(original.jobId), false);
  assert.ok(cleaned.includes(latest.jobId));
  host.reset();
  assert.equal(getState().status, "idle");
  assert.ok(cleaned.includes(original.jobId));
});

test("releasing an undelivered completed replacement keeps the displayed result alive", (t) => {
  const { host, start, complete, cleaned } = createHost(t);
  const displayed = start();
  complete(displayed);
  const undelivered = start();
  complete(undelivered);
  host.cleanupArtifacts(undelivered.jobId);
  assert.ok(cleaned.includes(undelivered.jobId));
  assert.equal(cleaned.includes(displayed.jobId), false);
  const cleanupCount = cleaned.length;
  host.cleanupArtifacts(undelivered.jobId);
  assert.equal(cleaned.length, cleanupCount);
  const pending = start();
  host.cleanupArtifacts(pending.jobId);
  assert.equal(cleaned.includes(pending.jobId), false);
  assert.equal(cleaned.includes(displayed.jobId), false);
  host.cleanupArtifacts();
  assert.ok(cleaned.includes(displayed.jobId));
});

test("a canceled job's late success cannot replace or delete the retained output", (t) => {
  const { host, start, complete, cleaned, getState } = createHost(t);
  const original = start();
  complete(original);
  const canceled = start();
  host.cancel();
  complete(canceled);
  assert.equal(getState().status, "canceled");
  assert.equal(cleaned.includes(original.jobId), false);
  assert.ok(cleaned.includes(canceled.jobId));
});

test("unmount releases retained completed jobs and an unfinished replacement", (t) => {
  const { start, complete, cleaned, dispose } = createHost(t);
  const original = start();
  complete(original);
  const pending = start();
  assert.equal(cleaned.includes(original.jobId), false);
  dispose();
  assert.ok(cleaned.includes(original.jobId));
  assert.ok(cleaned.includes(pending.jobId));
});
