import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { run } from "./run.ts";

const mermaid = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }));
vi.mock("mermaid", () => ({ default: mermaid }));

const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>A → B &amp; Café</text></svg>';
const context = (text, signal = new AbortController().signal) => ({ input: { text, files: [] }, settings: {}, signal });

beforeEach(() => {
  mermaid.initialize.mockReset();
  mermaid.render.mockReset().mockResolvedValue({ svg });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("diagram rendering returns exact SVG bytes with artifact metadata and strict security", async () => {
  vi.stubGlobal("document", {});
  vi.stubGlobal("crypto", { getRandomValues: (array) => array.fill(10) });
  const source = "flowchart LR\n A[Input] --> B[Output]";
  assert.deepEqual(await run(context(source)), { render: "html", html: svg, downloadName: "diagram.svg" });
  assert.deepEqual(mermaid.initialize.mock.calls, [
    [{ securityLevel: "strict", startOnLoad: false, suppressErrorRendering: true }],
  ]);
  assert.deepEqual(mermaid.render.mock.calls, [["canopy-diagram-0a0a0a0a0a0a0a0a", source]]);
});

for (const text of ["", " \n\t "]) {
  test(`diagram rejects blank source ${JSON.stringify(text)} before loading the renderer`, async () => {
    await assert.rejects(run(context(text)), { code: "input-required" });
    assert.equal(mermaid.render.mock.calls.length, 0);
  });
}

test("diagram enforces its 200,000 character bound without truncating accepted source", async () => {
  vi.stubGlobal("document", {});
  const source = "flowchart LR\n" + " ".repeat(200000 - "flowchart LR\n".length);
  await run(context(source));
  assert.equal(mermaid.render.mock.calls[0][1], source);
  await assert.rejects(run(context(`${source}x`)), { code: "diagram-too-large" });
  assert.equal(mermaid.render.mock.calls.length, 1);
});

test("diagram identifies server execution instead of returning an empty preview", async () => {
  vi.stubGlobal("document", undefined);
  await assert.rejects(run(context("flowchart LR\n A-->B")), { code: "dom-required" });
  assert.equal(mermaid.render.mock.calls.length, 0);
});

test("diagram parse failures retain the diagnostic and give a recovery hint", async () => {
  vi.stubGlobal("document", {});
  mermaid.render.mockRejectedValueOnce(new Error("Unexpected token at line 2"));
  await assert.rejects(run(context("flowchart LR\n A[broken")), (error) => {
    assert.equal(error.code, "diagram-invalid");
    assert.match(error.message, /Unexpected token at line 2/);
    assert.match(error.recovery, /quote labels/);
    return true;
  });
  assert.equal((await run(context("flowchart LR\n A-->B"))).html, svg);
});

test("diagram does not start a renderer for an already cancelled run", async () => {
  vi.stubGlobal("document", {});
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(run(context("flowchart LR\n A-->B", controller.signal)), { name: "AbortError" });
  assert.equal(mermaid.initialize.mock.calls.length, 0);
  assert.equal(mermaid.render.mock.calls.length, 0);
});

test("diagram discards a renderer result that completes after cancellation", async () => {
  vi.stubGlobal("document", {});
  const controller = new AbortController();
  let finish;
  let started;
  const start = new Promise((resolve) => {
    started = resolve;
  });
  mermaid.render.mockImplementationOnce(() => {
    started();
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const pending = run(context("flowchart LR\n A-->B", controller.signal));
  const rejection = assert.rejects(pending, { name: "AbortError" });
  await start;
  controller.abort();
  finish({ svg });
  await rejection;
});
