import type { AdvancedDocumentTemplate } from "../invoice-templates/index.ts";
import { getDocumentDefinition } from "../invoice-templates/documentDefinitions.ts";
import type { InvoiceData } from "./types.ts";
import { calculateInvoiceTotals, formatCurrency } from "./utils/calculations.ts";

type Address = {
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
};

type ReceiptTemplateSource = {
  business: Address & {
    name: string;
    email: string;
    phone: string;
    website: string;
    taxId?: string;
  };
  customer: Address & {
    name: string;
    company: string;
    email: string;
    phone: string;
  };
  receiptNumber: string;
  receiptDate: string;
  receiptTime: string;
  relatedInvoiceNumber: string;
  transactionId: string;
  paymentStatus: string;
  currency?: string;
  amountReceived?: number;
  receiptType: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
  }>;
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
};

type ReceiptTemplateTotals = {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  balanceDue: number;
  amountReceived?: number;
  netReceived?: number;
};

function address(address: Address) {
  return [
    address.addressLine1,
    address.addressLine2,
    [address.city, address.state, address.zipCode].filter(Boolean).join(" "),
    address.country,
  ]
    .filter(Boolean)
    .join("\n");
}

export function applyTemplateFormatting(
  template: AdvancedDocumentTemplate,
  inputs: Record<string, string>,
): Record<string, string> {
  const formatted = { ...inputs };
  const schemas = [
    ...template.config.template.schemas.flat(),
    ...(template.config.template.basePdf.staticSchema ?? []),
  ];

  for (const schema of schemas) {
    if (schema.type === "table") {
      const raw = inputs[schema.name];
      const rows: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(rows)) throw new Error(`Table ${schema.name} must contain rows.`);
      const custom = template.config.form.sections
        .flatMap((section) => section.entries)
        .find((entry) => entry.key === schema.name && entry.kind === "repeater");
      const columns =
        custom?.kind === "repeater"
          ? custom.columns
          : getDocumentDefinition(template.documentType).fields.find((field) => field.key === schema.name)
              ?.repeaterColumns;
      const head = Array.isArray(schema.head) ? schema.head : [];
      const cells = rows.map((row: unknown) => {
        if (Array.isArray(row)) {
          if (row.length > head.length) throw new Error(`Table ${schema.name} has more cells than configured columns.`);
          return head.map((_, index) => String(row[index] ?? ""));
        }
        if (!row || typeof row !== "object" || !columns || columns.length !== head.length) {
          throw new Error(
            `Table ${schema.name} columns must match its configured form columns. Update the template table layout to match the form before exporting.`,
          );
        }
        const record = row as Record<string, unknown>;
        return columns.map((column) => {
          const value = record[column.key];
          if (value === undefined || value === null) return "";
          if (typeof value === "boolean") return value ? "Yes" : "No";
          // Mileage rates retain their published fractional-cent precision.
          if (column.control === "currency" && typeof value === "number" && column.key !== "rate") {
            return formatCurrency(value, inputs.currency || "USD");
          }
          return String(value);
        });
      });
      formatted[schema.name] = JSON.stringify(cells);
      continue;
    }
    if (schema.name === "documentTitle" && !inputs.documentTitle && typeof schema.content === "string") {
      formatted.documentTitle = schema.content;
      continue;
    }
    const sample = template.config.sampleData[schema.name];
    const value = inputs[schema.name];
    const content = schema.content;
    if (
      typeof content === "string" &&
      sample &&
      typeof value === "string" &&
      content !== sample &&
      content.includes(sample)
    ) {
      formatted[schema.name] = content.replaceAll(sample, value);
    }
  }

  return formatted;
}

