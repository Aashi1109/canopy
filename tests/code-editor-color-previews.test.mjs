// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import CodeEditorImpl from "../components/content/CodeEditorImpl.tsx";

let container;
let root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(value, props = {}) {
  await act(() => root.render(React.createElement(CodeEditorImpl, { value, language: "text", ...props })));
  return EditorView.findFromDOM(container.querySelector(".cm-editor"));
}

const previews = () => [...container.querySelectorAll(".cm-colorPreview")];

test("hex previews support all CSS hex lengths without changing source or selected text", async () => {
  const value = ":root { --one: #abc; --two: #ABCD; --three: #123456; --four: #12345678; }";
  const view = await render(value, { colorPreviews: true, readOnly: true });
  expect(previews()).toHaveLength(4);
  expect(
    previews().every((swatch) => swatch.style.backgroundColor && swatch.getAttribute("aria-hidden") === "true"),
  ).toBe(true);
  expect(previews().every((swatch) => swatch.textContent === "")).toBe(true);
  expect(view.state.doc.toString()).toBe(value);
  await act(() => view.dispatch({ selection: { anchor: 0, head: value.length } }));
  expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe(value);
  expect(view.state.readOnly).toBe(true);
});

test("hex previews ignore incomplete, oversized, and embedded color-like tokens", async () => {
  const value =
    '#ab #abcde #abcdefg #1234567 #123456789 #123456zz ##fff name#fff #fff-name #fff_name é#fff #fffé "#fff"';
  await render(value, { colorPreviews: true });
  expect(previews()).toHaveLength(1);
  expect(previews()[0].style.backgroundColor).toBe("rgb(255, 255, 255)");
});

test("previews are optional and update when output colors change", async () => {
  await render("#000");
  expect(previews()).toHaveLength(0);
  await render("#000", { colorPreviews: true });
  expect(previews()[0].style.backgroundColor).toBe("rgb(0, 0, 0)");
  await render("#fff #12345", { colorPreviews: true });
  expect(previews()).toHaveLength(1);
  expect(previews()[0].style.backgroundColor).toBe("rgb(255, 255, 255)");
  await render("#fff", { colorPreviews: false });
  expect(previews()).toHaveLength(0);
});
