/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface BusinessInfo {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  logo: string; // Base64 or object URL structure
  taxId: string; // EIN / Tax ID (optional)
}

export interface ClientInfo {
  name: string;
  company: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface InvoiceMeta {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  paymentTerms: string; // e.g., "Due on Receipt", "Net 30"
  currency: string;
  poNumber: string;
  projectName: string;
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxable: boolean;
}

export interface TotalsConfig {
  discountType: "none" | "percent" | "fixed";
  discountValue: number;
  taxLabel: string;
  taxRate: number;
  shippingFee: number;
  amountPaid: number;
}

export interface PaymentInfo {
  methods: string[]; // ["bank", "check", "venmo", etc.]
  instructions: string;
  lateFeeNote: string;
  thankYouNote: string;
}

export interface NotesTerms {
  notes: string;
  terms: string;
}

export interface InvoiceData {
  business: BusinessInfo;
  client: ClientInfo;
  invoice: InvoiceMeta;
  lineItems: InvoiceLineItem[];
  totalsConfig: TotalsConfig;
  payment: PaymentInfo;
  notes: NotesTerms;
  template: string;
}

export interface CalculatedTotals {
  subtotal: number;
  discountAmount: number;
  taxableSubtotal: number;
  taxAmount: number;
  shippingFee: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  customerCredit: number;
}
