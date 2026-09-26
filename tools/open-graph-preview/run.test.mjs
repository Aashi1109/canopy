import assert from "node:assert/strict";
import { test, afterEach, vi } from "vitest";
import { Readable } from "node:stream";
import { inspectPage } from "./run.server.ts";

// preview.test.mjs covers parsing, redirects, SSRF, byte limits,
// image validation/deduplication, DNS cancellation, and both deployment transports.
const htmlResponse = (body) => ({
  status: 200,
  headers: new Headers({ "content-type": "text/html" }),
  body: Readable.from([Buffer.from(body)]),
});
const publicAddress = { address: "93.184.216.34", family: 4 };

afterEach(() => vi.restoreAllMocks());

test("Open Graph request timeout reports a retryable failure", async () => {
  const inspectionTimeout = new AbortController();
  const requestTimeout = new AbortController();
  vi.spyOn(AbortSignal, "timeout")
    .mockReturnValueOnce(inspectionTimeout.signal)
    .mockReturnValueOnce(requestTimeout.signal);
  const operation = inspectPage("example.com", new AbortController().signal, {
    resolve: () => new Promise(() => {}),
    request: vi.fn(),
  });
  const rejection = assert.rejects(operation, { code: "request-timeout" });
  requestTimeout.abort(new DOMException("The operation timed out", "TimeoutError"));
  await rejection;
});

test("Open Graph inspection reports DNS and connection failures without a partial result", async () => {
  for (const network of [
    {
      resolve: async () => {
        throw new Error("DNS unavailable");
      },
      request: vi.fn(),
    },
    {
      resolve: async () => [publicAddress],
      request: async () => {
        throw new Error("TLS rejected");
      },
    },
  ]) {
    await assert.rejects(inspectPage("example.com", new AbortController().signal, network), {
      code: "unreachable-url",
    });
  }
});

test("Open Graph image connection failure preserves metadata and an actionable warning", async () => {
  let requests = 0;
  const result = await inspectPage("example.com", new AbortController().signal, {
    resolve: async () => [publicAddress],
    request: async () => {
      if (++requests === 1)
        return htmlResponse(
          '<meta property="og:title" content="Available title"><meta property="og:image" content="/missing.png">',
        );
      throw new Error("connection lost");
    },
  });
  assert.equal(result.metadata.title, "Available title");
  assert.equal(result.metadata.image.previewUrl, null);
  assert.ok(result.checks.some((check) => check.property === "image:fetch" && check.level === "warn"));
  assert.equal(result.downloadName, "open-graph-tags.html");
});

test("Open Graph cancellation during image fetching aborts the whole operation", async () => {
  const controller = new AbortController();
  let notifyImage;
  const imageStarted = new Promise((resolve) => {
    notifyImage = resolve;
  });
  let requests = 0;
  const operation = inspectPage("example.com", controller.signal, {
    resolve: async () => [publicAddress],
    request: async () => {
      if (++requests === 1) return htmlResponse('<meta property="og:image" content="/cover.png">');
      notifyImage();
      return new Promise(() => {});
    },
  });
  const rejection = assert.rejects(operation, { name: "AbortError" });
  await imageStarted;
  controller.abort();
  await rejection;
});
