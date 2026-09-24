import { expect, onTestFinished, test } from "vitest";
import { createMarkdownHighlightClient } from "../tools/markdown-previewer/highlightClient.ts";

function setup() {
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
  onTestFinished(() => {
    client.dispose();
    if (originalWorker) Object.defineProperty(globalThis, "Worker", originalWorker);
    else delete globalThis.Worker;
  });
  return { client, workers };
}

test("the highlighting worker starts lazily and routes overlapping replies", async () => {
  const { client, workers } = setup();
  expect(workers.length).toBe(0);
  const first = client.highlight("const first = 1;", "js");
  const second = client.highlight("second");
  expect(workers.length).toBe(1);
  const worker = workers[0];
  const [firstMessage, secondMessage] = worker.messages;
  expect(firstMessage).toEqual({ id: 1, operation: "highlight", code: "const first = 1;", language: "js" });
  worker.respond(secondMessage.id, "second result");
  worker.respond(firstMessage.id, "first result");
  expect(await Promise.all([first, second])).toEqual(["first result", "second result"]);
});

test("export requests include the complete source and settings independent of viewed blocks", async () => {
  const { client, workers } = setup();
  const source = `${"Paragraph.\n\n".repeat(10_000)}# Last section`;
  const settings = { syntaxHighlighting: true, safeLinks: false };
  const exported = client.exportHtml(source, settings);
  const worker = workers[0];
  expect(worker.messages[0]).toEqual({ id: 1, operation: "export", source, settings });
  worker.respond(1, "<h1>Full export</h1>");
  expect(await exported).toBe("<h1>Full export</h1>");
});

test("disposing cancels pending work and stale worker events cannot affect a restarted client", async () => {
  const { client, workers } = setup();
  const first = client.highlight("old");
  const second = client.exportHtml("old document", {});
  const canceled = Promise.all([
    expect(first).rejects.toMatchObject({ name: "AbortError" }),
    expect(second).rejects.toMatchObject({ name: "AbortError" }),
  ]);
  client.dispose();
  await canceled;
  expect(workers[0].terminated).toBe(true);

  const current = client.highlight("new");
  const latest = workers[1];
  workers[0].respond(latest.messages[0].id, "stale response");
  workers[0].onerror();
  workers[0].onmessageerror();
  expect(latest.terminated).toBe(false);
  latest.respond(latest.messages[0].id, "new response");
  expect(await current).toBe("new response");
});

test("a worker failure rejects pending requests and a later request can retry", async () => {
  const { client, workers } = setup();
  const failed = client.highlight("first");
  const rejected = expect(failed).rejects.toThrow(/Could not start Markdown highlighting/);
  workers[0].onerror();
  await rejected;
  expect(workers[0].terminated).toBe(true);
  const retried = client.highlight("second");
  workers[1].respond(workers[1].messages[0].id, "recovered");
  expect(await retried).toBe("recovered");
});

test("a failed export rejects only its request", async () => {
  const { client, workers } = setup();
  const exported = client.exportHtml("document", {});
  const highlighted = client.highlight("code");
  const rejected = expect(exported).rejects.toThrow(/Cannot export/);
  workers[0].onmessage({ data: { id: 1, error: "Cannot export" } });
  workers[0].respond(2, "code result");
  await rejected;
  expect(await highlighted).toBe("code result");
  expect(workers[0].terminated).toBe(false);
});
