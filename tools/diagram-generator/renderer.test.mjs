// @vitest-environment jsdom
import assert from "node:assert/strict";
import { afterAll, beforeAll, test } from "vitest";
import { run } from "./run.ts";

// jsdom cannot measure SVG text. Only measurement is supplied; Mermaid's
// parser, layout, sanitization and SVG serialization all execute unchanged.
const originalBox = Object.getOwnPropertyDescriptor(SVGElement.prototype, "getBBox");
beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, "getBBox", {
    configurable: true,
    value() {
      return { x: 0, y: 0, width: (this.textContent?.length ?? 0) * 8, height: 16 };
    },
  });
});
afterAll(() => {
  if (originalBox) Object.defineProperty(SVGElement.prototype, "getBBox", originalBox);
  else delete SVGElement.prototype.getBBox;
});
const context = (text) => ({ input: { text, files: [] }, settings: {}, signal: new AbortController().signal });

for (const [name, source, labels] of [
  ["flowchart", 'flowchart LR\n A["Receive order"] --> B["Ship order"]', ["Receive order", "Ship order"]],
  [
    "sequence",
    "sequenceDiagram\n Alice->>Bob: Hello customer\n Bob-->>Alice: Order accepted",
    ["Alice", "Bob", "Hello customer", "Order accepted"],
  ],
]) {
  test(`real Mermaid ${name} rendering preserves the user diagram in downloadable SVG`, async () => {
    const result = await run(context(source));
    assert.equal(result.downloadName, "diagram.svg");
    const document = new DOMParser().parseFromString(result.html, "image/svg+xml");
    assert.equal(document.querySelectorAll("parsererror").length, 0);
    assert.equal(document.documentElement.localName, "svg");
    for (const label of labels) assert.ok(document.documentElement.textContent.includes(label), label);
    assert.equal(document.querySelectorAll("script").length, 0);
  });
}

test("a real Mermaid syntax failure can be followed by a successful corrected render", async () => {
  await assert.rejects(run(context("flowchart LR\n A[broken")), { code: "diagram-invalid" });
  const recovered = await run(context("flowchart LR\n A[Recovered] --> B[Ready]"));
  assert.match(recovered.html, /Recovered/);
  assert.match(recovered.html, /Ready/);
});
