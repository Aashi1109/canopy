const { test } = await import(process.env.VITEST ? "vitest" : "node:test");
import assert from "node:assert/strict";
import { calculateInvoiceTotals } from "../lib/paperwork/utils/calculations.ts";
import {
  calculateReceiptTotals,
  DEFAULT_RECEIPT_DATA,
  validateReceiptData,
  receiptFromInvoice,
} from "../lib/paperwork/receiptDocument.ts";
import {
  calculateExpenseTotals,
  mergeExpenseMileageRows,
  validateExpenseReportData,
  importExpenseMileageRows,
} from "../lib/paperwork/expenseReportRules.ts";
const receipt = (overrides = {}) => ({
  ...DEFAULT_RECEIPT_DATA,
  business: { ...DEFAULT_RECEIPT_DATA.business, name: "Seller" },
  customer: { ...DEFAULT_RECEIPT_DATA.customer, name: "Buyer" },
  lineItems: [{ id: "a", description: "Service", quantity: 1, unitPrice: 100, taxable: true }],
  salesTaxRate: 10,
  ...overrides,
});
test("excessive receipt discounts cannot create negative tax and fail export", () => {
  const data = receipt({ discountType: "fixed", discountValue: 150 });
  assert.equal(calculateReceiptTotals(data).total, 0);
  assert.equal(calculateReceiptTotals(data).taxAmount, 0);
  assert.ok(validateReceiptData(data).discountValue);
});
test("receipt separates refunds from unpaid sale balance", () => {
  const totals = calculateReceiptTotals(receipt({ amountReceived: 110, amountRefunded: 30, paymentStatus: "Paid" }));
  assert.equal(totals.netReceived, 80);
  assert.equal(totals.balanceDue, 0);
  assert.equal(calculateReceiptTotals(receipt({ amountReceived: 30, paymentStatus: "Partially Paid" })).balanceDue, 80);
});
test("receipt rejects impossible dates, nonfinite money and refund exceeding payment", () => {
  const errors = validateReceiptData(
    receipt({ receiptDate: "2026-02-30", amountReceived: 10, amountRefunded: 20, tip: Infinity }),
  );
  assert.ok(errors.receiptDate);
  assert.ok(errors.amountRefunded);
  assert.ok(errors.tip);
});
test("mileage import is idempotent and canonical expense totals preserve charges", () => {
  const incoming = [{ id: "trip1", miles: 10, rate: 0.725, parking: 2, tolls: 3, amount: 999 }];
  const once = mergeExpenseMileageRows([], incoming);
  const twice = mergeExpenseMileageRows(once, incoming);
  assert.equal(twice.length, 1);
  assert.equal(twice[0].amount, 12.25);
  assert.equal(calculateExpenseTotals([], twice, 0).mileageTotal, 12.25);
});
test("expense export rejects negative amounts and dates outside report period", () => {
  const errors = validateExpenseReportData({
    reportNumber: "E1",
    reportDate: "2026-05-20",
    startDate: "2026-05-01",
    endDate: "2026-05-20",
    submitter: { name: "Worker" },
    expenses: [{ date: "2026-04-30", merchant: "Shop", description: "Supplies", amount: -1, tax: 0, tip: 0 }],
    mileageRows: [],
    advanceReceived: 0,
  });
  assert.ok(errors["expenses[0].amount"]);
  assert.ok(errors["expenses[0].date"]);
});

test("invoice import preserves currency, actual payment and thank-you contract", () => {
  const source = receipt();
  const draft = receiptFromInvoice({
    business: source.business,
    client: source.customer,
    invoice: { invoiceNumber: "INV1", currency: "EUR" },
    lineItems: source.lineItems,
    totalsConfig: {
      discountType: "none",
      discountValue: 0,
      taxRate: 10,
      taxLabel: "Tax",
      shippingFee: 0,
      amountPaid: 0,
    },
    payment: { methods: ["Bank"], thankYouNote: "Thanks" },
  });
  assert.equal(draft.currency, "EUR");
  assert.equal(draft.paymentStatus, "Unpaid");
  assert.equal(draft.amountReceived, 0);
  assert.equal(draft.thankYouMessage, "Thanks");
  assert.equal(calculateReceiptTotals(draft).balanceDue, 110);
});

test("expense imports derive live mileage rates and preserve parking and tolls idempotently", () => {
  const source = {
    taxYear: 2026,
    rateMode: "irs-standard",
    customRate: 999,
    fuelRecords: [],
    trips: [
      {
        id: "trip1",
        date: "2026-07-15",
        miles: 10,
        rate: 999,
        amount: 999,
        purpose: "Client visit",
        startLocation: "Office",
        destination: "Client",
        parking: 2,
        tolls: 3,
      },
    ],
  };
  const first = importExpenseMileageRows([], source);
  const second = importExpenseMileageRows(first.rows, source);
  assert.deepEqual(first.errors, []);
  assert.equal(second.rows.length, 1);
  assert.equal(second.rows[0].rate, 0.76);
  assert.equal(second.rows[0].amount, 12.6);
  const invalid = importExpenseMileageRows(second.rows, {
    ...source,
    trips: [{ ...source.trips[0], date: "2026-02-30" }],
  });
  assert.ok(invalid.errors.length);
  assert.deepEqual(invalid.rows, second.rows);
});

test("returning an overpayment clears customer credit without inventing unpaid sale balance", () => {
  const totals = calculateReceiptTotals(receipt({ amountReceived: 120, amountRefunded: 10, paymentStatus: "Paid" }));
  assert.equal(totals.total, 110);
  assert.equal(totals.customerCredit, 0);
  assert.equal(totals.balanceDue, 0);
});

test("mileage reimbursement uses the same component rounding as the originating log", () => {
  const row = { id: "rounded", miles: 1, rate: 0.004, parking: 0.004, tolls: 0 };
  assert.equal(calculateExpenseTotals([], [row], 0).mileageTotal, 0);
});

test("invoice tax uses the displayed rounded discount when allocating taxable basis", () => {
  const totals = calculateInvoiceTotals({
    lineItems: [{ quantity: 1, unitPrice: 1, taxable: true }],
    totalsConfig: { discountType: "percent", discountValue: 7.5, taxRate: 20, shippingFee: 0, amountPaid: 0 },
  });
  assert.equal(totals.discountAmount, 0.08);
  assert.equal(totals.taxAmount, 0.18);
  assert.equal(totals.total, 1.1);
});
