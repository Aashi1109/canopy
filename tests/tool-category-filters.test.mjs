import assert from "node:assert/strict";
import test from "node:test";
import { resolveCategoryKey, TOOL_CATEGORIES } from "../lib/tool-framework/categories.ts";

test("category filters resolve both canonical keys and existing display-name links", () => {
  for (const [key, { app, label }] of Object.entries(TOOL_CATEGORIES)) {
    assert.equal(resolveCategoryKey(key, app), key);
    assert.equal(resolveCategoryKey(label, app), key);
  }
});

test("category filters tolerate surrounding whitespace and letter case", () => {
  assert.equal(resolveCategoryKey("  Developer Generators  ", "devtools"), "developer-generators");
  assert.equal(resolveCategoryKey("IMAGE-EDITING", "media"), "image-editing");
  assert.equal(resolveCategoryKey("csv & data tools", "devtools"), "csv-data-tools");
});

test("category filters stay scoped to their tool suite", () => {
  assert.equal(resolveCategoryKey("image-editing", "devtools"), "");
  assert.equal(resolveCategoryKey("Image Editing", "devtools"), "");
  assert.equal(resolveCategoryKey("developer-generators", "media"), "");
  assert.equal(resolveCategoryKey("Developer Generators", "media"), "");
});

test("blank and unknown category filters are ignored", () => {
  for (const value of ["", "   ", "unknown-category", "toString", "__proto__"]) {
    assert.equal(resolveCategoryKey(value, "devtools"), "");
    assert.equal(resolveCategoryKey(value, "media"), "");
  }
});
