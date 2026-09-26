// @vitest-environment jsdom
import assert from "node:assert/strict";
import React, { useState } from "react";
import { test, vi } from "vitest";
import Workspace from "./workspace.tsx";
import definition from "./definition.ts";
import { run } from "./run.ts";
import { setupReactTools, mountTool, fill, click, button, field } from "../../tests/helpers/react-tools.mjs";

vi.mock("@/components/FileProcessorWorkspace", () => ({ FileProcessorWorkspace: () => null }));
vi.mock("@/app/media/components/ImageConversionWorkspace", () => ({ ImageConversionWorkspace: () => null }));
vi.mock("@/components/content/CodeEditor", async () => ({
  CodeEditor: (await import("../../tests/helpers/react-tools.mjs")).TextEditorBoundary,
}));
setupReactTools();

function Fixture({ result = null, error, disabled = false, onInputChange = () => {} }) {
  const [input, setInput] = useState({ text: "*/15 * * * *", files: [] });
  return React.createElement(Workspace, {
    spec: definition,
    input,
    settings: {},
    result,
    error,
    disabled,
    lifecycle: error ? "failed" : result ? "completed" : "ready",
    onInputChange(next) {
      setInput(next);
      onInputChange(next);
    },
    onSettingChange() {},
  });
}

test("cron parser displays the actual field meanings and copies only the expression from its dedicated action", async () => {
  const result = run({ input: { text: "*/15 * * * *" }, settings: {} });
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const { container } = await mountTool(React.createElement(Fixture, { result }));
  assert.ok(container.textContent.includes("Every 15 minutes, every day."));
  assert.equal(container.querySelectorAll("tbody tr").length, 5);
  assert.ok(container.textContent.includes("timezone configured in your scheduler"));
  await click(button("Copy cron expression"));
  assert.deepEqual(writeText.mock.calls, [["*/15 * * * *"]]);
});

test("cron parser input is editable before a manual result and remains accessible on failure", async () => {
  const onInputChange = vi.fn();
  const view = await mountTool(React.createElement(Fixture, { onInputChange }));
  await fill(field(/^Cron expression/), "60 * * * *");
  assert.equal(onInputChange.mock.calls.at(-1)[0].text, "60 * * * *");
  await view.rerender(React.createElement(Fixture, { error: "Minute must be between 0 and 59.", onInputChange }));
  assert.ok(view.container.textContent.includes("Minute must be between 0 and 59."));
  await fill(field(/^Cron expression/), "0 9 * * 1-5");
  const result = run({ input: onInputChange.mock.calls.at(-1)[0], settings: {} });
  await view.rerender(React.createElement(Fixture, { result, onInputChange }));
  assert.ok(view.container.textContent.includes("At 09:00, Monday through Friday."));
  assert.ok(!view.container.textContent.includes("Minute must be between 0 and 59."));
});
