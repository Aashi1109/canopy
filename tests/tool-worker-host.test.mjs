import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { createToolRunFile } from "../lib/tool-framework/workerProtocol.ts";

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
      if (specifier.startsWith("../../tools/test-") && specifier.endsWith("/definition"))
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

function dispatch(key, input = {}) {
  return new Promise((resolve) => {
    state.receive = resolve;
    state.listener({
      data: { type: "run", jobId: key, key, files: [], settings: {}, text: "https://example.com", ...input },
    });
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

function workerFile(file) {
  return createToolRunFile(file.name, file);
}

test(
  "the actual Markdown worker accepts a large uploaded .md file without a MIME type",
  { timeout: 5000 },
  async () => {
    const paragraph = "Every uploaded paragraph must remain in the complete preview.\n\n";
    const count = Math.floor(1_940_000 / paragraph.length);
    const source = paragraph.repeat(count) + "# Last section\n\nFinal uploaded content.";
    const file = new File([source], "large-document.md");
    assert.ok(file.size > 1_900_000 && file.size < 2_000_000);
    const response = await dispatch("markdown-previewer", { files: [workerFile(file)], text: await file.text() });
    assert.equal(response.type, "success", JSON.stringify(response));
    assert.equal(response.result.render, "html");
    assert.equal(response.result.deferCodeHighlighting, true);
    assert.match(response.result.html, /<h1>Last section<\/h1>/);
    assert.match(response.result.html, /Final uploaded content\./);
    assert.equal((response.result.html.match(/Every uploaded paragraph must remain/g) ?? []).length, count);
  },
);

test("the actual Markdown worker still accepts text without an uploaded file", async () => {
  const response = await dispatch("markdown-previewer", { text: "# Typed Markdown\n\n**Complete text**" });
  assert.equal(response.type, "success", JSON.stringify(response));
  assert.equal(response.result.render, "html");
  assert.match(response.result.html, /<h1>Typed Markdown<\/h1>/);
  assert.match(response.result.html, /<strong>Complete text<\/strong>/);
});

test("Markdown uploads accept declared text extensions and MIME types", async (t) => {
  for (const [name, type] of [
    ["README.MD", ""],
    ["readme.markdown", ""],
    ["notes.txt", "text/plain"],
    ["readme", "text/markdown"],
  ]) {
    await t.test(`${name} (${type || "no MIME"})`, async () => {
      const source = "# Uploaded document\n\nAll content is retained.";
      const file = new File([source], name, { type });
      const response = await dispatch("markdown-previewer", { files: [workerFile(file)], text: await file.text() });
      assert.equal(response.type, "success", JSON.stringify(response));
      assert.match(response.result.html, /<h1>Uploaded document<\/h1>/);
      assert.match(response.result.html, /All content is retained\./);
    });
  }
});

test("Markdown uploads accept the 2,000,000-byte limit without truncating the final content", async () => {
  const ending = "\n\n# Exact limit\n\nFinal boundary content.";
  const source = "a".repeat(2_000_000 - ending.length) + ending;
  const file = new File([source], "exact-limit.md");
  assert.equal(file.size, 2_000_000);
  const response = await dispatch("markdown-previewer", { files: [workerFile(file)], text: await file.text() });
  assert.equal(response.type, "success", JSON.stringify(response));
  assert.match(response.result.html, /<h1>Exact limit<\/h1>/);
  assert.match(response.result.html, /Final boundary content\./);
  assert.equal(response.result.deferCodeHighlighting, true);
});

test("the actual Markdown worker rejects unsupported, oversized, empty and multiple uploads", async (t) => {
  const cases = [
    {
      label: "unsupported extension and MIME",
      files: [new File(["# Contents"], "document.png", { type: "image/png" })],
      code: "unsupported-type",
    },
    {
      label: "one byte above the upload limit",
      files: [new File(["a".repeat(2_000_001)], "too-large.md")],
      code: "file-too-large",
    },
    {
      label: "empty file",
      files: [new File([], "empty.md")],
      code: "invalid-size",
    },
    {
      label: "multiple files",
      files: [new File(["# One"], "one.md"), new File(["# Two"], "two.md")],
      code: "too-many-files",
    },
  ];
  for (const { label, files, code } of cases) {
    await t.test(label, async () => {
      const response = await dispatch("markdown-previewer", { files: files.map(workerFile), text: "# Input" });
      assert.equal(response.type, "failure", JSON.stringify(response));
      assert.equal(response.code, code);
    });
  }
});
