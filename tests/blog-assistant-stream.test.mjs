import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { transformSync } from "next/dist/build/swc/index.js";

const hooks = registerHooks({
  load(url, context, next) {
    if (!url.endsWith("/assistantApi.ts")) return next(url, context);
    return {
      format: "module",
      shortCircuit: true,
      source: transformSync(readFileSync(new URL(url), "utf8"), {
        filename: new URL(url).pathname,
        jsc: { parser: { syntax: "typescript" } },
        module: { type: "es6" },
      }).code,
    };
  },
});
const { streamAssistantRun } = await import("../app/admin/(protected)/blog/lib/assistantApi.ts");
const originalFetch = globalThis.fetch;
const request = {
  operation: "chat",
  clientRequestId: "request",
  message: "Hello",
  editorJson: { type: "doc", content: [] },
};
const run = { id: "run", status: "completed" };
const encode = (value) => new TextEncoder().encode(JSON.stringify(value) + "\n");
test.afterEach(() => {
  globalThis.fetch = originalFetch;
});
test.after(() => hooks.deregister());

test("delivers split UTF-8 text and structured snapshots before the completion event", async () => {
  let controller;
  const body = new ReadableStream({
    start(value) {
      controller = value;
    },
  });
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls++;
    assert.deepEqual(JSON.parse(options.body), request);
    return new Response(body);
  };
  const events = [];
  const pending = streamAssistantRun(request, new AbortController().signal, (event) => events.push(event));
  const bytes = encode({ type: "text-delta", text: "Hi 👋" });
  const split = bytes.indexOf(0xf0) + 2;
  controller.enqueue(bytes.slice(0, split));
  controller.enqueue(bytes.slice(split));
  controller.enqueue(encode({ type: "text", text: "Partial replacement" }));
  await setImmediate();
  assert.deepEqual(
    events.map((event) => event.text),
    ["Hi 👋", "Partial replacement"],
  );
  controller.enqueue(encode({ type: "completed", run }));
  controller.close();
  assert.deepEqual(await pending, run);
  assert.equal(calls, 1);
});

test("truncated streams fail without polling or silently retrying", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(encode({ type: "text-delta", text: "Partial" }));
  };
  await assert.rejects(
    streamAssistantRun(request, new AbortController().signal, () => {}),
    /Connection interrupted/,
  );
  assert.equal(calls, 1);
});

test("abort releases a waiting reader and suppresses late presentation", async () => {
  let cancelled = false;
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
    );
  const abort = new AbortController();
  const events = [];
  const pending = streamAssistantRun(request, abort.signal, (event) => events.push(event));
  await setImmediate();
  abort.abort();
  await assert.rejects(pending, (error) => error.name === "AbortError");
  assert.equal(cancelled, true);
  assert.deepEqual(events, []);
});

test("HTTP rejection and streamed failure preserve the server's recovery message", async () => {
  globalThis.fetch = async () => Response.json({ error: "Thread not found" }, { status: 404 });
  await assert.rejects(
    streamAssistantRun(request, new AbortController().signal, () => {}),
    (error) => error.status === 404 && error.message === "Thread not found",
  );
  const failure = { type: "error", message: "Provider stopped", run: { ...run, status: "failed" } };
  globalThis.fetch = async () => new Response(encode(failure));
  const events = [];
  await assert.rejects(
    streamAssistantRun(request, new AbortController().signal, (event) => events.push(event)),
    /Provider stopped/,
  );
  assert.deepEqual(events, [failure]);
});
