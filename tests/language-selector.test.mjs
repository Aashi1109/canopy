// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getCommonMessages } from "../lib/i18n/messages.ts";
import { locales } from "../lib/i18n/config.ts";
import { LanguageSelector } from "../components/canopy/LanguageSelector.tsx";

const navigation = vi.hoisted(() => ({ pathname: "/devtools/json-formatter", replace: vi.fn(), info: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("../lib/i18n/navigation", () => ({ useRouter: () => ({ replace: navigation.replace }) }));
vi.mock("../components/ui/components/toast", () => ({ toast: { info: navigation.info } }));
// Exercise the application switching policy independently of Radix's pointer mechanics.
vi.mock("../components/ui/components/select", () => ({
  Select: ({ value, onValueChange, children }) =>
    React.createElement("select", { value, onChange: (event) => onValueChange(event.target.value) }, children),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }) => children,
  SelectItem: ({ value, children, disabled }) => React.createElement("option", { value, disabled }, children),
}));

let root;
let container;
let workspace;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  navigation.replace.mockClear();
  navigation.info.mockClear();
  navigation.pathname = "/devtools/json-formatter";
  window.history.replaceState({}, "", "/devtools/json-formatter?mode=a&mode=b#result");
  workspace = document.createElement("div");
  workspace.dataset.languageSwitchState = "clean";
  document.body.append(workspace);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  workspace.remove();
  vi.unstubAllGlobals();
});
async function render() {
  await act(() =>
    root.render(
      React.createElement(
        NextIntlClientProvider,
        { locale: "en", messages: getCommonMessages("en"), timeZone: "UTC" },
        React.createElement(LanguageSelector),
      ),
    ),
  );
}
async function choose(locale) {
  await act(() => {
    const select = container.querySelector("select");
    select.value = locale;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

test("language switching retains pathname, repeated query parameters and hash", async () => {
  await render();
  await choose("hi");
  expect(navigation.replace).toHaveBeenCalledWith("/devtools/json-formatter?mode=a&mode=b#result", {
    locale: "hi",
    scroll: false,
  });
});

test("dirty work requires confirmation and cancel keeps the workspace", async () => {
  workspace.dataset.languageSwitchState = "dirty";
  await render();
  await choose("hi");
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  await act(() => [...document.querySelectorAll("button")].find((button) => button.textContent === "Cancel").click());
  expect(navigation.replace).not.toHaveBeenCalled();
  await choose("hi");
  await act(() =>
    [...document.querySelectorAll("button")].find((button) => button.textContent === "Change language").click(),
  );
  expect(navigation.replace).toHaveBeenCalledTimes(1);
});

test("running operations block switching with feedback", async () => {
  workspace.dataset.languageSwitchState = "running";
  await render();
  await choose("hi");
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(navigation.info).toHaveBeenCalledWith(getCommonMessages("en").Common.runningWarning);
});

test("nested processing takes priority over dirty outer workspaces", async () => {
  workspace.dataset.languageSwitchState = "dirty";
  const nested = document.createElement("div");
  nested.dataset.languageSwitchState = "running";
  workspace.append(nested);
  await render();
  await choose("hi");
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(navigation.info).toHaveBeenCalledWith(getCommonMessages("en").Common.runningWarning);
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
});

test("tool pages retain every language and disable translations that are not published", async () => {
  workspace.dataset.toolLocales = JSON.stringify(["en", "hi"]);
  await render();
  const options = [...container.querySelectorAll("option")];
  expect(options.map((option) => option.value)).toEqual([...locales]);
  expect(options.filter((option) => !option.disabled).map((option) => option.value)).toEqual(["en", "hi"]);
  await choose("fr");
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  await choose("hi");
  expect(navigation.replace).toHaveBeenCalledOnce();
});

test.each(["", "[]", '["unknown"]', "invalid"])(
  "unavailable tool locales keep all languages visible but disabled: %s",
  async (value) => {
    workspace.dataset.toolLocales = value;
    workspace.dataset.languageSwitchState = "dirty";
    await render();
    const options = [...container.querySelectorAll("option")];
    expect(options.map((option) => option.value)).toEqual([...locales]);
    expect(options.every((option) => option.disabled)).toBe(true);
    await choose("hi");
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  },
);

test("leaving a tool restores language availability without changing the list", async () => {
  workspace.dataset.toolLocales = JSON.stringify(["en"]);
  await render();
  const before = [...container.querySelectorAll("option")].map((option) => option.value);
  delete workspace.dataset.toolLocales;
  navigation.pathname = "/";
  await render();
  const options = [...container.querySelectorAll("option")];
  expect(options.map((option) => option.value)).toEqual(before);
  expect(options.every((option) => !option.disabled)).toBe(true);
});

test("private pages have no language selector", async () => {
  navigation.pathname = "/auth";
  await render();
  expect(container.querySelector("select")).toBeNull();
});
