// @vitest-environment jsdom
import React, { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getCommonMessages } from "../lib/i18n/messages.ts";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { GlobalToolSearch } from "../components/ui/components/GlobalToolSearch.tsx";

let container;
let root;
let navigations;

const result = (toolId) => ({
  toolId,
  name: `${toolId} tool`,
  category: "Developer tools",
  description: `Work with ${toolId}`,
  href: `/devtools/${toolId}`,
  icon: { kind: "url", url: "/favicon.ico" },
});
const response = (results) => ({ ok: true, json: async () => ({ results }) });
const input = () => container.querySelector('[role="combobox"]');
const options = () => [...container.querySelectorAll('[role="option"]')];
const activeOption = () => document.getElementById(input().getAttribute("aria-activedescendant"));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("requestAnimationFrame", (callback) => setTimeout(callback, 0));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response([result("json"), result("xml"), result("yaml")])),
  );
  navigations = [];
  container = document.createElement("div");
  container.addEventListener(
    "click",
    (event) => {
      const anchor = event.target.closest("a");
      if (anchor) {
        navigations.push(anchor.href);
        event.preventDefault();
      }
    },
    true,
  );
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function open(props = {}) {
  await act(() =>
    root.render(
      React.createElement(
        NextIntlClientProvider,
        { locale: "en", messages: getCommonMessages("en"), timeZone: "UTC" },
        React.createElement(GlobalToolSearch, props),
      ),
    ),
  );
  await act(() => container.querySelector("button").click());
  expect(document.activeElement).toBe(input());
}

async function fill(value) {
  await act(() => {
    const field = input();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function settleSearch() {
  await act(async () => vi.advanceTimersByTimeAsync(300));
}

async function press(key, init = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  await act(() => input().dispatchEvent(event));
  return event;
}

test("arrow keys select and wrap results while focus remains in the search field", async () => {
  await open();
  await fill("format");
  await settleSearch();

  const listbox = document.getElementById(input().getAttribute("aria-controls"));
  expect(listbox.getAttribute("role")).toBe("listbox");
  expect(input().getAttribute("aria-haspopup")).toBe("listbox");
  expect(document.getElementById(input().getAttribute("aria-describedby"))).not.toBeNull();
  expect(activeOption()).toBe(options()[0]);
  expect(listbox.contains(activeOption())).toBe(true);
  expect(options().filter((option) => option.getAttribute("aria-selected") === "true")).toEqual([options()[0]]);
  for (const [key, index] of [
    ["ArrowDown", 1],
    ["ArrowDown", 2],
    ["ArrowDown", 0],
    ["ArrowUp", 2],
  ]) {
    expect((await press(key)).defaultPrevented).toBe(true);
    expect(activeOption()).toBe(options()[index]);
    expect(document.activeElement).toBe(input());
    expect(options().filter((option) => option.getAttribute("aria-selected") === "true")).toEqual([options()[index]]);
  }
});

test("Enter follows the active result's native public-site URL and closes search", async () => {
  await open({ publicSiteUrl: "https://tools.example.com" });
  await fill("format");
  await settleSearch();
  await press("ArrowDown");
  expect(activeOption().getAttribute("href")).toBe("https://tools.example.com/devtools/xml");
  await press("Enter");
  expect(navigations).toEqual(["https://tools.example.com/devtools/xml"]);
  expect(input()).toBeNull();
});

test("Escape closes search and returns focus to its trigger", async () => {
  await open();
  await fill("format");
  await settleSearch();
  await press("Escape");
  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(input()).toBeNull();
  expect(document.activeElement).toBe(container.querySelector("button"));
  expect(navigations).toEqual([]);
});

test("composition and modified keys do not select or open a result", async () => {
  await open();
  await fill("format");
  await settleSearch();
  const selected = activeOption();
  for (const init of [
    { isComposing: true },
    { keyCode: 229 },
    { altKey: true },
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
  ]) {
    for (const key of ["ArrowDown", "ArrowUp", "Enter"]) {
      expect((await press(key, init)).defaultPrevented).toBe(false);
      expect(activeOption()).toBe(selected);
    }
  }
  expect(navigations).toEqual([]);
});

test("changing or clearing the query immediately prevents opening obsolete results", async () => {
  await open();
  await fill("format");
  await settleSearch();
  await press("ArrowDown");
  await fill("new query");
  expect(input().hasAttribute("aria-activedescendant")).toBe(false);
  expect(options()).toEqual([]);
  await press("ArrowDown");
  await press("Enter");
  expect(navigations).toEqual([]);
  await settleSearch();
  expect(activeOption()).toBe(options()[0]);
  await act(() => container.querySelector('button[aria-label="Clear search"]').click());
  expect(input().value).toBe("");
  expect(document.activeElement).toBe(input());
  expect(input().hasAttribute("aria-activedescendant")).toBe(false);
  await press("ArrowUp");
  await press("Enter");
  expect(navigations).toEqual([]);
});

test("a late response for an earlier query cannot become navigable", async () => {
  const pending = [];
  fetch.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
  await open();
  await fill("old");
  await settleSearch();
  await fill("new");
  await settleSearch();
  expect(pending).toHaveLength(2);
  await act(() => pending[1](response([result("new")])));
  expect(activeOption().getAttribute("href")).toBe("/devtools/new");
  await act(() => pending[0](response([result("old")])));
  expect(options()).toHaveLength(1);
  expect(activeOption().getAttribute("href")).toBe("/devtools/new");
  await press("Enter");
  expect(navigations).toEqual([new URL("/devtools/new", location.href).href]);
});

test("empty and failed searches have no active result, and retry restores navigation", async () => {
  fetch.mockResolvedValueOnce(response([])).mockResolvedValueOnce({ ok: false });
  await open();
  for (const query of ["no match", "unavailable"]) {
    await fill(query);
    await settleSearch();
    expect(options()).toEqual([]);
    expect(input().hasAttribute("aria-activedescendant")).toBe(false);
    await press("ArrowDown");
    await press("ArrowUp");
    await press("Enter");
    expect(navigations).toEqual([]);
  }
  const retry = [...container.querySelectorAll("button")].find((button) => button.textContent === "Retry search");
  expect(retry).toBeTruthy();
  await act(() => retry.click());
  expect(input().value).toBe("unavailable");
  expect(activeOption()).toBe(options()[0]);
  await press("Enter");
  expect(navigations).toEqual([new URL("/devtools/json", location.href).href]);
});
