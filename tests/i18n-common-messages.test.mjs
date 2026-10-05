import { expect, test } from "vitest";
import { createTranslator } from "next-intl";
import { locales } from "../lib/i18n/config.ts";
import { getCommonMessages } from "../lib/i18n/messages.ts";
import { parse } from "@formatjs/icu-messageformat-parser";

function valuesFor(message, count) {
  const values = {};
  function visit(elements) {
    for (const element of elements) {
      if (element.type === 1) values[element.value] = "Example";
      if ([2, 3, 4, 6].includes(element.type)) values[element.value] = count;
      if (element.type === 5) values[element.value] = "other";
      if (element.type === 8) {
        values[element.value] = (chunks) => chunks;
        visit(element.children);
      }
      if (element.options) Object.values(element.options).forEach((option) => visit(option.value));
    }
  }
  visit(parse(message));
  return values;
}

test("every shared locale formats all shared messages, including plural branches", () => {
  const reference = getCommonMessages("en");
  for (const locale of locales) {
    const messages = getCommonMessages(locale);
    expect(Object.keys(messages).sort()).toEqual(Object.keys(reference).sort());
    for (const [namespace, entries] of Object.entries(messages)) {
      expect(Object.keys(entries).sort()).toEqual(Object.keys(reference[namespace]).sort());
      const errors = [];
      const t = createTranslator({ locale, messages, namespace, onError: (error) => errors.push(error) });
      for (const key of Object.keys(entries)) {
        for (const count of [0, 1, 2, 5, 11, 21, 100]) {
          expect(t.rich(key, valuesFor(entries[key], count))).not.toBe("");
        }
      }
      expect(errors, `${locale}.${namespace}`).toEqual([]);
    }
  }
});
