import { expect, test } from "vitest";
import { resolveCategoryKey, TOOL_CATEGORIES } from "../lib/tool-framework/categories.ts";

test("category filters resolve both canonical keys and existing display-name links", () => {
  for (const [key, { app, label }] of Object.entries(TOOL_CATEGORIES)) {
    expect(resolveCategoryKey(key, app)).toBe(key);
    expect(resolveCategoryKey(label, app)).toBe(key);
  }
});

test("category filters tolerate surrounding whitespace and letter case", () => {
  expect(resolveCategoryKey("  Developer Generators  ", "devtools")).toBe("developer-generators");
  expect(resolveCategoryKey("IMAGE-EDITING", "media")).toBe("image-editing");
  expect(resolveCategoryKey("csv & data tools", "devtools")).toBe("csv-data-tools");
});

test("category filters stay scoped to their tool suite", () => {
  expect(resolveCategoryKey("image-editing", "devtools")).toBe("");
  expect(resolveCategoryKey("Image Editing", "devtools")).toBe("");
  expect(resolveCategoryKey("developer-generators", "media")).toBe("");
  expect(resolveCategoryKey("Developer Generators", "media")).toBe("");
});

test("blank and unknown category filters are ignored", () => {
  for (const value of ["", "   ", "unknown-category", "toString", "__proto__"]) {
    expect(resolveCategoryKey(value, "devtools")).toBe("");
    expect(resolveCategoryKey(value, "media")).toBe("");
  }
});
