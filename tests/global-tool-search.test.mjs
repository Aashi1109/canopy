// @vitest-environment jsdom
import React, { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getCommonMessages } from "../lib/i18n/messages.ts";
import { locales } from "../lib/i18n/config.ts";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  FamilyToolSearch,
  GlobalToolSearch,
  GlobalToolSearchProvider,
} from "../components/ui/components/GlobalToolSearch.tsx";

let container;
let root;
let navigations;
let interceptNavigation;
let searchFetch;
let suggestionsFetch;

const RECENT_SEARCHES_KEY = "canopy.recent-searches";
let reducedMotion = false;
const motionPreferenceListeners = new Set();
const motionPreference = {
  get matches() {
    return reducedMotion;
  },
  media: "(prefers-reduced-motion: reduce)",
  addListener: (listener) => motionPreferenceListeners.add(listener),
  removeListener: (listener) => motionPreferenceListeners.delete(listener),
  addEventListener: (_, listener) => motionPreferenceListeners.add(listener),
  removeEventListener: (_, listener) => motionPreferenceListeners.delete(listener),
};
function setReducedMotion(value) {
  reducedMotion = value;
  for (const listener of motionPreferenceListeners) listener(motionPreference);
}

const result = (toolId) => ({
  toolId,
  name: `${toolId} tool`,
  category: "Developer tools",
  description: `Work with ${toolId}`,
  href: `/devtools/${toolId}`,
  icon: { kind: "url", url: "/favicon.ico" },
});
const response = (results) => ({ ok: true, json: async () => ({ results }) });
const accessibleMatches = (selector, parent = document) =>
  [...parent.querySelectorAll(selector)].filter((element) => !element.closest('[aria-hidden="true"], [inert]'));
const input = () => accessibleMatches('[role="combobox"]')[0] ?? null;
const dialog = () => accessibleMatches('[role="dialog"]')[0] ?? null;
const options = () => accessibleMatches('[role="option"]');
const activeOption = () => document.getElementById(input().getAttribute("aria-activedescendant"));
const requestUrl = () => new URL(searchFetch.mock.calls.at(-1)[0], location.href);
const recentButton = (query) =>
  accessibleMatches("button", dialog()).find((button) => button.textContent.trim() === query);
const removeRecentButton = (query) =>
  accessibleMatches("button", dialog()).find(
    (button) => button.getAttribute("aria-label") === `Remove recent search: ${query}`,
  );
const familyFilter = (label = "Media") =>
  accessibleMatches("button", dialog()).find(
    (button) => button.getAttribute("aria-label") === `Remove ${label} filter`,
  ) ?? null;
const suggestionLinks = () => accessibleMatches("a", dialog());

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setReducedMotion(false);
  vi.stubGlobal("matchMedia", (query) =>
    query.includes("prefers-reduced-motion")
      ? motionPreference
      : { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} },
  );
  vi.stubGlobal("requestAnimationFrame", (callback) => setTimeout(() => callback(performance.now()), 0));
  vi.stubGlobal("cancelAnimationFrame", (timer) => clearTimeout(timer));
  localStorage.clear();
  searchFetch = vi.fn(async () => response([result("json"), result("xml"), result("yaml")]));
  suggestionsFetch = vi.fn(async () => response([]));
  vi.stubGlobal(
    "fetch",
    vi.fn((url, init) =>
      new URL(url, location.href).searchParams.get("suggestions") === "1"
        ? suggestionsFetch(url, init)
        : searchFetch(url, init),
    ),
  );
  navigations = [];
  container = document.createElement("div");
  interceptNavigation = (event) => {
    const anchor = event.target.closest("a");
    if (anchor) {
      navigations.push(anchor.href);
      event.preventDefault();
    }
  };
  document.addEventListener("click", interceptNavigation, true);
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  await act(async () => vi.advanceTimersByTimeAsync(0));
  document.removeEventListener("click", interceptNavigation, true);
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function open(props = {}) {
  await renderTriggers({ global: props });
  await act(() => container.querySelector("button").click());
  // A rapid reopen reuses exiting content and schedules focus on the next frame.
  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(document.activeElement).toBe(input());
}

