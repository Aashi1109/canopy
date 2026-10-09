import React, { act, useCallback, useEffect, useMemo, useState } from "react";
import { expect, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { getCommonMessages } from "../../lib/i18n/messages.ts";
import { extractToolMessages, formatToolMessage, toolMessageTree } from "../../lib/tool-framework/translations.ts";
import { mountTool, click, button, waitFor } from "./react-tools.mjs";

export async function mountWorkspace(
  Component,
  spec,
  run,
  { text = "", secondary = "", settings = {}, disabled = false, automatic = true, locale = "en", messages = {} } = {},
) {
  const toolMessages = { ...extractToolMessages(spec), ...messages };
  const onRun = vi.fn();
  const state = {};
  function Fixture() {
    const [input, setInput] = useState({ text, secondary, files: [] });
    const [values, setValues] = useState({
      ...Object.fromEntries(Object.entries(spec.settings.fields).map(([key, value]) => [key, value.default])),
      ...settings,
    });
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");
    const [errorLocation, setErrorLocation] = useState(undefined);
    const [toolbar, setToolbar] = useState(null);
    const onSettingChange = useCallback((key, value) => setValues((old) => ({ ...old, [key]: value })), []);
    const onToolbarActionsChange = useCallback((value) => setToolbar(value), []);
    const execute = useCallback(async () => {
      onRun();
      try {
        const next = await run({ input, settings: values, signal: new AbortController().signal });
        setResult(next);
        setError("");
        setErrorLocation(undefined);
      } catch (failure) {
        setResult(null);
        const message = toolMessages[`runtime.errors.${failure.code}`];
        setError(message ? formatToolMessage(locale, message, failure.details?.values) : failure.message);
        setErrorLocation(failure.details?.line && failure.details?.column ? failure.details : undefined);
      }
    }, [input, values]);
    useEffect(() => {
      if (automatic) void execute();
    }, [execute]);
    const primaryAction = useMemo(() => ({ onRun: execute, label: "Run", disabled, running: false }), [execute]);
    Object.assign(state, { input, settings: values, result, error, errorLocation });
    return React.createElement(
      React.Fragment,
      null,
      React.createElement("div", { "data-testid": "toolbar" }, toolbar?.before, toolbar?.afterExample),
      React.createElement(Component, {
        spec,
        input,
        settings: values,
        result,
        error,
        errorLocation,
        disabled,
        running: false,
        lifecycle: result ? "completed" : error ? "failed" : "idle",
        onInputChange: setInput,
        onSettingChange,
        onToolbarActionsChange,
        primaryAction,
      }),
    );
  }
  const view = await mountTool(
    React.createElement(
      NextIntlClientProvider,
      {
        locale,
        messages: { ...getCommonMessages(locale), Tool: toolMessageTree(toolMessages) },
        timeZone: "UTC",
      },
      React.createElement(Fixture),
    ),
  );
  if (automatic) await waitFor(() => expect(state.result || state.error).toBeTruthy());
  return { ...view, state, onRun };
}

export async function selectView(name) {
  await click(button("JSON result view"));
  const option = [...document.querySelectorAll('[role="option"]')].find(
    (element) => element.textContent.trim() === name,
  );
  expect(option).toBeTruthy();
  await click(option);
}
export const press = async (element, key, options = {}) =>
  act(async () =>
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options })),
  );
