import { expect, test } from "vitest";
import { getInitialBlankInvoice, getSampleInvoice } from "../lib/paperwork/utils/sampleData.ts";
import { validateInvoiceData } from "../lib/paperwork/utils/invoiceValidation.ts";

function validInvoice() {
  return {
    business: {
      name: "Blue Ridge Studio",
      email: "billing@example.com",
    },
    client: {
      name: "Acme Corp",
      email: "accounts@example.com",
    },
    invoice: {
      currency: "USD",
      invoiceNumber: "INV-1001",
      invoiceDate: "2026-07-22",
      dueDate: "2026-08-21",
    },
    totalsConfig: { discountType: "none", discountValue: 0, taxRate: 0, shippingFee: 0, amountPaid: 0 },
    lineItems: [
      {
        description: "Design services",
        quantity: 2,
        unitPrice: 150,
      },
    ],
  };
}

test("a complete invoice passes export validation", () => {
  expect(validateInvoiceData(validInvoice())).toEqual({});
});

test("invoice validation covers required identity and date fields", () => {
  const invoice = validInvoice();
  invoice.business.name = " ";
  invoice.client.name = "";
  invoice.invoice.invoiceNumber = "";
  invoice.invoice.invoiceDate = "";
  invoice.invoice.dueDate = "";

  expect(Object.keys(validateInvoiceData(invoice)).sort()).toEqual([
    "business.name",
    "client.name",
    "invoice.dueDate",
    "invoice.invoiceDate",
    "invoice.invoiceNumber",
  ]);
});

test("invoice validation rejects malformed emails and a due date before issue", () => {
  const invoice = validInvoice();
  invoice.business.email = "billing.example.com";
  invoice.client.email = "accounts@";
  invoice.invoice.dueDate = "2026-07-21";

  expect(Object.keys(validateInvoiceData(invoice)).sort()).toEqual([
    "business.email",
    "client.email",
    "invoice.dueDate",
  ]);
});

test("invoice validation rejects unusable line items", () => {
  const invoice = validInvoice();
  invoice.lineItems = [
    { description: " ", quantity: "", unitPrice: 20 },
    { description: "Hosting", quantity: -1, unitPrice: Number.NaN },
  ];

  expect(Object.keys(validateInvoiceData(invoice)).sort()).toEqual([
    "lineItems[0].description",
    "lineItems[0].quantity",
    "lineItems[1].quantity",
    "lineItems[1].unitPrice",
  ]);

  invoice.lineItems = [];
  expect(Object.keys(validateInvoiceData(invoice))).toEqual(["lineItems"]);
});

test("translated invoice validation keeps stable field paths and named error reasons", () => {
  const invoice = validInvoice();
  invoice.business.name = "";
  invoice.invoice.dueDate = "2026-07-21";
  invoice.lineItems[0].quantity = -1;
  const seen = [];
  const errors = validateInvoiceData(invoice, (key) => {
    seen.push(key);
    return `translated:${key}`;
  });
  expect(errors).toEqual({
    "business.name": "translated:businessName",
    "invoice.dueDate": "translated:dueDateOrder",
    "lineItems[0].quantity": "translated:itemQuantity",
  });
  expect(seen).toEqual(["businessName", "dueDateOrder", "itemQuantity"]);
  expect(validateInvoiceData(invoice)["invoice.dueDate"]).toBe("Due date must be on or after the invoice date.");
});

test("invoice rejects invalid calendar dates, config amounts and unsupported precision", () => {
  const invoice = validInvoice();
  invoice.invoice.invoiceDate = "2026-02-30";
  invoice.invoice.currency = "JPY";
  invoice.totalsConfig = {
    discountType: "percent",
    discountValue: 120,
    taxRate: Infinity,
    shippingFee: -1,
    amountPaid: NaN,
  };
  const errors = validateInvoiceData(invoice);
  for (const field of [
    "invoice.invoiceDate",
    "invoice.currency",
    "totalsConfig.discountValue",
    "totalsConfig.taxRate",
    "totalsConfig.shippingFee",
    "totalsConfig.amountPaid",
  ])
    expect(errors[field]).toBeTruthy();
});

test("new blank invoices contain no authored business, payment, or work facts and cannot be exported", () => {
  const invoice = getInitialBlankInvoice();
  expect(Object.values(invoice.business).every((value) => value === "")).toBe(true);
  expect(Object.values(invoice.client).every((value) => value === "")).toBe(true);
  expect(invoice.payment.methods).toEqual([]);
  expect(invoice.payment.instructions).toBe("");
  expect(invoice.payment.lateFeeNote).toBe("");
  expect(invoice.notes.notes).toBe("");
  expect(invoice.invoice.projectName).toBe("");
  expect(invoice.lineItems.map((item) => item.description)).toEqual([""]);
  const errors = validateInvoiceData(invoice);
  expect(errors["business.name"]).toBeTruthy();
  expect(errors["client.name"]).toBeTruthy();
  expect(errors["lineItems[0].description"]).toBeTruthy();
});

test("explicit sample invoice retains populated examples independently of blank invoice edits", () => {
  const invoice = getInitialBlankInvoice();
  invoice.business.name = "Authored business";
  invoice.payment.methods.push("bank");
  const sample = getSampleInvoice();
  expect(sample.business.name).toBe("Blue Ridge Web Studio");
  expect(sample.payment.methods).toEqual(["bank", "check", "paypal"]);
  expect(sample.payment.instructions).toContain("Chase Bank");
  expect(sample.notes.notes).toContain("Maintenance covers");
  expect(sample.lineItems.every((item) => item.description.length > 0)).toBe(true);
  expect(validateInvoiceData(sample)).toEqual({});
  expect(getInitialBlankInvoice().business.name).toBe("");
  expect(getInitialBlankInvoice().payment.methods).toEqual([]);
});