async function renderTriggers({ global = {}, family, locale = "en" } = {}) {
  await act(() =>
    root.render(
      React.createElement(
        NextIntlClientProvider,
        {
          locale,
          messages: getCommonMessages(locale),
          timeZone: "UTC",
          onError: (error) => {
            throw error;
          },
        },
        React.createElement(
          GlobalToolSearchProvider,
          { publicSiteUrl: global.publicSiteUrl },
          React.createElement(GlobalToolSearch, global),
          family
            ? React.createElement(
                FamilyToolSearch,
                family,
                React.createElement(
                  "form",
                  { action: `/${family.family}`, method: "get" },
                  React.createElement("input", {
                    name: "q",
                    type: "search",
                    "aria-label": `Search ${family.family} tools`,
                    defaultValue: family.initialQuery ?? "",
                  }),
                  React.createElement("button", { type: "submit" }, "Search"),
                ),
              )
            : null,
        ),
      ),
    ),
  );
}

async function openFamily(family = "media", props = {}) {
  await renderTriggers({ family: { family, ...props } });
  const trigger = container.querySelector('input[name="q"]');
  await act(() => trigger.click());
  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(document.activeElement).toBe(input());
  return trigger;
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

async function shortcut(init) {
  const event = new KeyboardEvent("keydown", { key: "k", bubbles: true, cancelable: true, ...init });
  await act(() => (document.activeElement ?? document.body).dispatchEvent(event));
  return event;
}

test.each([false, true])(
  "desktop and mobile navigation open the shared modal search overlay (mobile: %s)",
  async (mobile) => {
    await open({ mobile });
    expect(dialog()).not.toBeNull();
    expect(dialog().getAttribute("aria-modal")).toBe("true");
    expect(dialog().getAttribute("aria-label")).toBe("Search tools");
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(input().getAttribute("aria-label")).toBe("Search all SmartTools");
  },
);

test.each([{ metaKey: true }, { ctrlKey: true }])(
  "global keyboard shortcut opens search and returns focus on close (%j)",
  async (keys) => {
    await renderTriggers();
    const trigger = container.querySelector("button");
    trigger.focus();
    expect((await shortcut(keys)).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input());
    await fill("format");
    await settleSearch();
    expect(requestUrl().searchParams.has("family")).toBe(false);
    await press("Escape");
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  },
);

test.each([
  ["paperwork", "Documents"],
  ["devtools", "Developer tools"],
  ["media", "Media"],
])("family search starts scoped to %s and removes its filter without losing the query", async (family, label) => {
  await openFamily(family);
  expect(input().getAttribute("aria-label")).toBe(`Search ${label}`);
  const removeFilter = familyFilter(label);
  expect(removeFilter).not.toBeNull();
  await fill("video");
  await settleSearch();
  expect(requestUrl().pathname).toBe("/api/tools/search");
  expect(requestUrl().searchParams.get("family")).toBe(family);
  expect(requestUrl().searchParams.get("q")).toBe("video");
  expect(options().length).toBeGreaterThan(0);
  let resolveGlobalSearch;
  searchFetch.mockImplementationOnce(() => new Promise((resolve) => (resolveGlobalSearch = resolve)));
  await act(() => removeFilter.click());
  expect(input().value).toBe("video");
  expect(document.activeElement).toBe(input());
  expect(options()).toEqual([]);
  expect(input().hasAttribute("aria-activedescendant")).toBe(false);
  expect(familyFilter(label)).toBeNull();
  await settleSearch();
  expect(requestUrl().searchParams.has("family")).toBe(false);
  expect(requestUrl().searchParams.get("q")).toBe("video");
  await act(() => resolveGlobalSearch(response([result("global")])));
  expect(activeOption().getAttribute("href")).toBe("/devtools/global");
});

test.each(["click", "Ctrl+K"])(
  "family removal by %s makes the exiting chip inactive and searches globally immediately",
  async (method) => {
    await openFamily("media");
    await fill("image");
    await settleSearch();
    const chip = familyFilter("Media");
    const field = input();
    if (method === "click") {
      await act(() => {
        chip.focus();
        chip.click();
      });
    } else {
      await shortcut({ ctrlKey: true });
    }
    expect(chip.isConnected).toBe(true);
    expect(chip.closest('[aria-hidden="true"][inert]')).not.toBeNull();
    expect(chip.disabled).toBe(true);
    expect(familyFilter("Media")).toBeNull();
    expect(input()).toBe(field);
    expect(input().value).toBe("image");
    expect(input().getAttribute("aria-label")).toBe("Search all SmartTools");
    expect(document.activeElement).toBe(input());
    expect(requestUrl().searchParams.get("q")).toBe("image");
    expect(requestUrl().searchParams.has("family")).toBe(false);
  },
);

test("reduced motion removes the family chip without waiting for an exit while preserving the query and focus", async () => {
  setReducedMotion(true);
  await openFamily("media");
  await fill("image");
  await settleSearch();
  const chip = familyFilter("Media");
  await act(() => chip.click());
  await act(async () => vi.advanceTimersByTimeAsync(32));
  expect(chip.isConnected).toBe(false);
  expect(input().value).toBe("image");
  expect(document.activeElement).toBe(input());
  expect(requestUrl().searchParams.has("family")).toBe(false);
});

test("family search retains an initial query and navigation toggle restores focus to its original trigger", async () => {
  const trigger = await openFamily("media", { initialQuery: "crop image" });
  expect(input().value).toBe("crop image");
  await settleSearch();
  expect(requestUrl().searchParams.get("q")).toBe("crop image");
  await act(() => container.querySelector("button").click());
  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(dialog()).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

test("focusing the original family field does not open search, and clicking it transfers the edited query", async () => {
  await renderTriggers({ family: { family: "media", initialQuery: "initial query" } });
  const field = container.querySelector('input[name="q"]');
  await act(() => field.focus());
  expect(dialog()).toBeNull();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(field, "edited query");
  await act(() => field.click());
  expect(input().value).toBe("edited query");
  expect(document.activeElement).toBe(input());
  expect(familyFilter("Media")).not.toBeNull();
  await press("Escape");
  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(document.activeElement).toBe(field);
});

test("submitting the original family form prevents navigation and transfers its current query", async () => {
  await renderTriggers({ family: { family: "devtools", initialQuery: "initial query" } });
  const field = container.querySelector('input[name="q"]');
  const form = container.querySelector("form");
  await act(() => field.focus());
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(field, "typed query");
  const submission = new Event("submit", { bubbles: true, cancelable: true });
  await act(() => form.dispatchEvent(submission));
  expect(submission.defaultPrevented).toBe(true);
  expect(input().value).toBe("typed query");
  expect(document.activeElement).toBe(input());
  expect(familyFilter("Developer tools")).not.toBeNull();
  await settleSearch();
  expect(requestUrl().searchParams.get("q")).toBe("typed query");
  expect(requestUrl().searchParams.get("family")).toBe("devtools");
  expect(navigations).toEqual([]);
});

test("the original family submit button opens search with the current input value", async () => {
  await renderTriggers({ family: { family: "media" } });
  const field = container.querySelector('input[name="q"]');
  const button = container.querySelector('button[type="submit"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(field, "video");
  await act(() => {
    button.focus();
    button.click();
  });
  expect(input().value).toBe("video");
  expect(document.activeElement).toBe(input());
  expect(familyFilter("Media")).not.toBeNull();
  await press("Escape");
  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(document.activeElement).toBe(button);
});

test("implicit Enter submission returns focus to the original family input on Escape", async () => {
  await renderTriggers({ family: { family: "media" } });
  const field = container.querySelector('input[name="q"]');
  const button = container.querySelector('button[type="submit"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(field, "crop image");
  await act(() => {
    field.focus();
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }));
  });
  expect(input().value).toBe("crop image");
  expect(document.activeElement).toBe(input());
  await press("Escape");
  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(dialog()).toBeNull();
  expect(document.activeElement).toBe(field);
});

test("clicking the navigation search again closes its overlay and restores focus", async () => {
  await open();
  const trigger = container.querySelector("button");
  await act(() => trigger.click());
  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(dialog()).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

test("the modal search keeps background controls out of the focus flow", async () => {
  await open();
  const outsideButton = document.createElement("button");
  outsideButton.textContent = "Other navigation";
  container.append(outsideButton);
  await act(() => outsideButton.focus());
  expect(dialog()).not.toBeNull();
  expect(dialog().contains(document.activeElement)).toBe(true);
  expect(document.activeElement).not.toBe(outsideButton);
});

test("Tab and Shift+Tab wrap within the modal search", async () => {
  await open();
  await fill("json");
  await settleSearch();
  const tabbable = accessibleMatches("button:not([disabled]), input:not([disabled]), a[href]", dialog()).filter(
    (element) => element.tabIndex >= 0,
  );
  expect(tabbable.length).toBeGreaterThan(1);
  const first = tabbable[0];
  const last = tabbable.at(-1);
  await act(() => last.focus());
  const forward = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
  await act(() => last.dispatchEvent(forward));
  expect(forward.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(first);
  const backward = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
  await act(() => first.dispatchEvent(backward));
  expect(backward.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(last);
});

test("backdrop dismissal closes search and returns focus to its trigger", async () => {
  await open();
  const trigger = container.querySelector("button");
  const backdrop = dialog().previousElementSibling;
  expect(backdrop).toBeInstanceOf(HTMLElement);
  await act(() => backdrop.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 })));
  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(dialog()).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

test.each(["blank", "loading", "ready", "empty", "error"])(
  "the visible Close control dismisses a %s search and restores focus",
  async (state) => {
    if (state === "loading") searchFetch.mockImplementation(() => new Promise(() => {}));
    if (state === "empty") searchFetch.mockResolvedValue(response([]));
    if (state === "error") searchFetch.mockResolvedValue({ ok: false });
    await open();
    const trigger = container.querySelector("button");
    if (state !== "blank") {
      await fill("json");
      await settleSearch();
    }
    const close = accessibleMatches("button", dialog()).find((button) => button.textContent.trim() === "Close");
    expect(close).toBeTruthy();
    expect(close.disabled).toBe(false);
    await act(() => close.click());
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  },
);

test("closing immediately makes the retained exit inert and hidden while restoring trigger focus", async () => {
  await open();
  await fill("json");
  await settleSearch();
  const popup = dialog();
  const trigger = container.querySelector("button");
  await press("Escape");
  expect(popup.isConnected).toBe(true);
  expect(popup.getAttribute("aria-hidden")).toBe("true");
  expect(popup.hasAttribute("inert")).toBe(true);
  expect(dialog()).toBeNull();
  expect(input()).toBeNull();
  expect(options()).toEqual([]);
  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(document.activeElement).toBe(trigger);
});

test("rapid reopening keeps a single active search focused and usable", async () => {
  await openFamily("media");
  await fill("old");
  await settleSearch();
  await press("Escape");
  await act(() => container.querySelector("button").click());
  const reopenedInput = input();
  await fill("new");
  await act(async () => vi.advanceTimersByTimeAsync(500));
  expect(accessibleMatches('[role="dialog"]')).toHaveLength(1);
  expect(document.activeElement).toBe(reopenedInput);
  expect(input().value).toBe("new");
  expect(familyFilter("Media")).toBeNull();
  expect(requestUrl().searchParams.get("q")).toBe("new");
  expect(requestUrl().searchParams.has("family")).toBe(false);
  expect(options()).toHaveLength(3);
});

test("a keyboard shortcut changes an open family search to global and preserves its query", async () => {
  await openFamily();
  await fill("image");
  await settleSearch();
  let resolveGlobalSearch;
  searchFetch.mockImplementationOnce(() => new Promise((resolve) => (resolveGlobalSearch = resolve)));
  expect((await shortcut({ metaKey: true })).defaultPrevented).toBe(true);
  expect(input().value).toBe("image");
  expect(document.activeElement).toBe(input());
  expect(familyFilter("Media")).toBeNull();
  expect(options()).toEqual([]);
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  await settleSearch();
  expect(requestUrl().searchParams.has("family")).toBe(false);
  await act(() => resolveGlobalSearch(response([result("global")])));
  expect(activeOption().getAttribute("href")).toBe("/devtools/global");
});

test("reopening through navigation resets a previous family filter", async () => {
  await openFamily();
  await fill("image");
  await settleSearch();
  await press("Escape");
  await act(async () => vi.advanceTimersByTimeAsync(0));
  await act(() => container.querySelector("button").click());
  expect(familyFilter("Media")).toBeNull();
  await fill("video");
  await settleSearch();
  expect(requestUrl().searchParams.has("family")).toBe(false);
});

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

test.each([{ isComposing: true }, { keyCode: 229 }])(
  "Escape during text composition keeps search open (%j)",
  async (keys) => {
    await open();
    await fill("json");
    await settleSearch();
    await press("Escape", keys);
    expect(dialog()).not.toBeNull();
    expect(document.activeElement).toBe(input());
    expect(input().value).toBe("json");
    expect(navigations).toEqual([]);
    await press("Escape");
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(container.querySelector("button"));
  },
);

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
  await act(() => dialog().querySelector('button[aria-label="Clear search"]').click());
  expect(input().value).toBe("");
  expect(document.activeElement).toBe(input());
  expect(input().hasAttribute("aria-activedescendant")).toBe(false);
  await press("ArrowUp");
  await press("Enter");
  expect(navigations).toEqual([]);
});

test("a late response for an earlier query cannot become navigable", async () => {
  const pending = [];
  searchFetch.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
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

test("a late scoped response cannot replace global results after the family filter is removed", async () => {
  const pending = [];
  searchFetch.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
  await openFamily();
  await fill("image");
  await settleSearch();
  await act(() => familyFilter("Media").click());
  await settleSearch();
  expect(pending).toHaveLength(2);
  await act(() => pending[1](response([result("global")])));
  expect(activeOption().getAttribute("href")).toBe("/devtools/global");
  await act(() => pending[0](response([result("scoped")])));
  expect(options()).toHaveLength(1);
  expect(activeOption().getAttribute("href")).toBe("/devtools/global");
});

test("closing during a pending request prevents it from populating a newly opened search", async () => {
  const pending = [];
  searchFetch.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
  await openFamily();
  await fill("old");
  await settleSearch();
  await press("Escape");
  await act(async () => vi.advanceTimersByTimeAsync(0));
  await act(() => container.querySelector("button").click());
  await fill("new");
  await settleSearch();
  expect(pending).toHaveLength(2);
  await act(() => pending[0](response([result("old")])));
  expect(options()).toEqual([]);
  expect(input().hasAttribute("aria-activedescendant")).toBe(false);
  await act(() => pending[1](response([result("new")])));
  expect(activeOption().getAttribute("href")).toBe("/devtools/new");
});

test.each(["query", "suggestions"])("closing aborts an in-flight %s request before the exit finishes", async (kind) => {
  const pendingFetch = kind === "query" ? searchFetch : suggestionsFetch;
  pendingFetch.mockImplementation(() => new Promise(() => {}));
  await open();
  if (kind === "query") {
    await fill("json");
    await settleSearch();
  }
  const signal = pendingFetch.mock.calls.at(-1)[1].signal;
  expect(signal.aborted).toBe(false);
  await press("Escape");
  expect(signal.aborted).toBe(true);
  expect(dialog()).toBeNull();
});

test("closing before the query debounce expires prevents a request during the retained exit", async () => {
  await open();
  await fill("unsubmitted query");
  await press("Escape");
  await act(async () => vi.advanceTimersByTimeAsync(400));
  expect(searchFetch).not.toHaveBeenCalled();
  expect(dialog()).toBeNull();
});

test("empty and failed searches have no active result, and retry restores navigation", async () => {
  searchFetch.mockResolvedValueOnce(response([])).mockResolvedValueOnce({ ok: false });
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
  const retry = [...document.querySelectorAll("button")].find((button) => button.textContent === "Retry search");
  expect(retry).toBeTruthy();
  await act(() => retry.click());
  expect(input().value).toBe("unavailable");
  expect(activeOption()).toBe(options()[0]);
  await press("Enter");
  expect(navigations).toEqual([new URL("/devtools/json", location.href).href]);
});

test("recent searches record only tool activation, deduplicate by case, cap at three, and survive reopening", async () => {
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(["xml", "JSON", "yaml"]));
  const write = vi.spyOn(Storage.prototype, "setItem");
  await open();
  await fill(" json ");
  await settleSearch();
  expect(write).not.toHaveBeenCalled();
  await press("Enter");
  expect(JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY))).toEqual(["json", "xml", "yaml"]);
  expect(write).toHaveBeenCalledTimes(1);

  await open();
  await fill("csv");
  await settleSearch();
  await act(() => options()[0].click());
  expect(JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY))).toEqual(["csv", "json", "xml"]);
  expect(write).toHaveBeenCalledTimes(2);

  await act(() => root.unmount());
  root = createRoot(container);
  await open();
  for (const query of ["csv", "json", "xml"]) expect(recentButton(query)).toBeTruthy();
  expect(recentButton("yaml")).toBeUndefined();
  expect(write).toHaveBeenCalledTimes(2);
});

