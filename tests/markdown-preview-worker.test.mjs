import assert from "node:assert/strict";
import test from "node:test";

import { createMarkdownHighlightClient } from "../tools/markdown-previewer/highlightClient.ts";

function setup(t) {
  const workers = [];
  class FakeWorker {
    messages = [];
    terminated = false;
    constructor() {
      workers.push(this);
    }
    postMessage(message) {
      this.messages.push(message);
    }
    terminate() {
      this.terminated = true;
    }
    respond(id, html) {
      this.onmessage({ data: { id, html } });
    }
  }
  const originalWorker = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  Object.defineProperty(globalThis, "Worker", { configurable: true, writable: true, value: FakeWorker });
  const client = createMarkdownHighlightClient();
  t.after(() => {
    client.dispose();
    if (originalWorker) Object.defineProperty(globalThis, "Worker", originalWorker);
    else delete globalThis.Worker;
  });
  return { client, workers };
}

test("the highlighting worker starts lazily and routes overlapping replies", async (t) => {
  const { client, workers } = setup(t);
  assert.equal(workers.length, 0);
  const first = client.highlight("const first = 1;", "js");
  const second = client.highlight("second");
  assert.equal(workers.length, 1);
  const worker = workers[0];
  const [firstMessage, secondMessage] = worker.messages;
  assert.deepEqual(firstMessage, { id: 1, operation: "highlight", code: "const first = 1;", language: "js" });
  worker.respond(secondMessage.id, "second result");
  worker.respond(firstMessage.id, "first result");
  assert.deepEqual(await Promise.all([first, second]), ["first result", "second result"]);
});

test("export requests include the complete source and settings independent of viewed blocks", async (t) => {
  const { client, workers } = setup(t);
  const source = `${"Paragraph.\n\n".repeat(10_000)}# Last section`;
  const settings = { syntaxHighlighting: true, safeLinks: false };
  const exported = client.exportHtml(source, settings);
  const worker = workers[0];
  assert.deepEqual(worker.messages[0], { id: 1, operation: "export", source, settings });
  worker.respond(1, "<h1>Full export</h1>");
  assert.equal(await exported, "<h1>Full export</h1>");
});

test("disposing cancels pending work and stale worker events cannot affect a restarted client", async (t) => {
  const { client, workers } = setup(t);
  const first = client.highlight("old");
  const second = client.exportHtml("old document", {});
  const canceled = Promise.all([
    assert.rejects(first, { name: "AbortError" }),
    assert.rejects(second, { name: "AbortError" }),
  ]);
  client.dispose();
  await canceled;
  assert.equal(workers[0].terminated, true);

  const current = client.highlight("new");
  const latest = workers[1];
  workers[0].respond(latest.messages[0].id, "stale response");
  workers[0].onerror();
  workers[0].onmessageerror();
  assert.equal(latest.terminated, false);
  latest.respond(latest.messages[0].id, "new response");
  assert.equal(await current, "new response");
});

test("a worker failure rejects pending requests and a later request can retry", async (t) => {
  const { client, workers } = setup(t);
  const failed = client.highlight("first");
  const rejected = assert.rejects(failed, /Could not start Markdown highlighting/);
  workers[0].onerror();
  await rejected;
  assert.equal(workers[0].terminated, true);
  const retried = client.highlight("second");
  workers[1].respond(workers[1].messages[0].id, "recovered");
  assert.equal(await retried, "recovered");
});

test("a failed export rejects only its request", async (t) => {
  const { client, workers } = setup(t);
  const exported = client.exportHtml("document", {});
  const highlighted = client.highlight("code");
  const rejected = assert.rejects(exported, /Cannot export/);
  workers[0].onmessage({ data: { id: 1, error: "Cannot export" } });
  workers[0].respond(2, "code result");
  await rejected;
  assert.equal(await highlighted, "code result");
  assert.equal(workers[0].terminated, false);
});
