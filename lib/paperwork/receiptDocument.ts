import { isCalendarDate, isNonnegativeAmount, isSupportedCurrency } from "./documentValidation.ts";
import type { InvoiceData } from "./types.ts";
import { localDate } from "./exportValues.ts";
import type { BusinessProfile, ClientProfile } from "./shared/dataBridge";

export interface ReceiptItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxable: boolean;
}

export interface ReceiptData {
  business: BusinessProfile;
  customer: ClientProfile;
  receiptNumber: string;
  receiptDate: string;
  receiptTime: string;
  relatedInvoiceNumber: string;
  transactionId: string;
  paymentStatus: "Unpaid" | "Paid" | "Partially Paid" | "Refunded";
  currency?: string;
  amountReceived?: number;
  receiptType: "Service" | "Product" | "Rent" | "Contractor" | "Deposit" | "Refund";
  lineItems: ReceiptItem[];
  discountType: "none" | "percent" | "fixed";
  discountValue: number;
  salesTaxRate: number;
  salesTaxLabel: string;
  tip: number;
  additionalFee: number;
  amountRefunded: number;
  paymentMethod: string;
  paymentNote: string;
  receivedBy: string;
  notes: string;
  thankYouMessage: string;
}

export const DEFAULT_RECEIPT_DATA: ReceiptData = {
  business: {
    name: "",
    contactName: "",
    email: "",
    phone: "",
    website: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    zipCode: "",
    country: "US",
    taxId: "",
  },
  customer: {
    name: "",
    company: "",
    email: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    zipCode: "",
    country: "US",
  },
  receiptNumber: `RCP-${new Date().getFullYear()}-001`,
  receiptDate: localDate(),
  receiptTime: "12:00",
  relatedInvoiceNumber: "",
  transactionId: "",
  currency: "USD",
  amountReceived: 0,
  paymentStatus: "Unpaid",
  receiptType: "Service",
  lineItems: [],
  discountType: "none",
  discountValue: 0,
  salesTaxRate: 0,
  salesTaxLabel: "State Sales Tax",
  tip: 0,
  additionalFee: 0,
  amountRefunded: 0,
  paymentMethod: "Card",
  paymentNote: "",
  receivedBy: "",
  notes: "Thank you for supporting small businesses!",
  thankYouMessage: "",
};