test("immediately reopening after tool activation includes the newly recorded query", async () => {
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(["older query"]));
  await open();
  await fill("new query");
  await settleSearch();
  await press("Enter");
  await act(() => container.querySelector("button").click());
  expect(input().value).toBe("");
  expect(document.activeElement).toBe(input());
  expect(recentButton("new query")).toBeTruthy();
  expect(recentButton("older query")).toBeTruthy();
  expect(JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY))).toEqual(["new query", "older query"]);
});

test("replaying a recent query preserves family scope and does not write or reorder history", async () => {
  const history = ["image resize", "video", "json"];
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(history));
  const write = vi.spyOn(Storage.prototype, "setItem");
  await openFamily("media");
  await act(() => recentButton("video").click());
  expect(input().value).toBe("video");
  expect(document.activeElement).toBe(input());
  expect(familyFilter("Media")).not.toBeNull();
  await settleSearch();
  expect(requestUrl().searchParams.get("family")).toBe("media");
  expect(requestUrl().searchParams.get("q")).toBe("video");
  await fill("unselected query");
  await settleSearch();
  await press("Escape");
  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY))).toEqual(history);
  expect(write).not.toHaveBeenCalled();
});

test("removing one recent query preserves other entries, family scope, focus, and the persisted order", async () => {
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(["image resize", "video", "json"]));
  const write = vi.spyOn(Storage.prototype, "setItem");
  const remove = vi.spyOn(Storage.prototype, "removeItem");
  await openFamily("media");
  await act(() => {
    const button = removeRecentButton("video");
    button.focus();
    button.click();
  });
  expect(dialog()).not.toBeNull();
  expect(input().value).toBe("");
  expect(document.activeElement).toBe(input());
  expect(familyFilter("Media")).not.toBeNull();
  expect(recentButton("video")).toBeUndefined();
  expect(recentButton("image resize")).toBeTruthy();
  expect(recentButton("json")).toBeTruthy();
  expect(JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY))).toEqual(["image resize", "json"]);
  expect(write).toHaveBeenCalledExactlyOnceWith(RECENT_SEARCHES_KEY, JSON.stringify(["image resize", "json"]));
  expect(remove).not.toHaveBeenCalled();
  expect(searchFetch).not.toHaveBeenCalled();
  expect(navigations).toEqual([]);

  await press("Escape");
  await act(async () => vi.advanceTimersByTimeAsync(0));
  await openFamily("media");
  expect(recentButton("video")).toBeUndefined();
  expect(recentButton("image resize")).toBeTruthy();
  expect(recentButton("json")).toBeTruthy();
  expect(write).toHaveBeenCalledTimes(1);
});

