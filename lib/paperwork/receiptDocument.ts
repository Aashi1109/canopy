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
  paymentStatus: "Paid" | "Partially Paid" | "Refunded";
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
  receiptDate: new Date().toISOString().substring(0, 10),
  receiptTime: "12:00",
  relatedInvoiceNumber: "",
  transactionId: "",
  paymentStatus: "Paid",
  receiptType: "Service",
  lineItems: [
    {
      id: "item-1",
      description: "Design Consulting Consult",
      quantity: 1,
      unitPrice: 150,
      taxable: false,
    },
  ],
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
  thankYouMessage: "Paid in full. We appreciate your prompt payment.",
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
  receiptDate: new Date().toISOString().substring(0, 10),
  receiptTime: "14:15",
  relatedInvoiceNumber: "INV-2026-441",
  transactionId: "TXN-881249A",
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

export function calculateReceiptTotals(data: ReceiptData) {
  const subtotal = data.lineItems.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
    0,
  );
  const discountAmount =
    data.discountType === "percent"
      ? (subtotal * Number(data.discountValue || 0)) / 100
      : data.discountType === "fixed"
        ? Number(data.discountValue || 0)
        : 0;
  const discountedSubtotal = Math.max(0, subtotal - discountAmount);
  const taxableSubtotal = data.lineItems.reduce(
    (sum, item) =>
      item.taxable ? sum + Number(item.quantity || 0) * Number(item.unitPrice || 0) : sum,
    0,
  );
  const discountRatio = subtotal > 0 ? (subtotal - discountAmount) / subtotal : 1;
  const taxAmount = (taxableSubtotal * discountRatio * Number(data.salesTaxRate || 0)) / 100;
  const total =
    discountedSubtotal + taxAmount + Number(data.tip || 0) + Number(data.additionalFee || 0);
  const balanceDue =
    data.paymentStatus === "Partially Paid" ? Math.max(0, total - data.amountRefunded) : 0;

  return { subtotal, discountAmount, taxAmount, total, balanceDue };
}
