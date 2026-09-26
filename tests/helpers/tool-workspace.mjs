import React, { act, useState } from "react";
import { expect } from "vitest";
import { parseSettings } from "../../lib/tool-framework/settings.ts";
import { ToolWorkspace } from "../../components/ToolWorkspace.tsx";
import { mountTool, field, button, click } from "./react-tools.mjs";

export async function mountWorkspace(
  spec,
  run,
  Workspace = ToolWorkspace,
  { text = "", secondary = "", settings: initialSettings = {}, disabled = false } = {},
) {
  function Fixture() {
    const [input, setInput] = useState({ text, secondary, files: [] });
    const [settings, setSettings] = useState(() => parseSettings(spec.settings, initialSettings));
    const [result, setResult] = useState(null);
    const [validation, setValidation] = useState(null);
    const [toolbar, setToolbar] = useState(null);
    const [error, setError] = useState(undefined);
    async function onRun() {
      try {
        setResult(
          await run({ input, settings: parseSettings(spec.settings, settings), signal: new AbortController().signal }),
        );
        setError(undefined);
      } catch (issue) {
        setError(issue.message);
      }
    }
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "button",
        { disabled: disabled || Boolean(validation), onClick: onRun },
        toolbar?.primaryActionLabel ?? "Run test operation",
      ),
      React.createElement(Workspace, {
        spec,
        input,
        settings,
        result,
        error,
        disabled,
        lifecycle: result ? "completed" : "idle",
        onInputChange: (value) => {
          setInput(value);
          setResult(null);
        },
        onSettingChange: (name, value) => {
          setSettings((current) => ({ ...current, [name]: value }));
          setResult(null);
        },
        onToolbarActionsChange: setToolbar,
        onValidationChange: setValidation,
        primaryAction: {
          label: "Run test operation",
          onRun,
          disabled: disabled || Boolean(validation),
          running: false,
        },
      }),
    );
  }
  return mountTool(React.createElement(Fixture));
}

export async function openSettings(scope = document) {
  await click(button("Restore settings panel", scope));
}

export async function choose(label, option) {
  const control = field(label);
  if (!control || control.disabled || control.readOnly || control.closest("[inert]"))
    throw new Error(`Cannot choose ${label}: the control is unavailable`);
  await act(async () => control.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
  const item = [...document.querySelectorAll('[role="option"]')].find(
    (element) => element.textContent.trim() === option,
  );
  expect(item, `Option ${option}`).toBeTruthy();
  await act(async () => item.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
}