test("removing the last recent query clears its storage key and leaves an empty search ready for input", async () => {
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(["only query"]));
  const write = vi.spyOn(Storage.prototype, "setItem");
  const remove = vi.spyOn(Storage.prototype, "removeItem");
  await open();
  await act(() => removeRecentButton("only query").click());
  expect(localStorage.getItem(RECENT_SEARCHES_KEY)).toBeNull();
  expect(remove).toHaveBeenCalledExactlyOnceWith(RECENT_SEARCHES_KEY);
  expect(write).not.toHaveBeenCalled();
  expect(recentButton("only query")).toBeUndefined();
  expect(accessibleMatches('button[aria-label^="Remove recent search:"]', dialog())).toHaveLength(0);
  expect(input().value).toBe("");
  expect(document.activeElement).toBe(input());
  expect(dialog()).not.toBeNull();
  await press("Escape");
  await act(async () => vi.advanceTimersByTimeAsync(0));
  await open();
  expect(recentButton("only query")).toBeUndefined();
  expect(remove).toHaveBeenCalledTimes(1);
});

test("a removed recent row cannot be replayed while its exit remains visible", async () => {
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(["remove me", "keep me"]));
  await open();
  const replay = recentButton("remove me");
  const remove = removeRecentButton("remove me");
  await act(() => remove.click());
  expect(remove.isConnected).toBe(true);
  expect(remove.closest('[aria-hidden="true"][inert]')).not.toBeNull();
  expect(remove.disabled).toBe(true);
  expect(replay.disabled).toBe(true);
  expect(recentButton("remove me")).toBeUndefined();
  await act(() => replay.click());
  expect(input().value).toBe("");
  expect(document.activeElement).toBe(input());
  expect(JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY))).toEqual(["keep me"]);
});

