import { isCalendarDate, isNonnegativeAmount, isSupportedCurrency } from "../documentValidation.ts";
import type { InvoiceData } from "../types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isBlank(value: unknown) {
  return typeof value !== "string" || !value.trim();
}

function isInvalidAmount(value: unknown) {
  return value === "" || !Number.isFinite(Number(value)) || Number(value) < 0;
}

const VALIDATION_MESSAGES = {
  businessName: "Enter your business name.",
  businessEmail: "Enter a valid business email address.",
  clientName: "Enter the client name.",
  clientEmail: "Enter a valid client email address.",
  invoiceNumber: "Enter an invoice number.",
  invoiceDate: "Choose an invoice date.",
  dueDate: "Choose a payment due date.",
  dueDateOrder: "Due date must be on or after the invoice date.",
  lineItems: "Add at least one line item.",
  itemDescription: "Enter an item description.",
  itemQuantity: "Quantity must be 0 or greater.",
  itemRate: "Rate must be 0 or greater.",
} as const;

export type InvoiceValidationMessageKey = keyof typeof VALIDATION_MESSAGES;

export function validateInvoiceData(
  data: InvoiceData,
  translate: (key: InvoiceValidationMessageKey) => string = (key) => VALIDATION_MESSAGES[key],
) {
  const errors: Record<string, string> = {};

  if (isBlank(data.business.name)) {
    errors["business.name"] = translate("businessName");
  }
  if (data.business.email && !EMAIL_PATTERN.test(data.business.email)) {
    errors["business.email"] = translate("businessEmail");
  }
  if (isBlank(data.client.name)) {
    errors["client.name"] = translate("clientName");
  }
  if (data.client.email && !EMAIL_PATTERN.test(data.client.email)) {
    errors["client.email"] = translate("clientEmail");
  }
  if (isBlank(data.invoice.invoiceNumber)) {
    errors["invoice.invoiceNumber"] = translate("invoiceNumber");
  }
  if (!isCalendarDate(data.invoice.invoiceDate)) {
    errors["invoice.invoiceDate"] = translate("invoiceDate");
  }
  if (!isCalendarDate(data.invoice.dueDate)) {
    errors["invoice.dueDate"] = translate("dueDate");
  } else if (data.invoice.invoiceDate && data.invoice.dueDate < data.invoice.invoiceDate) {
    errors["invoice.dueDate"] = translate("dueDateOrder");
  }

  if (!data.lineItems.length) {
    errors.lineItems = translate("lineItems");
  } else {
    data.lineItems.forEach((item, index) => {
      if (isBlank(item.description)) {
        errors[`lineItems[${index}].description`] = translate("itemDescription");
      }
      if (isInvalidAmount(item.quantity)) {
        errors[`lineItems[${index}].quantity`] = translate("itemQuantity");
      }
      if (isInvalidAmount(item.unitPrice)) {
        errors[`lineItems[${index}].unitPrice`] = translate("itemRate");
      }
    });
  }

  if (!isSupportedCurrency(data.invoice.currency))
    errors["invoice.currency"] = "Choose a supported currency with two decimal places.";
  const config = data.totalsConfig;
  for (const field of ["discountValue", "taxRate", "shippingFee", "amountPaid"] as const) {
    if (!config || !isNonnegativeAmount(config[field]))
      errors[`totalsConfig.${field}`] = "Enter a finite amount of 0 or greater.";
  }
  if (config) {
    const subtotal = data.lineItems.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);
    if (
      (config.discountType === "percent" && config.discountValue > 100) ||
      (config.discountType === "fixed" && config.discountValue > subtotal)
    )
      errors["totalsConfig.discountValue"] = "Discount cannot exceed the invoice subtotal.";
    if (
      data.lineItems.every((item) => isNonnegativeAmount(item.quantity) && isNonnegativeAmount(item.unitPrice)) &&
      (!Number.isFinite(subtotal) || subtotal > Number.MAX_SAFE_INTEGER / 100)
    )
      errors.lineItems = "Invoice amount is too large to calculate accurately.";
    if (config.taxRate > 100) errors["totalsConfig.taxRate"] = "Tax rate must be between 0 and 100%.";
  }
  return errors;
}
