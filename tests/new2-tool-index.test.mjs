// @vitest-environment jsdom
import React, { act } from "react";
import { expect, test, vi } from "vitest";
import { ToolIndex } from "../app/new2/components/ToolIndex.tsx";
import { button, click, fill, mountTool, setupReactTools } from "./helpers/react-tools.mjs";

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

const suite = (app, count, overrides) =>
  Array.from({ length: count }, (_, index) => tool(app, String(index + 1), overrides));
const search = (view) => view.container.querySelector('input[type="search"]');
const more = (view) => button(/^Show \d+ more/, view.container);
const links = (view) =>
  [...view.container.querySelectorAll('[role="tabpanel"] a')].map((link) => link.getAttribute("href"));
const tab = (view, label) =>
  [...view.container.querySelectorAll('[role="tab"]')].find((item) => item.textContent.startsWith(label));

async function selectTab(view, label) {
  const target = tab(view, label);
  await act(async () => target.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true })));
  expect(target.getAttribute("aria-selected")).toBe("true");
}

test("the index preserves catalog order and reveals eight more until every tool is available", async () => {
  const tools = [...suite("devtools", 10), ...suite("media", 5), ...suite("paperwork", 2)];
  const view = await mountTool(React.createElement(ToolIndex, { tools }));
  expect(links(view)).toEqual(tools.slice(0, 8).map((item) => item.href));
  await click(more(view));
  expect(links(view)).toEqual(tools.slice(0, 16).map((item) => item.href));
  expect(more(view).textContent).toContain("Show 1 more");
  await click(more(view));
  expect(links(view)).toEqual(tools.map((item) => item.href));
  expect(more(view)).toBeUndefined();
});

test("showing more moves focus to the first new tool, including the final page", async () => {
  const tools = suite("devtools", 17);
  const view = await mountTool(React.createElement(ToolIndex, { tools }));
  more(view).focus();
  await click(more(view));
  expect(document.activeElement.getAttribute("href")).toBe(tools[8].href);

  more(view).focus();
  await click(more(view));
  expect(more(view)).toBeUndefined();
  expect(document.activeElement.getAttribute("href")).toBe(tools[16].href);

  search(view).focus();
  await fill(search(view), "devtools");
  expect(document.activeElement).toBe(search(view));
  expect(links(view)).toHaveLength(8);
});

test("search ranks matches, reports category counts, and resets expansion on search and category changes", async () => {
  const developers = suite("devtools", 10, { keywords: ["json"] });
  const tools = [
    ...developers,
    tool("media", "json", { name: "JSON" }),
    tool("paperwork", "export", { name: "JSON export" }),
    tool("media", "other"),
  ];
  const view = await mountTool(React.createElement(ToolIndex, { tools }));
  await click(more(view));
  expect(links(view)).toHaveLength(13);
  await fill(search(view), "json");
  expect(links(view)).toEqual(["/media/json", "/paperwork/export", ...developers.slice(0, 6).map((item) => item.href)]);
  for (const [label, count] of [
    ["All tools", 12],
    ["Developer", 10],
    ["Media", 1],
    ["Paperwork", 1],
  ]) {
    expect(tab(view, label).getAttribute("aria-label")).toBe(`${label}, ${count} tools`);
  }
  await click(more(view));
  expect(links(view)).toHaveLength(12);
  await selectTab(view, "Developer");
  expect(links(view)).toEqual(developers.slice(0, 8).map((item) => item.href));
  await click(more(view));
  expect(links(view)).toHaveLength(10);
  await selectTab(view, "All tools");
  expect(links(view)).toHaveLength(8);
});

test("an empty result recovers by clearing both filters and resetting the initial limit", async () => {
  const tools = [...suite("devtools", 10), ...suite("media", 2)];
  const view = await mountTool(React.createElement(ToolIndex, { tools }));
  await selectTab(view, "Developer");
  await click(more(view));
  await fill(search(view), "no-such-tool");
  expect(links(view)).toEqual([]);
  expect(more(view)).toBeUndefined();
  await click(button("Show all tools", view.container));
  expect(search(view).value).toBe("");
  expect(tab(view, "All tools").getAttribute("aria-selected")).toBe("true");
  expect(links(view)).toEqual(tools.slice(0, 8).map((item) => item.href));
});

test("unavailable and empty catalogs give usable category links without inventing tools", async () => {
  for (const unavailable of [false, true]) {
    const view = await mountTool(React.createElement(ToolIndex, { tools: [], unavailable }));
    expect(search(view)).toBeNull();
    expect([...view.container.querySelectorAll("a")].map((link) => link.getAttribute("href"))).toEqual([
      "/devtools",
      "/media",
      "/paperwork",
    ]);
    expect(Boolean(button("Try again", view.container))).toBe(unavailable);
    await view.unmount();
  }
});

test("horizontal categories support keyboard selection, wraparound, and first and last shortcuts", async () => {
  const tools = [...suite("devtools", 2), ...suite("media", 2), ...suite("paperwork", 1)];
  const view = await mountTool(React.createElement(ToolIndex, { tools }));
  await act(async () => tab(view, "All tools").focus());

  for (const [key, label, expectedLinks] of [
    ["ArrowRight", "Developer", ["/devtools/1", "/devtools/2"]],
    ["End", "Paperwork", ["/paperwork/1"]],
    ["ArrowRight", "All tools", tools.map((item) => item.href)],
    ["ArrowLeft", "Paperwork", ["/paperwork/1"]],
    ["Home", "All tools", tools.map((item) => item.href)],
  ]) {
    await act(async () => {
      document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.activeElement).toBe(tab(view, label));
    expect(tab(view, label).getAttribute("aria-selected")).toBe("true");
    expect(links(view)).toEqual(expectedLinks);
  }
});
