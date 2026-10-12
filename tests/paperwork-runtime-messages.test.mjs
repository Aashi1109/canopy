import { expect, test } from "vitest";
import { parse } from "@formatjs/icu-messageformat-parser";
import { getPaperworkRuntimeCorrections, getPaperworkToolMessages } from "../lib/paperwork/toolMessages.ts";

const tools = [
  "invoice-generator",
  "receipt-generator",
  "expense-report",
  "mileage-log",
  "quarterly-tax-estimator",
  "w9-request",
  "1099-nec-tracker",
];
const locales = ["en", "ar", "de", "es", "fr", "hi", "ja", "ru", "pt-BR", "zh-Hans"];

test("reviewed runtime corrections retain supported localized messages and exclude managed metadata", () => {
  expect(getPaperworkRuntimeCorrections("receipt-generator", "fr")["runtime.receipt.amountReceived"]).toBe(
    "Montant reçu",
  );
  expect(getPaperworkRuntimeCorrections("receipt-generator", "fr")["runtime.shared.preview.retry"]).toBe(
    "Réessayer l’aperçu",
  );
  for (const tool of tools) {
    for (const locale of locales) {
      const corrections = getPaperworkRuntimeCorrections(tool, locale);
      expect(corrections.name).toBeUndefined();
      expect(corrections.description).toBeUndefined();
      for (const [key, message] of Object.entries(corrections)) {
        expect(key.startsWith("runtime.")).toBe(true);
        expect(typeof message).toBe("string");
        expect(() => parse(message)).not.toThrow();
        const argumentsOf = (value) =>
          [...new Set([...value.matchAll(/\{(\w+)(?:[,}])/g)].map((match) => match[1]))].sort();
        expect(argumentsOf(message)).toEqual(argumentsOf(getPaperworkToolMessages(tool)[key]));
      }
    }
    expect(getPaperworkToolMessages(tool)["runtime.shared.storage.retry"]).toBe("Retry online save");
  }
});

test("published older Paperwork messages remain routable after reviewed runtime updates", async () => {
  const { resolvePaperworkTranslation } = await import("../lib/paperwork/toolMessages.ts");
  for (const tool of tools) {
    const required = { name: "Managed tool", description: "Managed description", ...getPaperworkToolMessages(tool) };
    const messages = { ...required };
    for (const key of Object.keys(getPaperworkRuntimeCorrections(tool, "en"))) delete messages[key];
    const published = { en: { status: "published", messages } };
    const resolved = resolvePaperworkTranslation(published, tool, "en", required);
    expect(resolved?.messages.name).toBe("Managed tool");
    expect(resolved?.messages["runtime.shared.storage.retry"]).toBe("Retry online save");
    expect(resolved?.availableLocales).toEqual(["en"]);
    expect(resolvePaperworkTranslation({ en: { status: "draft", messages } }, tool, "en", required)).toBeNull();
    expect(resolvePaperworkTranslation(published, tool, "fr", required)).toBeNull();
    expect(
      resolvePaperworkTranslation(
        { en: { status: "published", messages: { ...messages, name: "" } } },
        tool,
        "en",
        required,
      ),
    ).toBeNull();
  }
});