test("reduced motion removes closed search and deleted history without waiting for exit durations", async () => {
  setReducedMotion(true);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(["remove me", "keep me"]));
  await open();
  const popup = dialog();
  const remove = removeRecentButton("remove me");
  await act(() => remove.click());
  await act(async () => vi.advanceTimersByTimeAsync(32));
  expect(remove.isConnected).toBe(false);
  await press("Escape");
  await act(async () => vi.advanceTimersByTimeAsync(32));
  expect(popup.isConnected).toBe(false);
  expect(document.activeElement).toBe(container.querySelector("button"));
});

test.each([
  ["setItem", ["first", "second"]],
  ["removeItem", ["first"]],
])("failed history %s keeps every entry and leaves search usable", async (method, history) => {
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(history));
  vi.spyOn(Storage.prototype, method).mockImplementation(() => {
    throw new DOMException("Storage is blocked", "SecurityError");
  });
  await openFamily("media");
  await act(() => removeRecentButton("first").click());
  expect(JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY))).toEqual(history);
  for (const term of history) expect(recentButton(term)).toBeTruthy();
  expect(input().value).toBe("");
  expect(familyFilter("Media")).not.toBeNull();
  expect(dialog()).not.toBeNull();
  expect(searchFetch).not.toHaveBeenCalled();
  expect(navigations).toEqual([]);
  await fill("another query");
  await settleSearch();
  expect(options()).toHaveLength(3);
});

