import { test, expect, vi } from "vitest";
import {
  w9RequestAdapter,
  mileageLogAdapter,
  nec1099Adapter,
  quarterlyTaxAdapter,
  mergeTemplateInputs,
} from "../lib/paperwork/documentAdapters.ts";
import { DataBridge } from "../lib/paperwork/shared/dataBridge.ts";
const form = { sections: [] };
test("selected W9 recipient controls field edits and export; missing selection blocks export", () => {
  const draft = w9RequestAdapter.getSampleDraft();
  const second = { ...draft.vendors[0], id: "second", legalName: "Second recipient", email: "second@example.test" };
  draft.vendors.push(second);
  draft.selectedVendorId = second.id;
  expect(w9RequestAdapter.readField(draft, "contractorName")).toBe("Second recipient");
  const edited = w9RequestAdapter.writeField(draft, "contractorName", "Edited recipient");
  expect(edited.vendors[0].legalName).toBe(draft.vendors[0].legalName);
  expect(edited.vendors[1].legalName).toBe("Edited recipient");
  const inputs = w9RequestAdapter.toPdfInputs(edited, { config: { sampleData: {} } }, {});
  expect(inputs.contractorName).toBe("Edited recipient");
  expect(inputs.selectedVendorId).toBe(second.id);
  expect(w9RequestAdapter.validate({ ...draft, selectedVendorId: "missing" }, form).contractorName).toBeTruthy();
  expect(w9RequestAdapter.validate({ ...draft, dueDate: "2026-02-30" }, form).dueDate).toBeTruthy();
});
test("mileage final actions require business record completeness and real fuel dates", () => {
  const draft = mileageLogAdapter.getSampleDraft();
  expect(
    mileageLogAdapter.validate({ ...draft, trips: [{ ...draft.trips[0], purpose: "" }] }, form).trips,
  ).toBeTruthy();
  expect(
    mileageLogAdapter.validate({ ...draft, fuelRecords: [{ ...draft.fuelRecords[0], date: "2026-02-30" }] }, form)
      .fuelRecords,
  ).toBeTruthy();
});
test("NEC exports apply vendor entity eligibility and flag payment date omissions", () => {
  const spy = vi
    .spyOn(DataBridge, "getW9Vendors")
    .mockReturnValue([
      { id: "corp", entityType: "Corporation", legalName: "Corporate contractor", w9Status: "Received" },
    ]);
  try {
    const draft = {
      reportingYear: 2026,
      payerName: "Payer",
      payerAddress: "",
      payerEmail: "",
      filingStatus: "Review required",
      payments: [
        {
          id: "p",
          date: "2026-02-01",
          vendorId: "corp",
          amount: 3000,
          paymentMethod: "ACH",
          category: "Services",
          description: "Consulting",
          includeIn1099: true,
        },
      ],
      recipientAdjustments: [],
    };
    expect(nec1099Adapter.readField(draft, "reportableTotal")).toBe(0);
    expect(
      nec1099Adapter.validate({ ...draft, payments: [{ ...draft.payments[0], date: "" }] }, form).paymentRows,
    ).toBeTruthy();
  } finally {
    spy.mockRestore();
  }
});
test("tax exported annual target and remaining target retain different meanings", () => {
  const draft = { ...quarterlyTaxAdapter.getSampleDraft(), estimatedPaymentsMade: 3000 };
  expect(
    quarterlyTaxAdapter.readField(draft, "requiredAnnualPayment") -
      quarterlyTaxAdapter.readField(draft, "remainingAnnualPayment"),
  ).toBe(3000);
  expect(quarterlyTaxAdapter.readField(draft, "calculationAssumptions")).toContain("QBI");
});
test("custom template fields cannot override calculated or identity fields", () => {
  expect(
    mergeTemplateInputs(
      { total: "sample", extra: "sample" },
      { total: 100, contractorName: "Selected" },
      { total: 1, contractorName: "Other", extra: "Custom" },
    ),
  ).toEqual({ total: "100", contractorName: "Selected", extra: "Custom" });
});

test("unused custom template sample fields export blank unless explicitly authored", () => {
  expect(mergeTemplateInputs({ sampleContractor: "Fictional person", total: "12000" }, { total: 10 }, {})).toEqual({
    sampleContractor: "",
    total: "10",
  });
});

test("invoice exports retain currency and formatted overpayment credit", async () => {
  const { invoiceAdapter } = await import("../lib/paperwork/documentAdapters.ts");
  const draft = invoiceAdapter.getSampleDraft();
  draft.invoice.currency = "EUR";
  draft.totalsConfig.amountPaid = 100000;
  const inputs = invoiceAdapter.toPdfInputs(draft, { config: { sampleData: {} } }, {});
  expect(inputs.currency).toBe("EUR");
  expect(inputs.amountPaid).toContain("€");
  expect(inputs.shippingFee).toContain("€");
  expect(inputs.customerCredit).toContain("€");
  expect(inputs.balanceDue).toBe("€0.00");
});

test("PDF table formatting preserves custom column order, values and missing cells", async () => {
  const { applyTemplateFormatting } = await import("../lib/paperwork/advancedTemplateData.ts");
  const template = {
    documentType: "invoice",
    config: {
      sampleData: {},
      form: {
        sections: [
          {
            entries: [
              {
                key: "customRows",
                kind: "repeater",
                columns: [
                  { key: "note", control: "text" },
                  { key: "count", control: "number" },
                ],
              },
            ],
          },
        ],
      },
      template: { basePdf: {}, schemas: [[{ type: "table", name: "customRows", head: ["Note", "Count"] }]] },
    },
  };
  expect(
    JSON.parse(
      applyTemplateFormatting(template, {
        customRows: JSON.stringify([{ count: 2, note: "Custom" }, { note: "Optional" }]),
      }).customRows,
    ),
  ).toEqual([
    ["Custom", "2"],
    ["Optional", ""],
  ]);
  expect(() => applyTemplateFormatting(template, { customRows: JSON.stringify([["one", "two", "extra"]]) })).toThrow(
    "more cells",
  );
});
