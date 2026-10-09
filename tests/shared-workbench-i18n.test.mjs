// @vitest-environment jsdom
import React, { act, useState } from "react";
import { expect, test, vi } from "vitest";
import { createTranslator } from "next-intl";
import { ResultActions } from "../components/ResultView.tsx";
import { ColorChipInput } from "../app/devtools/components/color-design/ColorChipInput.tsx";
import { getCommonMessages } from "../lib/i18n/messages.ts";
import { setupReactTools, mountTool, fill, click, button } from "./helpers/react-tools.mjs";

setupReactTools();

const translator = (locale) =>
  createTranslator({ locale, messages: getCommonMessages(locale), namespace: "Workbench" });

test.each(["hi", "ar", "ja"])("%s copy control preserves the exact source bytes", async (locale) => {
  const raw = '{"label":"مرحبا नमस्ते 日本語","value":"{name}"}\n';
  const writeText = vi.fn(async () => {});
  vi.stubGlobal("navigator", Object.defineProperty(Object.create(navigator), "clipboard", { value: { writeText } }));
  const view = await mountTool(
    React.createElement(ResultActions, { canCopy: true, canDownload: false, result: { render: "text", text: raw } }),
    { locale },
  );
  await click(button(translator(locale)("copyAll"), view.container));
  expect(writeText).toHaveBeenCalledExactlyOnceWith(raw);
});

test("French color validation and editing retain CSS values and recover after an invalid entry", async () => {
  const changes = vi.fn();
  function Fixture() {
    const [value, setValue] = useState("");
    return React.createElement(ColorChipInput, {
      value,
      inputFormat: "any",
      onValueChange: (next) => {
        changes(next);
        setValue(next);
      },
    });
  }
  const view = await mountTool(React.createElement(Fixture), { locale: "fr" });
  const t = translator("fr");
  const input = view.container.querySelector("textarea");
  await fill(input, "not-a-color");
  await act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(changes).not.toHaveBeenCalled();
  expect(document.getElementById(input.getAttribute("aria-errormessage")).textContent).toBe(t("validColorRequired"));
  await fill(input, "rgb(51 102 255 / 50%)");
  await click(button(t("add"), view.container));
  expect(changes).toHaveBeenLastCalledWith("rgb(51 102 255 / 50%)");
  expect(input.getAttribute("aria-errormessage")).toBeNull();
  await click(button(t("editColor", { count: 1, value: "rgb(51 102 255 / 50%)" }), view.container));
  expect(input.value).toBe("rgb(51 102 255 / 50%)");
  await fill(input, "#3366ff80");
  await click(button(t("save"), view.container));
  expect(changes).toHaveBeenLastCalledWith("#3366ff80");
});
