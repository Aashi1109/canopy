// @vitest-environment jsdom
import React, { act } from "react";
import { expect, test, vi } from "vitest";
import { WorktableHero } from "../app/new2/components/WorktableHero.tsx";
import { button, click, mountTool, setupReactTools, waitFor } from "./helpers/react-tools.mjs";

// jsdom has no scrolling layout. Keep actual motion values and rendering so
// keyboard movement checks the rendered position, not only its announcement.
vi.mock("motion/react", async (importOriginal) => {
  const motion = await importOriginal();
  return {
    ...motion,
    useReducedMotion: () => true,
    useScroll: () => ({ scrollYProgress: motion.useMotionValue(0) }),
  };
});

setupReactTools();

const categories = ["Developer", "Media", "Paperwork"];
const actions = ["Minify sample", "Crop sample", "Finish sample"];
const resets = ["Format sample", "Reset crop", "Reset receipt"];
const publishedTools = [
  { app: "devtools", href: "/devtools/json-formatter", name: "JSON Formatter" },
  { app: "media", href: "/media/crop-image", name: "Crop Image" },
  { app: "paperwork", href: "/paperwork/receipt-generator", name: "Receipt Generator" },
];

const sample = (view, name) => view.container.querySelector(`[role="region"][aria-label="${name} sample"]`);
const card = (view, name) => sample(view, name).closest('[data-slot="card"]');
const status = (view, name) => card(view, name).querySelector('[role="status"]').textContent;
const code = (view) => sample(view, "Developer").querySelector("pre code").textContent;
const image = (view) => sample(view, "Media").querySelector('svg[role="img"]');
const openTool = (view, name) => card(view, name).querySelector('a[aria-label^="Open "]');
const choice = (view, name) => button(name, view.container.querySelector('[role="group"]'));
const action = (view, label) => button(new RegExp(`^${label}`), view.container);

