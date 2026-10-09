// @vitest-environment jsdom
import React from "react";
import { expect, test, vi } from "vitest";
import { createTranslator } from "use-intl/core";
import { JsonResultRenderer } from "../components/JsonResultRenderer.tsx";
import { getJsonRendererMessages } from "../lib/i18n/jsonRendererMessages.ts";
import { setupReactTools, mountTool, fill, field, button, click } from "./helpers/react-tools.mjs";
import { press } from "./helpers/json-workspaces.mjs";

vi.mock("@/components/content/CodeEditor", async () => ({
  CodeEditor: (await import("./helpers/react-tools.mjs")).TextEditorBoundary,
}));
setupReactTools();

test("localized JSON editing and copy actions preserve exact keys and user-entered values", async () => {
  const messages = getJsonRendererMessages("hi");
  const t = createTranslator({ locale: "hi", messages });
  expect(t("jsonCopyJsonResult")).not.toBe(getJsonRendererMessages("en").jsonCopyJsonResult);
  const clipboard = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: clipboard } });
  await mountTool(
    React.createElement(JsonResultRenderer, {
      value: { name: "Ada", active: false, id: "9007199254740993" },
      defaultView: "form",
    }),
    { locale: "hi" },
  );
  const name = field(t("jsonEditLabel", { label: "name" }));
  expect(name).toBeTruthy();
  await fill(name, "नया नाम");
  await press(name, "Enter");
  await click(button(t("jsonCopyJsonResult")));
  expect(JSON.parse(clipboard.mock.calls.at(-1)[0])).toEqual({
    name: "नया नाम",
    active: false,
    id: "9007199254740993",
  });
});

test("localized JSON summaries use native plural messages while search leaves content unchanged", async () => {
  const t = createTranslator({ locale: "ar", messages: getJsonRendererMessages("ar") });
  expect(t("jsonSearchJsonResult")).not.toBe(getJsonRendererMessages("en").jsonSearchJsonResult);
  const view = await mountTool(
    React.createElement(JsonResultRenderer, {
      value: ["alpha", "beta"],
      defaultView: "read-only",
    }),
    { locale: "ar" },
  );
  expect(view.container.textContent).toContain(t("jsonItemCount", { count: 2 }));
  await fill(field(t("jsonSearchJsonResult")), "missing");
  expect(view.container.textContent).toContain(t("jsonNoKeysOrValuesMatch", { query: "missing" }));
  await fill(field(t("jsonSearchJsonResult")), "");
  expect(view.container.textContent).toContain('"alpha"');
  expect(view.container.textContent).toContain('"beta"');
});