export const SAMPLE_RECEIPT_DATA: ReceiptData = {
  business: {
    name: "Blue Ridge Web Studio",
    contactName: "Alex Mercer",
    email: "billing@blueridgeweb.com",
    phone: "+1 (555) 789-1234",
    website: "www.blueridgeweb.com",
    addressLine1: "404 Ridge Point Lane",
    addressLine2: "Suite 300",
    city: "Asheville",
    state: "NC",
    zipCode: "28801",
    country: "US",
    taxId: "81-4492318",
  },
  customer: {
    name: "Sarah Jenkins",
    company: "Acme Retail Co.",
    email: "sarah.j@acmeretail.com",
    phone: "+1 (555) 123-0099",
    addressLine1: "822 Broad Street",
    addressLine2: "Apt B",
    city: "Charlotte",
    state: "NC",
    zipCode: "28202",
    country: "US",
  },
  receiptNumber: "RCP-2026-618",
  receiptDate: localDate(),
  receiptTime: "14:15",
  relatedInvoiceNumber: "INV-2026-441",
  transactionId: "TXN-881249A",
  currency: "USD",
  amountReceived: 617.5,
  paymentStatus: "Paid",
  receiptType: "Service",
  lineItems: [
    {
      id: "item-1",
      description: "Vite Bundler Configuration Service",
      quantity: 1,
      unitPrice: 400,
      taxable: false,
    },
    {
      id: "item-2",
      description: "Inter font typography setup and components integration",
      quantity: 3,
      unitPrice: 75,
      taxable: false,
    },
  ],
  discountType: "percent",
  discountValue: 10,
  salesTaxRate: 4.75,
  salesTaxLabel: "North Carolina Sales Tax",
  tip: 50,
  additionalFee: 5,
  amountRefunded: 0,
  paymentMethod: "Zelle",
  paymentNote: "Transferred from Sarah Chase Account",
  receivedBy: "Alex Mercer",
  notes: "Standard web project milestones signed off by development partners.",
  thankYouMessage: "Thank you for your business!",
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateReceiptTotals(data: ReceiptData) {
  const subtotal = money(
    data.lineItems.reduce((sum, item) => sum + money(Number(item.quantity || 0) * Number(item.unitPrice || 0)), 0),
  );
  const requestedDiscount =
    data.discountType === "percent"
      ? (subtotal * Number(data.discountValue || 0)) / 100
      : data.discountType === "fixed"
        ? Number(data.discountValue || 0)
        : 0;
  const discountAmount = money(Math.min(subtotal, Math.max(0, requestedDiscount)));
  const taxableSubtotal = data.lineItems.reduce(
    (sum, item) => (item.taxable ? sum + money(Number(item.quantity || 0) * Number(item.unitPrice || 0)) : sum),
    0,
  );
  const discountRatio = subtotal > 0 ? (subtotal - discountAmount) / subtotal : 0;
  const taxAmount = money((taxableSubtotal * discountRatio * Number(data.salesTaxRate || 0)) / 100);
  const total = money(
    subtotal - discountAmount + taxAmount + money(Number(data.tip || 0)) + money(Number(data.additionalFee || 0)),
  );
  // Historical drafts did not store receipts separately. Only an explicit Paid/Refunded
  // status establishes their original payment; partial drafts need payment confirmation.
  const amountReceived = money(
    data.amountReceived ?? (data.paymentStatus === "Paid" || data.paymentStatus === "Refunded" ? total : 0),
  );
  const amountRefunded = money(Number(data.amountRefunded || 0));
  const netReceived = money(amountReceived - amountRefunded);
  const balanceDue = money(Math.max(0, total - amountReceived));
  const customerCredit = money(Math.max(0, netReceived - total));
  return {
    subtotal,
    discountAmount,
    taxAmount,
    total,
    amountReceived,
    amountRefunded,
    netReceived,
    balanceDue,
    customerCredit,
  };
}

export function validateReceiptData(data: ReceiptData): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!data.business.name.trim()) errors["business.name"] = "Enter the seller name.";
  if (!data.customer.name.trim()) errors["customer.name"] = "Enter the customer name.";
  if (!data.receiptNumber.trim()) errors.receiptNumber = "Enter a receipt number.";
  if (!isCalendarDate(data.receiptDate)) errors.receiptDate = "Choose a valid receipt date.";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.receiptTime)) errors.receiptTime = "Enter a valid time (HH:MM).";
  if (!isSupportedCurrency(data.currency ?? "USD"))
    errors.currency = "Choose a supported currency with two decimal places.";
  if (!data.lineItems.length) errors.lineItems = "Add at least one item.";
  data.lineItems.forEach((item, index) => {
    if (!item.description.trim()) errors[`lineItems[${index}].description`] = "Enter an item description.";
    for (const field of ["quantity", "unitPrice"] as const)
      if (!isNonnegativeAmount(item[field]))
        errors[`lineItems[${index}].${field}`] = "Enter a finite amount of 0 or greater.";
  });
  for (const field of ["discountValue", "salesTaxRate", "tip", "additionalFee", "amountRefunded"] as const)
    if (!isNonnegativeAmount(data[field])) errors[field] = "Enter a finite amount of 0 or greater.";
  if (data.amountReceived !== undefined && !isNonnegativeAmount(data.amountReceived))
    errors.amountReceived = "Enter a finite payment amount of 0 or greater.";
  const totals = calculateReceiptTotals(data);
  if (!Number.isFinite(totals.total) || totals.total > Number.MAX_SAFE_INTEGER / 100)
    errors.lineItems = "Receipt amount is too large to calculate accurately.";
  if (
    (data.discountType === "percent" && data.discountValue > 100) ||
    (data.discountType === "fixed" && data.discountValue > totals.subtotal)
  )
    errors.discountValue = "Discount cannot exceed the sale subtotal.";
  if (data.salesTaxRate > 100) errors.salesTaxRate = "Tax rate must be between 0 and 100%.";
  if (data.amountRefunded > totals.amountReceived) errors.amountRefunded = "Refund cannot exceed the amount received.";
  if (data.paymentStatus === "Paid" && totals.balanceDue > 0)
    errors.amountReceived = "Paid status requires full payment. Enter the payment received or select partially paid.";
  if (data.paymentStatus === "Unpaid" && totals.amountReceived > 0)
    errors.paymentStatus = "Choose the status matching the payment received.";
  if (data.paymentStatus === "Partially Paid" && (totals.amountReceived <= 0 || totals.balanceDue <= 0))
    errors.amountReceived = "Enter a payment greater than zero and less than the sale total.";
  if (
    data.paymentStatus === "Refunded" &&
    (totals.amountReceived <= 0 || data.amountRefunded !== totals.amountReceived)
  )
    errors.amountRefunded = "Fully refunded status requires refunding the full payment received.";
  return errors;
}

export function receiptFromInvoice(inv: InvoiceData): ReceiptData {
  const mapped: ReceiptData = {
    ...DEFAULT_RECEIPT_DATA,
    business: { ...inv.business },
    customer: { ...inv.client },
    relatedInvoiceNumber: inv.invoice.invoiceNumber,
    lineItems: inv.lineItems.map((item, index) => ({ ...item, id: item.id || `item-${index}` })),
    discountType: inv.totalsConfig.discountType,
    discountValue: inv.totalsConfig.discountValue,
    salesTaxRate: inv.totalsConfig.taxRate,
    salesTaxLabel: inv.totalsConfig.taxLabel,
    additionalFee: inv.totalsConfig.shippingFee,
    currency: inv.invoice.currency,
    amountReceived: inv.totalsConfig.amountPaid,
    paymentStatus: inv.totalsConfig.amountPaid > 0 ? "Partially Paid" : "Unpaid",
    paymentMethod: inv.payment.methods[0] || "",
    thankYouMessage: inv.payment.thankYouNote || "",
  };
  if (mapped.amountReceived && calculateReceiptTotals(mapped).balanceDue === 0) mapped.paymentStatus = "Paid";
  return mapped;
}

export function normalizeReceiptDraft(draft: Partial<ReceiptData>): ReceiptData {
  return {
    ...DEFAULT_RECEIPT_DATA,
    ...draft,
    business: { ...DEFAULT_RECEIPT_DATA.business, ...draft.business },
    customer: { ...DEFAULT_RECEIPT_DATA.customer, ...draft.customer },
    lineItems: (draft.lineItems ?? []).map((item, index) => ({
      id: item.id || `item-${index}`,
      description: item.description || "",
      quantity: item.quantity ?? 0,
      unitPrice: item.unitPrice ?? 0,
      taxable: item.taxable ?? false,
    })),
    amountReceived: draft.amountReceived,
  };
}
