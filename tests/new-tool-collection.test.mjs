// @vitest-environment jsdom
import React, { act } from "react";
import { expect, test, vi } from "vitest";
import { ToolCollection } from "../app/new/components/ToolCollection.tsx";
import { button, click, fill, mountTool, setupReactTools } from "./helpers/react-tools.mjs";

// Animation and the shared card presentation have their own coverage. Keep the
// collection's real inputs, tabs, filtering, and incremental rendering here.
vi.mock("motion/react", () => ({
  useReducedMotion: () => true,
  motion: {
    div: ({ initial, animate, whileInView, viewport, transition, ...props }) => React.createElement("div", props),
  },
}));

vi.mock("../components/ui/index", () => ({
  ToolCard: ({ href, title, description, status }) =>
    React.createElement("a", { href }, title, " ", description, " ", status),
}));

setupReactTools();

function tool(app, id, overrides = {}) {
  return {
    app,
    toolId: `${app}:${id}`,
    name: `${app} ${id}`,
    description: "A useful tool",
    href: `/${app}/${id}`,
    keywords: [],
    icon: { kind: "url", url: "/favicon.ico" },
    ...overrides,
  };
}

function suite(app, count, overrides) {
  return Array.from({ length: count }, (_, index) => tool(app, String(index + 1), overrides));
}

function visibleHrefs(view, tools) {
  const toolHrefs = new Set(tools.map((item) => item.href));
  return [...view.container.querySelectorAll('[role="tabpanel"] a')]
    .map((link) => link.getAttribute("href"))
    .filter((href) => toolHrefs.has(href));
}

function tab(view, label) {
  return [...view.container.querySelectorAll('[role="tab"]')].find((item) => item.textContent.startsWith(label));
}

async function selectTab(view, label) {
  const target = tab(view, label);
  expect(target).toBeTruthy();
  await act(async () => {
    target.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true }));
  });
  expect(target.getAttribute("aria-selected")).toBe("true");
}

const searchInput = (view) => view.container.querySelector('input[type="search"]');
const moreButton = (view) => button(/^Show \d+ more/, view.container);

test("the initial collection represents every suite and reveals six more tools at a time", async () => {
  const tools = [...suite("devtools", 5), ...suite("media", 5), ...suite("paperwork", 3)];
  const view = await mountTool(React.createElement(ToolCollection, { tools }));
  const expected = [
    "/devtools/1",
    "/media/1",
    "/paperwork/1",
    "/devtools/2",
    "/media/2",
    "/paperwork/2",
    "/devtools/3",
    "/media/3",
    "/paperwork/3",
    "/devtools/4",
    "/media/4",
    "/devtools/5",
    "/media/5",
  ];

  expect(visibleHrefs(view, tools)).toEqual(expected.slice(0, 6));
  expect(moreButton(view).textContent).toContain("Show 6 more");
  await click(moreButton(view));
  expect(visibleHrefs(view, tools)).toEqual(expected.slice(0, 12));
  expect(moreButton(view).textContent).toContain("Show 1 more");
  await click(moreButton(view));
  expect(visibleHrefs(view, tools)).toEqual(expected);
  expect(moreButton(view)).toBeUndefined();
});

test("uneven or absent suites never duplicate tools or invent unavailable tools", async () => {
  for (const tools of [[...suite("devtools", 8), ...suite("media", 1)], suite("paperwork", 8)]) {
    const view = await mountTool(React.createElement(ToolCollection, { tools }));
    expect(visibleHrefs(view, tools)).toHaveLength(6);
    await click(moreButton(view));
    const hrefs = visibleHrefs(view, tools);
    expect(new Set(hrefs).size).toBe(tools.length);
    expect([...hrefs].sort()).toEqual(tools.map((item) => item.href).sort());
    for (const app of ["devtools", "media", "paperwork"]) {
      expect(hrefs.filter((href) => href.startsWith(`/${app}/`))).toEqual(
        tools.filter((item) => item.app === app).map((item) => item.href),
      );
    }
    await view.unmount();
  }
});

test("search keeps relevance order, reports per-suite counts, and resets expansion with either filter", async () => {
  const developers = suite("devtools", 8, { keywords: ["json"] });
  const tools = [
    ...developers,
    tool("media", "json", { name: "JSON" }),
    tool("paperwork", "export", { name: "JSON export" }),
    tool("media", "other"),
  ];
  const view = await mountTool(React.createElement(ToolCollection, { tools }));
  await click(moreButton(view));
  expect(visibleHrefs(view, tools)).toHaveLength(11);

  await fill(searchInput(view), "json");
  expect(visibleHrefs(view, tools)).toEqual([
    "/media/json",
    "/paperwork/export",
    "/devtools/1",
    "/devtools/2",
    "/devtools/3",
    "/devtools/4",
  ]);
  for (const [label, count] of [
    ["All tools", 10],
    ["Developer", 8],
    ["Media", 1],
    ["Paperwork", 1],
  ]) {
    expect(tab(view, label).textContent).toMatch(new RegExp(`${label}\\s*${count}$`));
  }

  await click(moreButton(view));
  expect(visibleHrefs(view, tools)).toHaveLength(10);
  await selectTab(view, "Developer");
  expect(visibleHrefs(view, tools)).toEqual(developers.slice(0, 6).map((item) => item.href));
  await click(moreButton(view));
  expect(visibleHrefs(view, tools)).toHaveLength(8);
  await selectTab(view, "All tools");
  expect(visibleHrefs(view, tools)).toHaveLength(6);
});

test("suggested searches only offer matching tools and clear an incompatible category", async () => {
  const tools = [...suite("devtools", 7, { keywords: ["json"] }), tool("media", "merge", { name: "Merge PDF" })];
  const view = await mountTool(React.createElement(ToolCollection, { tools }));
  expect(button("JSON", view.container)).toBeTruthy();
  expect(button("PDF", view.container)).toBeTruthy();
  expect(button("Invoice", view.container)).toBeUndefined();

  await selectTab(view, "Developer");
  await click(moreButton(view));
  await click(button("PDF", view.container));
  expect(searchInput(view).value).toBe("PDF");
  expect(tab(view, "All tools").getAttribute("aria-selected")).toBe("true");
  expect(visibleHrefs(view, tools)).toEqual(["/media/merge"]);
  await click(button("JSON", view.container));
  expect(searchInput(view).value).toBe("JSON");
  expect(visibleHrefs(view, tools)).toHaveLength(6);
});

test("an empty search can restore the complete collection with its initial limit", async () => {
  const tools = [...suite("devtools", 7), ...suite("media", 2)];
  const view = await mountTool(React.createElement(ToolCollection, { tools }));
  await selectTab(view, "Developer");
  await click(moreButton(view));
  await fill(searchInput(view), "no-such-shortcut");
  expect(visibleHrefs(view, tools)).toEqual([]);
  expect(moreButton(view)).toBeUndefined();
  await click(button("Show all tools", view.container));
  expect(searchInput(view).value).toBe("");
  expect(tab(view, "All tools").getAttribute("aria-selected")).toBe("true");
  expect(visibleHrefs(view, tools)).toHaveLength(6);
  expect(visibleHrefs(view, tools)).toContain("/media/1");
});
