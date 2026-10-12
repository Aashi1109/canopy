// @vitest-environment jsdom
import React from "react";
import { expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import AdvancedTemplateWorkspace from "../app/paperwork/components/AdvancedTemplateWorkspace.tsx";
import { DataBridge } from "../lib/paperwork/shared/dataBridge.ts";
import { createAdvancedTemplateConfig, seedTemplates } from "../lib/invoice-templates/index.ts";
import { getPaperworkToolMessages } from "../lib/paperwork/toolMessages.ts";
import { toolMessageTree } from "../lib/tool-framework/translations.ts";
import { setupReactTools, mountTool, fill, field, button, click } from "./helpers/react-tools.mjs";
const mocks = vi.hoisted(() => ({ download: vi.fn(), notify: vi.fn() }));
vi.mock("../app/paperwork/components/AdvancedDocumentPreview.tsx", () => ({
  AdvancedDocumentPreview: ({ data }) =>
    React.createElement("output", { "aria-label": "Custom preview" }, data["custom.cost"]),
  downloadAdvancedDocumentPdf: mocks.download,
  openAdvancedDocumentPdf: vi.fn(),
}));
vi.mock("../app/paperwork/components/PaperworkFeedback.tsx", () => ({
  usePaperworkFeedback: () => ({ notify: mocks.notify }),
}));
setupReactTools();
const template = {
  ...structuredClone(seedTemplates[0]),
  id: "isolated-custom",
  name: "Custom receipt",
  documentType: "receipt",
  layoutFamily: "advanced",
  status: "published",
  config: createAdvancedTemplateConfig("receipt", "RECEIPT_80MM"),
};
template.config.form.sections = [
  {
    id: "custom",
    label: "Details",
    entries: [
      {
        kind: "custom",
        key: "custom.cost",
        label: "Handling cost",
        enabled: true,
        required: false,
        control: "currency",
      },
    ],
  },
];
const adapter = {
  documentType: "receipt",
  getSampleDraft: () => ({}),
  validate: () => ({}),
  readField: () => "",
  writeField: (draft) => draft,
  toPdfInputs: (_draft, _template, custom) => ({ "custom.cost": String(custom["custom.cost"] ?? "") }),
  fileName: () => "receipt.pdf",
};
function element(props = {}) {
  return React.createElement(
    NextIntlClientProvider,
    { locale: "en", messages: { Tool: toolMessageTree(getPaperworkToolMessages("receipt-generator")) } },
    React.createElement(AdvancedTemplateWorkspace, {
      adapter,
      draft: {},
      onDraftChange: () => {},
      templates: [template],
      ...props,
    }),
  );
}
test("custom template values remain isolated when the active draft owner changes", async () => {
  localStorage.clear();
  let owner = "owner-a";
  vi.spyOn(DataBridge, "scopedLocalKey").mockImplementation((key) => `${owner}:${key}`);
  localStorage.setItem(
    `owner-a:paperworkkit.advanced-template.${template.id}.custom`,
    JSON.stringify({ "custom.cost": 12 }),
  );
  localStorage.setItem(
    `owner-b:paperworkkit.advanced-template.${template.id}.custom`,
    JSON.stringify({ "custom.cost": 28 }),
  );
  const first = await mountTool(element());
  expect(field("Handling cost", first.container).value).toBe("12");
  await fill(field("Handling cost", first.container), 14);
  await first.unmount();
  owner = "owner-b";
  const second = await mountTool(element());
  expect(field("Handling cost", second.container).value).toBe("28");
  expect(
    JSON.parse(localStorage.getItem(`owner-a:paperworkkit.advanced-template.${template.id}.custom`))["custom.cost"],
  ).toBe("14");
  localStorage.clear();
});
test("custom receipt preview stays visible and agrees with export when document settings change", async () => {
  localStorage.clear();
  mocks.download.mockClear();
  const view = await mountTool(element({ mode: "export", alwaysShowPreview: true }));
  expect(view.container.querySelectorAll('output[aria-label="Custom preview"]')).toHaveLength(1);
  await click(button("Template and document settings", view.container));
  await fill(field("Handling cost", view.container), 14);
  const preview = view.container.querySelector('output[aria-label="Custom preview"]');
  expect(preview.textContent).toBe("14");
  await click(button("Download PDF", view.container));
  expect(mocks.download).toHaveBeenCalledOnce();
  expect(mocks.download.mock.calls[0][0].data["custom.cost"]).toBe(preview.textContent);
  expect(view.container.querySelectorAll('output[aria-label="Custom preview"]')).toHaveLength(1);
  localStorage.clear();
});
test("invalid custom currency blocks export and associates its error with the input", async () => {
  localStorage.clear();
  mocks.download.mockClear();
  const view = await mountTool(element());
  await fill(field("Handling cost", view.container), -1);
  await click(button("Download PDF", view.container));
  expect(mocks.download).not.toHaveBeenCalled();
  const input = field("Handling cost", view.container);
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(document.getElementById(input.getAttribute("aria-describedby")).textContent).toContain("Handling cost");
  await fill(input, 4);
  await click(button("Download PDF", view.container));
  expect(mocks.download).toHaveBeenCalledOnce();
  localStorage.clear();
});