export function getInvoiceTemplateInputs(
  data: InvoiceData,
  sampleData: Record<string, string>,
): Record<string, string> {
  const totals = calculateInvoiceTotals(data);
  const currency = data.invoice.currency || "USD";
  const money = (value: number) => formatCurrency(value, currency);

  return {
    ...sampleData,
    businessName: data.business.name,
    businessAddress: address(data.business),
    businessEmail: data.business.email,
    businessPhone: data.business.phone,
    businessWebsite: data.business.website,
    businessTaxId: data.business.taxId ?? "",
    documentTitle: "INVOICE",
    documentNumber: data.invoice.invoiceNumber,
    invoiceNumber: data.invoice.invoiceNumber,
    issueDate: data.invoice.invoiceDate,
    invoiceDate: data.invoice.invoiceDate,
    dueDate: data.invoice.dueDate,
    paymentTerms: data.invoice.paymentTerms,
    poNumber: data.invoice.poNumber,
    projectName: data.invoice.projectName,
    customerLabel: "BILL TO",
    customerName: data.client.name,
    customerCompany: data.client.company,
    customerAddress: [data.client.company, address(data.client)].filter(Boolean).join("\n"),
    customerEmail: data.client.email,
    customerPhone: data.client.phone,
    lineItems: JSON.stringify(
      data.lineItems.map((item) => [
        item.description,
        String(item.quantity),
        money(item.unitPrice),
        money(item.quantity * item.unitPrice),
      ]),
    ),
    subtotal: money(totals.subtotal),
    discount: money(totals.discountAmount),
    discountAmount: money(totals.discountAmount),
    taxLabel: data.totalsConfig.taxLabel,
    tax: money(totals.taxAmount),
    shipping: money(totals.shippingFee),
    shippingFee: money(totals.shippingFee),
    total: money(totals.total),
    amountPaid: money(totals.amountPaid),
    balanceDue: money(totals.balanceDue),
    customerCredit: money(totals.customerCredit),
    currency: data.invoice.currency,
    paymentInstructions: data.payment.instructions,
    notes: data.notes.notes,
    terms: data.notes.terms,
    thankYouNote: data.payment.thankYouNote,
  };
}

export function getReceiptTemplateInputs(
  data: ReceiptTemplateSource,
  totals: ReceiptTemplateTotals,
  sampleData: Record<string, string>,
): Record<string, string> {
  const money = (value: number) => formatCurrency(value, data.currency || "USD");

  return {
    ...sampleData,
    businessName: data.business.name,
    businessAddress: address(data.business),
    businessEmail: data.business.email,
    businessPhone: data.business.phone,
    businessWebsite: data.business.website,
    businessTaxId: data.business.taxId ?? "",
    documentTitle: "RECEIPT",
    documentNumber: data.receiptNumber,
    receiptNumber: data.receiptNumber,
    issueDate: [data.receiptDate, data.receiptTime].filter(Boolean).join(" · "),
    receiptDate: data.receiptDate,
    receiptTime: data.receiptTime,
    customerLabel: "RECEIVED FROM",
    customerName: data.customer.name,
    customerCompany: data.customer.company,
    customerAddress: [data.customer.company, address(data.customer)].filter(Boolean).join("\n"),
    customerEmail: data.customer.email,
    customerPhone: data.customer.phone,
    lineItems: JSON.stringify(
      data.lineItems.map((item) => [item.description, String(item.quantity), money(item.quantity * item.unitPrice)]),
    ),
    subtotal: money(totals.subtotal),
    discount: money(totals.discountAmount),
    discountAmount: money(totals.discountAmount),
    taxLabel: data.salesTaxLabel,
    tax: money(totals.taxAmount),
    tip: money(data.tip),
    additionalFee: money(data.additionalFee),
    amountRefunded: money(data.amountRefunded),
    amountReceived: money(totals.amountReceived ?? data.amountReceived ?? 0),
    netReceived: money(totals.netReceived ?? 0),
    total: money(totals.total),
    balanceDue: money(totals.balanceDue),
    paymentMethod: data.paymentMethod,
    paymentNote: data.paymentNote,
    paymentStatus: data.paymentStatus,
    receiptType: data.receiptType,
    relatedInvoiceNumber: data.relatedInvoiceNumber,
    transactionId: data.transactionId,
    receivedBy: data.receivedBy,
    notes: data.notes,
    thankYouMessage: data.thankYouMessage,
  };
}
