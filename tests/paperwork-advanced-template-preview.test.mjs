// @vitest-environment jsdom
import React, { act } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import {
  AdvancedDocumentPreview,
  downloadAdvancedDocumentPdf,
  openAdvancedDocumentPdf,
} from "../app/paperwork/components/AdvancedDocumentPreview.tsx";
import { setupReactTools, mountTool, click, button } from "./helpers/react-tools.mjs";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  inputs: vi.fn(),
  destroy: vi.fn(),
  generate: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("../app/paperwork/components/PaperworkFeedback.tsx", () => ({
  usePaperworkFeedback: () => ({ notify: mocks.notify }),
}));
vi.mock("@pdfme/ui", () => ({
  Viewer: class {
    constructor(options) {
      mocks.create(options);
    }
    getOptions() {
      return { zoomLevel: 1 };
    }
    updateOptions() {}
    updateTemplate(value) {
      mocks.update(value);
    }
    setInputs(value) {
      mocks.inputs(value);
    }
    destroy() {
      mocks.destroy();
    }
  },
}));
vi.mock("@pdfme/schemas", () => ({
  ...Object.fromEntries(
    [
      "text",
      "multiVariableText",
      "list",
      "image",
      "signature",
      "svg",
      "table",
      "line",
      "rectangle",
      "ellipse",
      "dateTime",
      "date",
      "time",
      "select",
      "radioGroup",
      "checkbox",
      "circleMark",
    ].map((key) => [key, { ui: vi.fn(), pdf: vi.fn() }]),
  ),
  barcodes: {},
}));
vi.mock("@pdfme/generator", () => ({ generate: mocks.generate }));
setupReactTools();
const template = {
  id: "t1",
  version: 1,
  name: "Receipt",
  slug: "receipt",
  config: {
    sampleData: { businessName: "Sample" },
    template: {
      schemas: [[{ name: "businessName", type: "text", content: "For Sample" }]],
      basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
    },
  },
};
const dictionary = {
  Tool: {
    runtime: {
      shared: {
        preview: {
          loading: "Loading preview",
          loadFailed: "Preview failed. Retry.",
          updateFailed: "Update failed. Retry.",
          retry: "Retry preview",
        },
      },
    },
  },
};
const element = (data) =>
  React.createElement(
    NextIntlClientProvider,
    { locale: "en", messages: dictionary },
    React.createElement(AdvancedDocumentPreview, { template, data }),
  );
beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.generate.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
});
test("preview shows current formatted values, updates after editing and destroys on unmount", async () => {
  const view = await mountTool(element({ businessName: "Seller" }));
  await act(async () => {
    await Promise.resolve();
  });
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.create.mock.calls[0][0].inputs).toEqual([{ businessName: "For Seller" }]);
  expect(view.container.querySelector('[aria-busy="false"]')).toBeTruthy();
  await view.rerender(element({ businessName: "New seller" }));
  expect(mocks.inputs).toHaveBeenLastCalledWith([{ businessName: "For New seller" }]);
  await view.unmount();
  expect(mocks.destroy).toHaveBeenCalledOnce();
});
test("preview failure provides a working retry that creates a viewer", async () => {
  mocks.create.mockImplementationOnce(() => {
    throw new Error("Loading failed");
  });
  const view = await mountTool(element({ businessName: "Seller" }));
  await act(async () => {
    await Promise.resolve();
  });
  expect(view.container.textContent).toContain("Preview failed. Retry.");
  expect(mocks.notify).toHaveBeenCalledOnce();
  await click(button("Retry preview", view.container));
  await act(async () => {
    await Promise.resolve();
  });
  expect(mocks.create).toHaveBeenCalledTimes(2);
  expect(view.container.querySelector('[aria-busy="false"]')).toBeTruthy();
  expect(view.container.querySelector('[role="alert"]')).toBeNull();
});
test("PDF download serializes actual document inputs and creates a PDF named link", async () => {
  const create = vi.fn().mockReturnValue("blob:pdf");
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  const clicks = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
    expect(this.download).toBe("receipt.pdf");
    expect(this.href).toBe("blob:pdf");
  });
  await downloadAdvancedDocumentPdf({ template, data: { businessName: "Seller" }, fileName: "receipt" });
  expect(mocks.generate.mock.calls[0][0].inputs).toEqual([{ businessName: "For Seller" }]);
  expect(create.mock.calls[0][0].type).toBe("application/pdf");
  expect(clicks).toHaveBeenCalledOnce();
});
test("blocked PDF popup reports actionable failure and does not generate a hidden PDF", async () => {
  vi.spyOn(window, "open").mockReturnValue(null);
  await expect(openAdvancedDocumentPdf({ template, data: { businessName: "Seller" } })).rejects.toThrow(
    "Allow pop-ups",
  );
  expect(mocks.generate).not.toHaveBeenCalled();
});
