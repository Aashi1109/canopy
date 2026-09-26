// @vitest-environment jsdom
import assert from "node:assert/strict";
import React, { act, useState } from "react";
import { test, vi } from "vitest";
import Workspace from "./workspace.tsx";
import definition from "./definition.ts";
import { parseMetadata } from "./metadata.ts";
import { setupReactTools, mountTool, fill, click, button, field } from "../../tests/helpers/react-tools.mjs";

vi.mock("@/components/content/CodeEditor", async () => ({
  CodeEditor: (await import("../../tests/helpers/react-tools.mjs")).TextEditorBoundary,
}));
setupReactTools();

async function selectTab(name) {
  const tab = [...document.querySelectorAll('[role="tab"]')].find((element) => element.textContent === name);
  assert.ok(tab);
  await act(() => tab.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
}

const parsed = parseMetadata(
  '<title>Fallback title</title><meta property="og:title" content="Shared page"><meta property="og:description" content="Useful description"><meta name="twitter:title" content="X-specific title">',
  "https://example.com/page",
);
const result = {
  render: "link-preview",
  requestedUrl: "https://example.com/old",
  resolvedUrl: "https://example.com/page",
  ...parsed,
  downloadName: "open-graph-tags.html",
};

function Fixture({
  initial = "",
  result = null,
  error,
  initiallyRunning = false,
  onRun = () => {},
  onCancel = () => {},
  actionDisabled = false,
}) {
  const [input, setInput] = useState({ text: initial, files: [] });
  const [running, setRunning] = useState(initiallyRunning);
  return React.createElement(Workspace, {
    spec: definition,
    settings: {},
    input,
    result,
    error,
    running,
    lifecycle: running ? "running" : error ? "failed" : result ? "completed" : "ready",
    onInputChange: setInput,
    onSettingChange() {},
    primaryAction: {
      label: "Scan URL",
      disabled: actionDisabled,
      running,
      onRun,
      onCancel() {
        setRunning(false);
        onCancel();
      },
    },
  });
}

test("Open Graph workspace blocks invalid URLs, links the error to its field, and submits a corrected domain", async () => {
  const onRun = vi.fn();
  await mountTool(React.createElement(Fixture, { onRun }));
  assert.equal(button("Scan URL").disabled, true);
  await fill(field(/^Website URL/), "javascript:alert(1)");
  const input = field(/^Website URL/);
  assert.equal(input.getAttribute("aria-invalid"), "true");
  assert.ok(document.getElementById(input.getAttribute("aria-describedby"))?.textContent);
  assert.equal(button("Scan URL").disabled, true);
  await fill(input, "example.com");
  assert.equal(input.getAttribute("aria-invalid"), "false");
  assert.equal(button("Scan URL").disabled, false);
  await click(button("Scan URL"));
  assert.equal(onRun.mock.calls.length, 1);
});

test("Open Graph cancellation returns to Scan without accidentally submitting again", async () => {
  const onRun = vi.fn();
  const onCancel = vi.fn();
  await mountTool(React.createElement(Fixture, { initial: "example.com", initiallyRunning: true, onRun, onCancel }));
  assert.equal(field(/^Website URL/).disabled, true);
  await click(button("Cancel"));
  assert.equal(onCancel.mock.calls.length, 1);
  assert.equal(onRun.mock.calls.length, 0);
  assert.equal(field(/^Website URL/).disabled, false);
  assert.equal(button("Scan URL").disabled, false);
});

test("Open Graph failed scans offer Edit URL and honor an externally disabled action", async () => {
  const onRun = vi.fn();
  await mountTool(
    React.createElement(Fixture, {
      initial: "example.com",
      error: "Website could not be reached.",
      actionDisabled: true,
      onRun,
    }),
  );
  await click(button("Edit URL"));
  assert.equal(document.activeElement, field(/^Website URL/));
  await click(button("Scan URL"));
  assert.equal(onRun.mock.calls.length, 0);
});

test("Open Graph previews switch platforms and expose exact fetched tags for copying", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const { container } = await mountTool(React.createElement(Fixture, { initial: "example.com", result }));
  assert.ok(button("Rescan"));
  for (const platform of ["Facebook", "X", "LinkedIn", "WhatsApp", "Discord"]) {
    await selectTab(platform);
    const preview = container.querySelector(`[aria-label="${platform} link preview"]`);
    assert.ok(preview, `${platform} preview is available after selecting its tab`);
    assert.ok(preview.textContent.includes(platform === "X" ? "X-specific title" : "Shared page"));
  }
  await selectTab("HTML tags");
  assert.equal(field("Fetched HTML tags").readOnly, true);
  assert.equal(field("Fetched HTML tags").value, result.tags);
  await click(button(/^Copy/));
  assert.deepEqual(writeText.mock.calls, [[result.tags]]);
  assert.ok(container.textContent.includes("https://example.com/old"));
  assert.ok(container.textContent.includes("https://example.com/page"));
});
