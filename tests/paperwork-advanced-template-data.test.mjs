import assert from "node:assert/strict";
import test from "node:test";

import {
  applyTemplateFormatting,
  getInvoiceTemplateInputs,
  getReceiptTemplateInputs,
} from "../lib/paperwork/advancedTemplateData.ts";

test("advanced inputs preserve text configured around sample values", () => {
  const template = {
    config: {
      sampleData: {
        dueDate: "August 22, 2026",
        subtotal: "$100.00",
      },
      template: {
        basePdf: { staticSchema: [] },
        schemas: [
          [
            {
              name: "dueDate",
              content: "Due August 22, 2026",
            },
            {
              name: "subtotal",
              content: "Subtotal  $100.00",
            },
          ],
        ],
      },
    },
  };

  assert.deepEqual(
    applyTemplateFormatting(template, {
      dueDate: "September 1, 2026",
      subtotal: "$250.00",
    }),
    {
      dueDate: "Due September 1, 2026",
      subtotal: "Subtotal  $250.00",
    },
  );
});

test("advanced template inputs replace sample fields with live invoice data", () => {
  const invoice = {
    business: {
      name: "Northstar Studio",
      contactName: "",
      email: "hello@northstar.test",
      phone: "555-0100",
      website: "",
      addressLine1: "42 Market Street",
      addressLine2: "",
      city: "Bengaluru",
      state: "Karnataka",
      zipCode: "560001",
      country: "IN",
      logo: "",
      taxId: "",
    },
    client: {
      name: "Avery Morgan",
      company: "Brightside Labs",
      email: "avery@example.test",
      phone: "",
      addressLine1: "18 Residency Road",
      addressLine2: "",
      city: "Bengaluru",
      state: "Karnataka",
      zipCode: "560025",
      country: "IN",
    },
    invoice: {
      invoiceNumber: "INV-42",
      invoiceDate: "2026-07-23",
      dueDate: "2026-08-22",
      paymentTerms: "Net 30",
      currency: "USD",
      poNumber: "",
      projectName: "",
    },
    lineItems: [
      {
        id: "item-1",
        description: "Design workshop",
        quantity: 2,
        unitPrice: 75,
        taxable: true,
      },
    ],
    totalsConfig: {
      discountType: "none",
      discountValue: 0,
      taxLabel: "Sales tax",
      taxRate: 10,
      shippingFee: 0,
      amountPaid: 0,
    },
    payment: {
      methods: ["card"],
      instructions: "",
      lateFeeNote: "",
      thankYouNote: "Thank you",
    },
    notes: { notes: "Thank you", terms: "Net 30" },
    template: "classic",
  };
  const inputs = getInvoiceTemplateInputs(invoice, {
    customField: "Keep my configured fallback",
    businessName: "Old sample business",
  });

  assert.equal(inputs.customField, "Keep my configured fallback");
  assert.equal(inputs.businessName, invoice.business.name);
  assert.equal(inputs.documentNumber, invoice.invoice.invoiceNumber);
  assert.equal(inputs.customerName, invoice.client.name);
  assert.equal(
    inputs.lineItems,
    JSON.stringify(
      invoice.lineItems.map((item) => [
        item.description,
        String(item.quantity),
        "$" + item.unitPrice.toFixed(2),
        "$" + (item.quantity * item.unitPrice).toFixed(2),
      ]),
    ),
  );
  assert.match(inputs.total, /^\$/);
});

test("advanced template inputs replace sample fields with live receipt data", () => {
  const data = {
    business: {
      name: "Northstar Market",
      email: "hello@northstar.test",
      phone: "555-0100",
      website: "",
      addressLine1: "42 Market Street",
      addressLine2: "",
      city: "Bengaluru",
      state: "Karnataka",
      zipCode: "560001",
      country: "IN",
      taxId: "",
    },
    customer: {
      name: "Avery Morgan",
      company: "Brightside Labs",
      email: "avery@example.test",
      phone: "",
      addressLine1: "18 Residency Road",
      addressLine2: "",
      city: "Bengaluru",
      state: "Karnataka",
      zipCode: "560025",
      country: "IN",
    },
    receiptNumber: "RCP-42",
    receiptDate: "2026-07-23",
    receiptTime: "16:32",
    relatedInvoiceNumber: "INV-42",
    transactionId: "TXN-42",
    paymentStatus: "Paid",
    receiptType: "Service",
    lineItems: [
      {
        id: "item-1",
        description: "Design workshop",
        quantity: 2,
        unitPrice: 75,
        taxable: true,
      },
    ],
    discountType: "none",
    discountValue: 0,
    salesTaxRate: 10,
    salesTaxLabel: "Sales tax",
    tip: 5,
    additionalFee: 0,
    amountRefunded: 0,
    paymentMethod: "Card",
    paymentNote: "",
    receivedBy: "Ashish",
    notes: "Thank you",
    thankYouMessage: "Paid in full",
  };
  const inputs = getReceiptTemplateInputs(
    data,
    {
      subtotal: 150,
      discountAmount: 0,
      taxAmount: 15,
      total: 170,
      balanceDue: 0,
    },
    { customField: "Keep my configured fallback" },
  );

  assert.equal(inputs.customField, "Keep my configured fallback");
  assert.equal(inputs.businessName, "Northstar Market");
  assert.equal(inputs.documentNumber, "RCP-42");
  assert.equal(inputs.issueDate, "2026-07-23 · 16:32");
  assert.equal(inputs.lineItems, JSON.stringify([["Design workshop", "2", "$150.00"]]));
  assert.equal(inputs.paymentMethod, "Card");
  assert.equal(inputs.total, "$170.00");
});
