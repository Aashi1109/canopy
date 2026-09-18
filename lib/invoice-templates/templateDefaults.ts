/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InvoiceTemplateConfig, LayoutFamily } from "./templateTypes.ts";

export const DEFAULT_LABELS = {
  invoiceTitle: "INVOICE",
  billTo: "Billed To",
  from: "Issuer",
  invoiceNumber: "Invoice Number",
  invoiceDate: "Issue Date",
  dueDate: "Payment Due",
  paymentTerms: "Payment Terms",
  poNumber: "P.O. Number",
  projectName: "Project Name",
  subtotal: "Subtotal",
  discount: "Discount",
  tax: "Sales Tax",
  shipping: "Shipping & Handling",
  amountPaid: "Amount Paid",
  total: "Total Due",
  balanceDue: "Balance Due",
  paymentInstructions: "Payment Instructions",
  notes: "Notes & Scope",
  terms: "Terms & Agreements",
};

export const DEFAULT_SECTION_ORDER = [
  "header",
  "meta_info",
  "line_items",
  "totals",
  "payment_instructions",
  "notes_terms",
  "footer",
];

export const getDefaultTemplateConfigByFamily = (family: LayoutFamily): InvoiceTemplateConfig => {
  const isDarkAccent = family === "bold" || family === "modern";

  return {
    theme: {
      primaryColor:
        family === "bold" ? "#1e3a8a" : family === "modern" ? "#0f172a" : family === "service" ? "#0284c7" : "#4f46e5", // bg-blue-900 or slate-900 or sky-600 or indigo-600
      accentColor: family === "minimal" ? "#f4f4f5" : "#3b82f6", // colors mapped.
      textColor: "#0f172a", // slate-900
      mutedTextColor: "#475569", // slate-600
      borderColor: "#e2e8f0", // slate-200
      backgroundColor: "#f8fafc", // slate-50
      surfaceColor: "#ffffff", // white
    },

    typography: {
      fontFamily: family === "modern" ? "Space Grotesk" : family === "minimal" ? "Inter" : "Inter",
      headingSize: family === "bold" ? "lg" : "md",
      bodySize: "sm",
      lineHeight: "normal",
    },

    page: {
      size: "LETTER",
      margin: family === "compact" ? "compact" : "normal",
      showPageBorder: false,
    },

    header: {
      style: family === "modern" ? "split" : family === "minimal" ? "minimal" : "left-logo",
      logoPosition: "left",
      logoSize: "md",
      showInvoiceTitle: true,
      invoiceTitleText: "INVOICE",
      showStatusBadge: true,
    },

    businessBlock: {
      position: family === "compact" ? "header" : "left-column",
      showBusinessName: true,
      showContactName: true,
      showEmail: true,
      showPhone: true,
      showWebsite: true,
      showAddress: true,
      showTaxId: true,
    },

    clientBlock: {
      title: "Prepared For / Bill To",
      position: family === "minimal" ? "left-column" : "right-column",
      showClientName: true,
      showCompany: true,
      showEmail: true,
      showPhone: true,
      showAddress: true,
    },

    metaBlock: {
      position: family === "modern" ? "below-header" : "right-column",
      showInvoiceNumber: true,
      showInvoiceDate: true,
      showDueDate: true,
      showPaymentTerms: true,
      showPoNumber: true,
      showProjectName: true,
    },

    lineItemsTable: {
      style: family === "minimal" ? "minimal" : family === "compact" ? "simple" : "striped",
      headerBackground: isDarkAccent,
      showItemNumbers: false,
      showTaxableColumn: true,
      descriptionLabel: "Item Description",
      quantityLabel: "Qty",
      rateLabel: "Rate",
      amountLabel: "Amount",
    },

    totalsBlock: {
      position: "right",
      style: family === "bold" ? "highlight-total" : "boxed",
      showSubtotal: true,
      showDiscount: true,
      showTax: true,
      showShipping: true,
      showAmountPaid: true,
      showBalanceDue: true,
      emphasizeBalanceDue: true,
    },

    paymentBlock: {
      title: "Payment Instructions",
      style: "boxed",
      showPaymentMethods: true,
      showInstructions: true,
      showLateFeeNote: true,
    },

    notesBlock: {
      title: "Notes & Agreements",
      style: "plain",
      showNotes: true,
      showTerms: true,
      showThankYouNote: true,
    },

    footer: {
      showFooter: true,
      text: "Not legal, tax, or accounting advice. Thank you for your business!",
      showGeneratedWith: true,
      alignment: "center",
    },

    watermark: {
      enabled: false,
      text: "DRAFT",
      opacity: 0.1,
      position: "center",
    },

    sectionOrder: [...DEFAULT_SECTION_ORDER],
    labels: { ...DEFAULT_LABELS },
    visibility: {
      showLogo: true,
      showBusinessBlock: true,
      showClientBlock: true,
      showMetaBlock: true,
      showLineItems: true,
      showTotals: true,
      showPaymentInstructions: true,
      showNotes: true,
      showTerms: true,
      showFooter: true,
    },

    pdf: {
      pageSize: "LETTER",
      orientation: "portrait",
      repeatTableHeader: true,
      avoidRowSplit: true,
      showPageNumbers: true,
    },
  };
};
