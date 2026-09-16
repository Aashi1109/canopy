import type { InvoiceData } from "../types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isBlank(value: unknown) {
  return typeof value !== "string" || !value.trim();
}

function isInvalidAmount(value: unknown) {
  return value === "" || !Number.isFinite(Number(value)) || Number(value) < 0;
}

export function validateInvoiceData(data: InvoiceData) {
  const errors: Record<string, string> = {};

  if (isBlank(data.business.name)) {
    errors["business.name"] = "Enter your business name.";
  }
  if (data.business.email && !EMAIL_PATTERN.test(data.business.email)) {
    errors["business.email"] = "Enter a valid business email address.";
  }
  if (isBlank(data.client.name)) {
    errors["client.name"] = "Enter the client name.";
  }
  if (data.client.email && !EMAIL_PATTERN.test(data.client.email)) {
    errors["client.email"] = "Enter a valid client email address.";
  }
  if (isBlank(data.invoice.invoiceNumber)) {
    errors["invoice.invoiceNumber"] = "Enter an invoice number.";
  }
  if (!data.invoice.invoiceDate) {
    errors["invoice.invoiceDate"] = "Choose an invoice date.";
  }
  if (!data.invoice.dueDate) {
    errors["invoice.dueDate"] = "Choose a payment due date.";
  } else if (data.invoice.invoiceDate && data.invoice.dueDate < data.invoice.invoiceDate) {
    errors["invoice.dueDate"] = "Due date must be on or after the invoice date.";
  }

  if (!data.lineItems.length) {
    errors.lineItems = "Add at least one line item.";
  } else {
    data.lineItems.forEach((item, index) => {
      if (isBlank(item.description)) {
        errors[`lineItems[${index}].description`] = "Enter an item description.";
      }
      if (isInvalidAmount(item.quantity)) {
        errors[`lineItems[${index}].quantity`] = "Quantity must be 0 or greater.";
      }
      if (isInvalidAmount(item.unitPrice)) {
        errors[`lineItems[${index}].unitPrice`] = "Rate must be 0 or greater.";
      }
    });
  }

  return errors;
}
