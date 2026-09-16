/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { InvoiceData } from "../types";

/**
 * Helper to get a date string in YYYY-MM-DD format.
 */
export function getRelativeDateString(daysOffset: number = 0): string {
  const d = new Date();
  if (daysOffset !== 0) {
    d.setDate(d.getDate() + daysOffset);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Clean pristine blank invoice template.
 */
export function getInitialBlankInvoice(): InvoiceData {
  const today = getRelativeDateString(0);
  const thirtyDaysLater = getRelativeDateString(30);

  return {
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
      country: "United States",
      logo: "",
      taxId: "",
    },
    client: {
      name: "",
      company: "",
      email: "",
      phone: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      zipCode: "",
      country: "United States",
    },
    invoice: {
      invoiceNumber: `INV-${new Date().getFullYear()}-001`,
      invoiceDate: today,
      dueDate: thirtyDaysLater,
      paymentTerms: "Net 30",
      currency: "USD",
      poNumber: "",
      projectName: "",
    },
    lineItems: [
      {
        id: "default-item-1",
        description: "Professional services",
        quantity: 1,
        unitPrice: 0,
        taxable: true,
      },
    ],
    totalsConfig: {
      discountType: "none",
      discountValue: 0,
      taxLabel: "Sales Tax",
      taxRate: 0,
      shippingFee: 0,
      amountPaid: 0,
    },
    payment: {
      methods: ["bank", "check"],
      instructions:
        "Please make bank transfers to: routing: 021000021, account: 123456789. Or write checks payable to Blue Ridge Web Studio.",
      lateFeeNote: "Late payments may incur an interest fee of 1.5% per month.",
      thankYouNote: "Thank you for your business. We appreciate your partnership!",
    },
    notes: {
      notes: "Services rendered cover design wireframes and production deployment.",
      terms: "Payment is due by the due date shown above. Please contact us with any questions about this invoice.",
    },
    template: "classic",
  };
}

/**
 * Sample populated invoice matching instructions.
 */
export function getSampleInvoice(): InvoiceData {
  const today = getRelativeDateString(0);
  const fifteenDaysLater = getRelativeDateString(15);

  return {
    business: {
      name: "Blue Ridge Web Studio",
      contactName: "Sarah Jenkins",
      email: "hello@blueridgeweb.com",
      phone: "(828) 555-0192",
      website: "blueridgeweb.com",
      addressLine1: "42 Wall St",
      addressLine2: "Suite 400",
      city: "Asheville",
      state: "NC",
      zipCode: "28801",
      country: "United States",
      logo: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=60", // Fictional abstract geometric representation as pre-loaded logo
      taxId: "XX-XXX4321",
    },
    client: {
      name: "Acme Home Services",
      company: "Acme Corporates Inc.",
      email: "billing@acmehomeservices.com",
      phone: "(415) 888-9900",
      addressLine1: "100 Pine Street",
      addressLine2: "Floor 12",
      city: "San Francisco",
      state: "CA",
      zipCode: "94111",
      country: "United States",
    },
    invoice: {
      invoiceNumber: `INV-${new Date().getFullYear()}-104`,
      invoiceDate: today,
      dueDate: fifteenDaysLater,
      paymentTerms: "Net 15",
      currency: "USD",
      poNumber: "PO-2026-887",
      projectName: "Q2 Digital Transformation",
    },
    lineItems: [
      {
        id: "sample-item-1",
        description: "Website maintenance & performance tuning",
        quantity: 5,
        unitPrice: 75.0,
        taxable: false,
      },
      {
        id: "sample-item-2",
        description: "Landing page design and copywriting template updates",
        quantity: 1,
        unitPrice: 250.0,
        taxable: true,
      },
    ],
    totalsConfig: {
      discountType: "percent",
      discountValue: 10, // 10% discount
      taxLabel: "NC Sales Tax",
      taxRate: 4.75, // NC tax on taxable page design after discount
      shippingFee: 0,
      amountPaid: 150.0, // Partial payment already made
    },
    payment: {
      methods: ["bank", "check", "paypal"],
      instructions:
        "Direct bank wire to Chase Bank - Route: 121000248, Acct Num: 987654321. Venmo/PayPal via billing@blueridgeweb.com.",
      lateFeeNote: "Late payments are subject to a 1.5% structural monthly interest fee.",
      thankYouNote: "Thank you for your business. It was a pleasure collaborating with the Acme team!",
    },
    notes: {
      notes:
        "Maintenance covers performance reporting & image size compressions. Landing page design includes mobile-responsive components.",
      terms: "Payment is due by the due date shown above. Please contact us with any questions about this invoice.",
    },
    template: "modern",
  };
}
