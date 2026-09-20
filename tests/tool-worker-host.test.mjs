import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const workerUrl = new URL("../lib/tool-framework/tool.worker.ts", import.meta.url).href;
const state = { listener: null, receive: null };
const originalAddEventListener = globalThis.addEventListener;
const originalPostMessage = globalThis.postMessage;
globalThis.addEventListener = (_type, listener) => {
  state.listener = listener;
};
globalThis.postMessage = (message) => {
  state.receive?.(message);
};

const stub = (source) => ({ shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` });
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === workerUrl) {
      if (specifier === "./artifacts")
        return stub(`
        export class ArtifactStorageError extends Error {}
        export const cleanupArtifactJobWithRetry = async () => {};
        export const createArtifactWriter = () => ({ write: async () => {} });
      `);
      if (specifier === "./fileGuard") return stub("export const assertRunnableFiles = async () => {};");
      if (specifier.endsWith("/definition"))
        return stub("export default { input: { kind: 'text' }, settings: { fields: {} } };");
      if (specifier === "../../tools/test-server-tool/run.worker") {
        throw Object.assign(new Error(`Cannot find module '${specifier}'`), { code: "MODULE_NOT_FOUND" });
      }
      if (specifier === "../../tools/test-broken-worker/run.worker") {
        return stub("export const run = async () => { throw new Error('private execution details'); };");
      }
      if (specifier === "../../tools/test-broken-module/run.worker") {
        throw Object.assign(new Error("Cannot find module 'missing-package'"), { code: "MODULE_NOT_FOUND" });
      }
    }
    if (
      context.parentURL?.startsWith(new URL("../lib/", import.meta.url).href) &&
      specifier.startsWith(".") &&
      !/\.[cm]?[jt]s$/.test(specifier)
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

test.after(() => {
  hooks.deregister();
  if (originalAddEventListener) globalThis.addEventListener = originalAddEventListener;
  else delete globalThis.addEventListener;
  if (originalPostMessage) globalThis.postMessage = originalPostMessage;
  else delete globalThis.postMessage;
});

await import(workerUrl);

function dispatch(key) {
  return new Promise((resolve) => {
    state.receive = resolve;
    state.listener({ data: { type: "run", jobId: key, key, files: [], settings: {}, text: "https://example.com" } });
  });
}

test("a missing worker implementation reports unknown-tool so the caller can use the server host", async () => {
  const response = await dispatch("test-server-tool");
  assert.equal(response.type, "failure");
  assert.equal(response.code, "unknown-tool");
});

test("worker execution and dependency failures remain processing failures", async () => {
  for (const key of ["test-broken-worker", "test-broken-module"]) {
    const response = await dispatch(key);
    assert.equal(response.type, "failure");
    assert.equal(response.code, "processing-failed");
    assert.equal(response.message.includes("private"), false);
  }
});