test.each(["invalid JSON", JSON.stringify({ query: "wrong shape" })])(
  "malformed recent history does not prevent search: %s",
  async (stored) => {
    localStorage.setItem(RECENT_SEARCHES_KEY, stored);
    await open();
    await fill("format");
    await settleSearch();
    expect(options()).toHaveLength(3);
    await press("Enter");
    expect(navigations).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY))).toEqual(["format"]);
  },
);

test("recent history ignores invalid entries, trims strings, deduplicates, and displays at most three", async () => {
  localStorage.setItem(
    RECENT_SEARCHES_KEY,
    JSON.stringify([null, 42, {}, "", "  ", "x".repeat(201), "  valid  ", "VALID", "second", "third", "fourth"]),
  );
  await open();
  for (const query of ["valid", "second", "third"]) expect(recentButton(query)).toBeTruthy();
  for (const query of ["VALID", "fourth", "x".repeat(201)]) expect(recentButton(query)).toBeUndefined();
});

test("unavailable browser storage does not prevent opening or activating search results", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("Storage is blocked", "SecurityError");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Storage is full", "QuotaExceededError");
  });
  await open();
  await fill("json");
  await settleSearch();
  await press("Enter");
  expect(navigations).toEqual([new URL("/devtools/json", location.href).href]);
  expect(dialog()).toBeNull();
});

