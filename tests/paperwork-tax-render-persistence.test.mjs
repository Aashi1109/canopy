// @vitest-environment jsdom
import React from "react";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import QuarterlyTaxEstimatorPage from "../app/paperwork/components/tax/QuarterlyTaxEstimatorPage.tsx";
import { DataBridge, DataBridgeKeys, LocalStorageProvider } from "../lib/paperwork/shared/dataBridge.ts";
import { getCommonMessages } from "../lib/i18n/messages.ts";
import { getPaperworkToolMessages } from "../lib/paperwork/toolMessages.ts";
import { toolMessageTree } from "../lib/tool-framework/translations.ts";
import { fill, mountTool, setupReactTools } from "./helpers/react-tools.mjs";

vi.hoisted(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false })));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal()),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/paperwork/quarterly-tax-estimator",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ locale: "en" }),
}));
setupReactTools();
const originalProvider = DataBridge.getProvider();
beforeEach(() => {
  localStorage.clear();
  DataBridge.setProvider(new LocalStorageProvider());
});
afterEach(() => {
  DataBridge.setProvider(originalProvider);
  localStorage.clear();
});

function taxView() {
  return React.createElement(
    NextIntlClientProvider,
    {
      locale: "en",
      timeZone: "UTC",
      messages: {
        ...getCommonMessages("en"),
        Tool: toolMessageTree(getPaperworkToolMessages("quarterly-tax-estimator")),
      },
    },
    React.createElement(QuarterlyTaxEstimatorPage, { onTrackClick: vi.fn() }),
  );
}

test("unrelated parent rerenders do not save unchanged tax summary again", async () => {
  const save = vi.spyOn(DataBridge, "set");
  const view = await mountTool(taxView());
  const summaryWrites = () => save.mock.calls.filter(([key]) => key === DataBridgeKeys.TAX_SUMMARY);
  expect(summaryWrites()).toHaveLength(1);
  await view.rerender(taxView());
  expect(summaryWrites()).toHaveLength(1);
  await fill(view.container.querySelector("#tax-gross-revenue"), "50000");
  expect(summaryWrites()).toHaveLength(2);
  expect(DataBridge.get(DataBridgeKeys.TAX_SUMMARY, {}).estimatedTotalTax).toBeGreaterThan(0);
});