async function press(element, key) {
  await act(async () => {
    element.focus();
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

function positionTransforms(view, name) {
  const transforms = [];
  for (let element = sample(view, name); element && element.tagName !== "SECTION"; element = element.parentElement) {
    if (element.style.transform) transforms.push(element.style.transform);
  }
  return transforms;
}

test("all desktop previews are available and JSON minification preserves data before reformatting", async () => {
  const view = await mountTool(React.createElement(WorktableHero, { tools: publishedTools }));
  for (const name of categories) expect(sample(view, name)).toBeTruthy();
  expect(choice(view, "Media").getAttribute("aria-pressed")).toBe("true");
  const original = code(view);
  const data = JSON.parse(original);
  expect(original).toBe(JSON.stringify(data, null, 2));

  await click(action(view, "Minify sample"));
  expect(code(view)).toBe(JSON.stringify(data));
  expect(status(view, "Developer")).toMatch(/minified.*same data/i);

  await click(action(view, "Format sample"));
  expect(code(view)).toBe(original);
  expect(status(view, "Developer")).toMatch(/two-space indentation/i);
});

test("cropping shows a centered square and reset restores the original wide image", async () => {
  const view = await mountTool(React.createElement(WorktableHero, { tools: [] }));
  const originalViewBox = image(view).getAttribute("viewBox").split(" ").map(Number);
  expect(originalViewBox[2] / originalViewBox[3]).toBeCloseTo(5 / 3);

  await click(action(view, "Crop sample"));
  const cropViewBox = image(view).getAttribute("viewBox").split(" ").map(Number);
  expect(cropViewBox[2]).toBe(cropViewBox[3]);
  expect(cropViewBox[0] + cropViewBox[2] / 2).toBe(originalViewBox[0] + originalViewBox[2] / 2);
  expect(cropViewBox[1] + cropViewBox[3] / 2).toBe(originalViewBox[1] + originalViewBox[3] / 2);
  expect(image(view).getAttribute("aria-label")).toMatch(/square crop/i);
  expect(status(view, "Media")).toMatch(/cropped to a square/i);

  await click(action(view, "Reset crop"));
  expect(image(view).getAttribute("viewBox").split(" ").map(Number)).toEqual(originalViewBox);
  expect(image(view).getAttribute("aria-label")).toMatch(/wide illustration/i);
});

test("finishing a receipt marks the sample paid while explicitly reporting that no money was collected", async () => {
  const view = await mountTool(React.createElement(WorktableHero, { tools: [] }));
  const receipt = () => sample(view, "Paperwork").textContent;
  expect(receipt()).not.toContain("THANK YOU");
  expect(receipt()).toContain("NO REAL TRANSACTION");
  expect(receipt()).toContain("Total paid—");

  await click(action(view, "Finish sample"));
  expect(receipt()).toContain("PAIDTHANK YOU");
  expect(receipt()).toContain("Total paid$120.00");
  expect(status(view, "Paperwork")).toMatch(/sample receipt marked paid/i);
  expect(status(view, "Paperwork")).toMatch(/no payment has been collected/i);

  await click(action(view, "Reset receipt"));
  expect(receipt()).not.toContain("THANK YOU");
  expect(receipt()).toContain("Total paid—");
});

test("transformations remain independent while selecting or resetting another preview", async () => {
  const view = await mountTool(React.createElement(WorktableHero, { tools: [] }));
  for (const label of actions) await click(action(view, label));
  for (const name of categories) {
    choice(view, name).focus();
    await click(choice(view, name));
    expect(document.activeElement).toBe(choice(view, name));
    for (const category of categories) {
      expect(choice(view, category).getAttribute("aria-pressed")).toBe(String(category === name));
    }
    for (const label of resets) expect(action(view, label)).toBeTruthy();
  }

  await click(action(view, "Reset crop"));
  expect(image(view).getAttribute("aria-label")).toMatch(/wide illustration/i);
  expect(code(view)).not.toContain("\n");
  expect(sample(view, "Paperwork").textContent).toContain("PAIDTHANK YOU");
});

test("keyboard handles move and select previews, Home restores them, and layout reset retains sample outputs", async () => {
  const view = await mountTool(React.createElement(WorktableHero, { tools: [] }));
  const developerHandle = button("Move Developer preview", view.container);
  await press(developerHandle, "ArrowRight");
  expect(document.activeElement).toBe(developerHandle);
  expect(choice(view, "Developer").getAttribute("aria-pressed")).toBe("true");
  expect(status(view, "Developer")).toMatch(/moved right/i);
  await waitFor(() =>
    expect(positionTransforms(view, "Developer").some((value) => /translateX\(15px\)/.test(value))).toBe(true),
  );

  await press(developerHandle, "Home");
  expect(status(view, "Developer")).toMatch(/preview reset/i);
  await waitFor(() =>
    expect(positionTransforms(view, "Developer").some((value) => /translateX\(15px\)/.test(value))).toBe(false),
  );

  await press(developerHandle, "ArrowDown");
  for (const label of actions) await click(action(view, label));
  await waitFor(() =>
    expect(positionTransforms(view, "Developer").some((value) => /translateY\(15px\)/.test(value))).toBe(true),
  );
  await click(button("Reset layout", view.container));
  await waitFor(() =>
    expect(positionTransforms(view, "Developer").some((value) => /translateY\(15px\)/.test(value))).toBe(false),
  );
  expect(choice(view, "Media").getAttribute("aria-pressed")).toBe("true");
  for (const label of resets) expect(action(view, label)).toBeTruthy();
  expect(status(view, "Developer")).toMatch(/minified/i);
});

test("a sample action announces its outcome even after the preview has moved", async () => {
  const view = await mountTool(React.createElement(WorktableHero, { tools: [] }));
  for (let index = 0; index < categories.length; index += 1) {
    await press(button(`Move ${categories[index]} preview`, view.container), "ArrowRight");
    expect(status(view, categories[index])).toMatch(/moved right/i);
    await click(action(view, actions[index]));
    expect(status(view, categories[index])).not.toMatch(/moved right/i);
    expect(status(view, categories[index])).toMatch(
      [/minified/i, /cropped to a square/i, /no payment has been collected/i][index],
    );
  }
});

test("each preview opens its exact published tool even when the suite has other tools", async () => {
  const tools = [
    ...publishedTools.map((tool) => ({ ...tool, href: `/${tool.app}/other`, name: "Another tool" })),
    ...publishedTools,
  ];
  const view = await mountTool(React.createElement(WorktableHero, { tools }));
  for (let index = 0; index < publishedTools.length; index += 1) {
    expect(openTool(view, categories[index]).getAttribute("href")).toBe(publishedTools[index].href);
    expect(openTool(view, categories[index]).getAttribute("aria-label")).toBe(`Open ${publishedTools[index].name}`);
    await click(action(view, actions[index]));
    expect(openTool(view, categories[index]).getAttribute("href")).toBe(publishedTools[index].href);
  }
});

test("an unavailable catalog retains working samples and collection destinations", async () => {
  for (const unavailable of [false, true]) {
    const view = await mountTool(React.createElement(WorktableHero, { tools: [], unavailable }));
    for (let index = 0; index < publishedTools.length; index += 1) {
      expect(openTool(view, categories[index]).getAttribute("href")).toBe(`/${publishedTools[index].app}`);
      expect(openTool(view, categories[index]).getAttribute("aria-label")).toBe(`Open ${categories[index]} tools`);
      await click(action(view, actions[index]));
      expect(action(view, resets[index])).toBeTruthy();
    }
    await view.unmount();
  }
});

test("compact selection retains results while presenting one usable preview at a time", async () => {
  vi.stubGlobal("matchMedia", (query) => ({
    matches: query === "(max-width: 640px)",
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  }));
  const view = await mountTool(React.createElement(WorktableHero, { tools: [] }));
  expect(sample(view, "Media")).toBeTruthy();
  expect(sample(view, "Developer")).toBeNull();
  expect(button("Move Media preview", view.container)).toBeUndefined();
  await click(action(view, "Crop sample"));
  await click(choice(view, "Developer"));
  expect(sample(view, "Media")).toBeNull();
  await click(action(view, "Minify sample"));
  await click(choice(view, "Media"));
  expect(image(view).getAttribute("aria-label")).toMatch(/square crop/i);
  await click(choice(view, "Developer"));
  expect(code(view)).not.toContain("\n");
});