test("blank global search shows at most four popular links and records the chosen tool name", async () => {
  suggestionsFetch.mockResolvedValue(
    response([
      result("first"),
      { ...result("second"), category: "Documents", href: "/paperwork/second" },
      { ...result("third"), category: "Media", href: "/media/third" },
      { ...result("fourth"), category: "Media", href: "/media/fourth" },
      result("fifth"),
    ]),
  );
  const write = vi.spyOn(Storage.prototype, "setItem");
  await open();
  const links = suggestionLinks();
  expect(links).toHaveLength(4);
  expect(links[0].textContent).toContain("first tool");
  expect(links[0].textContent).toContain("Developer tools");
  expect(links[0].getAttribute("href")).toBe("/devtools/first");
  expect(links[0].tabIndex).toBe(0);
  expect(options()).toEqual([]);
  expect(write).not.toHaveBeenCalled();
  await act(() => {
    links[0].focus();
    links[0].click();
  });
  expect(navigations).toEqual([new URL("/devtools/first", location.href).href]);
  expect(JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY))).toEqual(["first tool"]);
  expect(dialog()).toBeNull();
});

test.each([
  ["paperwork", "Documents"],
  ["devtools", "Developer tools"],
  ["media", "Media"],
])("blank %s search keeps popular suggestions limited to three", async (family, category) => {
  suggestionsFetch.mockResolvedValue(
    response(
      ["first", "second", "third", "fourth"].map((id) => ({
        ...result(id),
        category,
        href: `/${family}/${id}`,
      })),
    ),
  );
  await openFamily(family);
  expect(suggestionLinks()).toHaveLength(3);
  expect(suggestionLinks().map((link) => link.getAttribute("href"))).toEqual([
    `/${family}/first`,
    `/${family}/second`,
    `/${family}/third`,
  ]);
  expect(new URL(suggestionsFetch.mock.calls[0][0], location.href).searchParams.get("family")).toBe(family);
});

