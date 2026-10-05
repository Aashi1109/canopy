// @vitest-environment jsdom
import React, { act } from "react";
import { expect, test } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import ContactForm from "../app/contact/ContactForm.tsx";
import { getInfoMessages } from "../lib/i18n/infoMessages.ts";
import { fill, mountTool, setupReactTools } from "./helpers/react-tools.mjs";

setupReactTools();

async function mountContact(locale, supportEmail = "support@example.test") {
  return mountTool(
    React.createElement(
      NextIntlClientProvider,
      { locale, messages: getInfoMessages(locale), timeZone: "UTC" },
      React.createElement(ContactForm, { supportEmail }),
    ),
  );
}

test("contact native validation uses the selected language and clears after correction", async () => {
  const view = await mountContact("es");
  const name = view.container.querySelector('[name="name"]');
  const email = view.container.querySelector('[name="email"]');

  expect(name.checkValidity()).toBe(false);
  expect(name.validationMessage).toBe("Completa este campo.");
  await fill(name, "Jane Cooper");
  expect(name.checkValidity()).toBe(true);
  expect(name.validationMessage).toBe("");

  await fill(email, "invalid-address");
  expect(email.checkValidity()).toBe(false);
  expect(email.validationMessage).toBe("Introduce una dirección de correo válida.");
  await fill(email, "jane@example.test");
  expect(email.checkValidity()).toBe(true);
  expect(email.validationMessage).toBe("");
});

test("a missing support address reports a localized recoverable error", async () => {
  const view = await mountContact("ar", "");
  await act(async () => {
    view.container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(view.container.textContent).toContain("لم تُعدّ خدمة التواصل بعد. يُرجى استخدام موارد المساعدة.");
  expect(view.container.querySelector("form")).not.toBeNull();
});
