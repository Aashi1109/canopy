// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getCommonMessages } from "../lib/i18n/messages.ts";

let root;
let container;
let EcosystemTabFilters;
let useEcosystemGroups;
let NextIntlClientProvider;
let now;
const response = (locale = "en") => ({
  ok: true,
  json: async () => ({
    groups: [
      {
        id: "developer",
        label: "Developer",
        href: "/devtools",
        count: 1,
        categories: [],
        tools: [
          {
            toolId: "devtools.json-formatter",
            name: locale === "es" ? "Herramientas cargadas" : "Loaded tools",
            href: locale === "es" ? "/es/devtools/json-formatter" : "/devtools/json-formatter",
            icon: { kind: "url", url: "/favicon.ico" },
          },
        ],
      },
    ],
  }),
});

beforeEach(async () => {
  vi.resetModules();
  ({ NextIntlClientProvider } = await import("next-intl"));
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
      .map((group) => group.tools.map((tool) => tool.name).join(", ") || group.label)
      .join(", "),
  );
}

function localized(node, locale = "en") {
  return React.createElement(
    NextIntlClientProvider,
    { locale, messages: getCommonMessages(locale), timeZone: "UTC" },
    node,
  );
}

const render = (node, locale) => root.render(localized(node, locale));

test("closed desktop navigation does not fetch categories until keyboard focus opens a menu", async () => {
  await act(() => render(React.createElement(EcosystemTabFilters)));
  expect(fetch).not.toHaveBeenCalled();
  await act(() => container.querySelector('a[href="/devtools"]').focus());
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith("/api/tools/ecosystem?locale=en");
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
    render(React.createElement(React.Fragment, null, React.createElement(Menu), React.createElement(Menu))),
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => resolve(response()));
  expect([...container.querySelectorAll("output")].map((node) => node.textContent)).toEqual([
    "Loaded tools",
    "Loaded tools",
  ]);
});

test("reopening a menu reuses public categories briefly and refreshes them after expiry", async () => {
  await act(() => render(React.createElement(Menu)));
  await act(() => render(React.createElement(Menu, { enabled: false })));
  await act(() => render(React.createElement(Menu)));
  expect(fetch).toHaveBeenCalledTimes(1);
  now += 60_001;
  await act(() => render(React.createElement(Menu, { enabled: false })));
  await act(() => render(React.createElement(Menu)));
  expect(fetch).toHaveBeenCalledTimes(2);
});

test("failed category requests are retried when a menu reopens", async () => {
  fetch.mockResolvedValueOnce({ ok: false });
  await act(() => render(React.createElement(Menu)));
  expect(container.textContent).toContain("Documents");
  await act(() => render(React.createElement(Menu, { enabled: false })));
  await act(() => render(React.createElement(Menu)));
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
  const menus = (enabled) =>
    React.createElement(React.Fragment, null, React.createElement(Menu, { enabled }), React.createElement(Menu));
  await act(() => render(menus(true)));
  await act(() => render(menus(false)));
  await act(async () => resolve(response()));
  expect(container.querySelectorAll("output")[0].textContent).toContain("Documents");
  expect(container.querySelectorAll("output")[1].textContent).toBe("Loaded tools");
});

test("locale changes fetch separate categories and reuse only the matching locale cache", async () => {
  fetch.mockImplementation(async (url) => response(new URL(url, "https://app.test").searchParams.get("locale")));
  await act(() => render(React.createElement(Menu), "en"));
  expect(container.textContent).toBe("Loaded tools");
  await act(() => render(React.createElement(Menu, { enabled: false }), "es"));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(container.textContent).not.toContain("Loaded tools");
  await act(() => render(React.createElement(Menu), "es"));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenLastCalledWith("/api/tools/ecosystem?locale=es");
  expect(container.textContent).toBe("Herramientas cargadas");
  await act(() => render(React.createElement(Menu), "en"));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(container.textContent).toBe("Loaded tools");
});

test("simultaneous menus in different locales do not share pending requests or results", async () => {
  const requests = new Map();
  fetch.mockImplementation(
    (url) =>
      new Promise((resolve) => {
        requests.set(new URL(url, "https://app.test").searchParams.get("locale"), resolve);
      }),
  );
  await act(() =>
    root.render(
      React.createElement(
        React.Fragment,
        null,
        localized(React.createElement(Menu), "en"),
        localized(React.createElement(Menu), "es"),
      ),
    ),
  );
  expect(fetch).toHaveBeenCalledTimes(2);
  await act(async () => requests.get("es")(response("es")));
  expect(container.querySelectorAll("output")[0].textContent).toContain("Documents");
  expect(container.querySelectorAll("output")[1].textContent).toBe("Herramientas cargadas");
  await act(async () => requests.get("en")(response()));
  expect([...container.querySelectorAll("output")].map((node) => node.textContent)).toEqual([
    "Loaded tools",
    "Herramientas cargadas",
  ]);
});

test("a previous locale response cannot overwrite a menu after switching language", async () => {
  const requests = new Map();
  fetch.mockImplementation(
    (url) =>
      new Promise((resolve) => {
        requests.set(new URL(url, "https://app.test").searchParams.get("locale"), resolve);
      }),
  );
  await act(() => render(React.createElement(Menu), "en"));
  await act(() => render(React.createElement(Menu), "es"));
  await act(async () => requests.get("es")(response("es")));
  await act(async () => requests.get("en")(response()));
  expect(container.textContent).toBe("Herramientas cargadas");
});
