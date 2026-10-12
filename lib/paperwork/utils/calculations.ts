/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CalculatedTotals, InvoiceData } from "../types";

/**
 * Perform precise financial calculations for an invoice draft.
 */
export function calculateInvoiceTotals(data: InvoiceData): CalculatedTotals {
  const lineItems = data.lineItems || [];
  const totalsConfig = data.totalsConfig || {
    discountType: "none",
    discountValue: 0,
    taxLabel: "Sales Tax",
    taxRate: 0,
    shippingFee: 0,
    amountPaid: 0,
  };

  // 1. Calculate base subtotal
  let subtotal = 0;
  lineItems.forEach((item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    subtotal += roundToTwo(qty * price);
  });

  // 2. Calculate global discount
  let discountAmount = 0;
  const discVal = Number(totalsConfig.discountValue) || 0;
  if (totalsConfig.discountType === "percent") {
    discountAmount = subtotal * (discVal / 100);
  } else if (totalsConfig.discountType === "fixed") {
    discountAmount = discVal;
  }
  // Clamp discount at subtotal
  if (discountAmount > subtotal) {
    discountAmount = subtotal;
  }

  discountAmount = roundToTwo(discountAmount);

  // 3. Tax applies only to taxable line items after proportional discount
  let taxableSubtotal = 0;
  let taxAmount = 0;
  const taxRateDecimal = (Number(totalsConfig.taxRate) || 0) / 100;
  const discountRatio = subtotal > 0 ? discountAmount / subtotal : 0;

  lineItems.forEach((item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    const itemAmount = roundToTwo(qty * price);

    if (item.taxable) {
      const itemProportionalDiscount = itemAmount * discountRatio;
      const itemTaxableBasis = Math.max(0, itemAmount - itemProportionalDiscount);
      taxableSubtotal += itemTaxableBasis;
      taxAmount += itemTaxableBasis * taxRateDecimal;
    }
  });

  // 4. Shipping / additional fees
  const shippingFee = roundToTwo(Number(totalsConfig.shippingFee) || 0);

  // 5. Compute Grand Total
  taxAmount = roundToTwo(taxAmount);
  const total = roundToTwo(Math.max(0, subtotal - discountAmount + taxAmount + shippingFee));

  // 6. Balance Due
  const amountPaid = roundToTwo(Number(totalsConfig.amountPaid) || 0);
  const balanceDue = Math.max(0, total - amountPaid);

  return {
    subtotal: roundToTwo(subtotal),
    discountAmount: roundToTwo(discountAmount),
    taxableSubtotal: roundToTwo(taxableSubtotal),
    taxAmount: roundToTwo(taxAmount),
    shippingFee: roundToTwo(shippingFee),
    total: roundToTwo(total),
    amountPaid: roundToTwo(amountPaid),
    balanceDue: roundToTwo(balanceDue),
    customerCredit: roundToTwo(Math.max(0, amountPaid - total)),
  };
}

function roundToTwo(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Format a number to currency layout based on the USD locale.
 */
export function formatCurrency(amount: number, currency: string = "USD", locale: string = "en-US"): string {
  const safeAmount = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
    }).format(safeAmount);
  } catch (e) {
    return `$${safeAmount.toFixed(2)}`;
  }
}
