// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

let root;
let container;
let EcosystemTabFilters;
let useEcosystemGroups;
let now;
const groups = [{ id: "developer", label: "Loaded tools", href: "/devtools", count: 1, categories: [], tools: [] }];
const response = () => ({ ok: true, json: async () => ({ groups }) });

beforeEach(async () => {
  vi.resetModules();
  ({ EcosystemTabFilters, useEcosystemGroups } = await import("../components/ui/components/EcosystemTabFilters.tsx"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response()),
  );
  now = 1_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Menu({ enabled = true }) {
  return React.createElement(
    "output",
    null,
    useEcosystemGroups(enabled)
      .map((group) => group.label)
      .join(", "),
  );
}

test("closed desktop navigation does not fetch categories until keyboard focus opens a menu", async () => {
  await act(() => root.render(React.createElement(EcosystemTabFilters)));
  expect(fetch).not.toHaveBeenCalled();
  await act(() => container.querySelector('a[href="/devtools"]').focus());
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("Loaded tools");
});

test("concurrent menus share one pending category request", async () => {
  let resolve;
  fetch.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await act(() =>
    root.render(React.createElement(React.Fragment, null, React.createElement(Menu), React.createElement(Menu))),
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => resolve(response()));
  expect([...container.querySelectorAll("output")].map((node) => node.textContent)).toEqual([
    "Loaded tools",
    "Loaded tools",
  ]);
});

test("reopening a menu reuses public categories briefly and refreshes them after expiry", async () => {
  await act(() => root.render(React.createElement(Menu)));
  await act(() => root.render(React.createElement(Menu, { enabled: false })));
  await act(() => root.render(React.createElement(Menu)));
  expect(fetch).toHaveBeenCalledTimes(1);
  now += 60_001;
  await act(() => root.render(React.createElement(Menu, { enabled: false })));
  await act(() => root.render(React.createElement(Menu)));
  expect(fetch).toHaveBeenCalledTimes(2);
});

test("failed category requests are retried when a menu reopens", async () => {
  fetch.mockResolvedValueOnce({ ok: false });
  await act(() => root.render(React.createElement(Menu)));
  expect(container.textContent).toContain("Documents");
  await act(() => root.render(React.createElement(Menu, { enabled: false })));
  await act(() => root.render(React.createElement(Menu)));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(container.textContent).toBe("Loaded tools");
});

test("closing one menu does not cancel a shared request needed by another menu", async () => {
  let resolve;
  fetch.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const render = (enabled) =>
    React.createElement(React.Fragment, null, React.createElement(Menu, { enabled }), React.createElement(Menu));
  await act(() => root.render(render(true)));
  await act(() => root.render(render(false)));
  await act(async () => resolve(response()));
  expect(container.querySelectorAll("output")[0].textContent).toContain("Documents");
  expect(container.querySelectorAll("output")[1].textContent).toBe("Loaded tools");
});