test("popular suggestions are family scoped and an obsolete scoped response cannot replace global suggestions", async () => {
  const pending = [];
  suggestionsFetch.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
  await openFamily("media");
  const scopedUrl = new URL(suggestionsFetch.mock.calls[0][0], location.href);
  expect(scopedUrl.pathname).toBe("/api/tools/search");
  expect(scopedUrl.searchParams.get("suggestions")).toBe("1");
  expect(scopedUrl.searchParams.get("family")).toBe("media");
  await act(() => familyFilter("Media").click());
  expect(pending).toHaveLength(2);
  expect(new URL(suggestionsFetch.mock.calls[1][0], location.href).searchParams.has("family")).toBe(false);
  await act(() => pending[1](response([result("global")])));
  await act(() => pending[0](response([result("scoped")])));
  expect(suggestionLinks()).toHaveLength(1);
  expect(suggestionLinks()[0].getAttribute("href")).toBe("/devtools/global");
});

test("a late popular response cannot replace results for a typed query", async () => {
  let resolveSuggestions;
  suggestionsFetch.mockImplementation(() => new Promise((resolve) => (resolveSuggestions = resolve)));
  await open();
  await fill("json");
  await settleSearch();
  await act(() => resolveSuggestions(response([result("popular")])));
  expect(options()).toHaveLength(3);
  expect(activeOption().getAttribute("href")).toBe("/devtools/json");
  expect(dialog().querySelector('a[href="/devtools/popular"]')).toBeNull();
});

test.each(locales)("search labels and both request types use the active %s locale", async (locale) => {
  const messages = getCommonMessages(locale);
  const prefix = locale === "en" ? "" : `/${locale}`;
  suggestionsFetch.mockResolvedValue(response([{ ...result("popular"), href: `${prefix}/devtools/popular` }]));
  searchFetch.mockResolvedValue(response([{ ...result("json"), href: `${prefix}/devtools/json` }]));
  await renderTriggers({ locale });
  await act(() => container.querySelector("button").click());
  expect(input().getAttribute("aria-label")).toBe(messages.Search.label);
  expect(dialog().getAttribute("aria-label")).toBe(messages.Search.searchTools);
  expect(new URL(suggestionsFetch.mock.calls.at(-1)[0], location.href).searchParams.get("locale")).toBe(locale);
  expect(suggestionLinks()[0].getAttribute("href")).toBe(`${prefix}/devtools/popular`);
  await fill("json");
  await settleSearch();
  expect(requestUrl().searchParams.get("locale")).toBe(locale);
  expect(activeOption().getAttribute("href")).toBe(`${prefix}/devtools/json`);
  await press("Enter");
  expect(navigations).toEqual([new URL(`${prefix}/devtools/json`, location.href).href]);
});

test("switching locale prevents a late previous-locale query from replacing current results", async () => {
  const pending = [];
  searchFetch.mockImplementation((url) => new Promise((resolve) => pending.push({ url, resolve })));
  await open();
  await fill("json");
  await settleSearch();
  expect(pending).toHaveLength(1);
  expect(new URL(pending[0].url, location.href).searchParams.get("locale")).toBe("en");
  await renderTriggers({ locale: "fr" });
  expect(input().value).toBe("json");
  expect(input().getAttribute("aria-label")).toBe(getCommonMessages("fr").Search.label);
  expect(options()).toEqual([]);
  expect(input().hasAttribute("aria-activedescendant")).toBe(false);
  await settleSearch();
  expect(pending).toHaveLength(2);
  expect(new URL(pending[1].url, location.href).searchParams.get("locale")).toBe("fr");
  await act(() => pending[1].resolve(response([{ ...result("current"), href: "/fr/devtools/current" }])));
  expect(activeOption().getAttribute("href")).toBe("/fr/devtools/current");
  await act(() => pending[0].resolve(response([result("obsolete")])));
  expect(options()).toHaveLength(1);
  expect(activeOption().getAttribute("href")).toBe("/fr/devtools/current");
});

test("switching locale prevents old popular suggestions from becoming navigable", async () => {
  const pending = [];
  suggestionsFetch.mockImplementation((url) => new Promise((resolve) => pending.push({ url, resolve })));
  await open();
  expect(pending).toHaveLength(1);
  await renderTriggers({ locale: "fr" });
  expect(pending).toHaveLength(2);
  expect(suggestionLinks()).toEqual([]);
  expect(new URL(pending[1].url, location.href).searchParams.get("locale")).toBe("fr");
  await act(() => pending[1].resolve(response([{ ...result("current"), href: "/fr/devtools/current" }])));
  expect(suggestionLinks()[0].getAttribute("href")).toBe("/fr/devtools/current");
  await act(() => pending[0].resolve(response([result("obsolete")])));
  expect(suggestionLinks()).toHaveLength(1);
  expect(suggestionLinks()[0].getAttribute("href")).toBe("/fr/devtools/current");
});
