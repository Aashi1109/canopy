/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  DocumentDefinition,
  DocumentFieldDefinition,
  DocumentRepeaterColumnDefinition,
  DocumentType,
  PageFormat,
  SensitiveDataClassification,
  TemplateFormConfig,
  TemplateScalarControl,
} from "./templateTypes.ts";

export const DOCUMENT_TYPES = [
  "invoice",
  "receipt",
  "expense-report",
  "mileage-log",
  "quarterly-tax-estimator",
  "w9-request",
  "1099-nec-tracker",
] as const satisfies readonly DocumentType[];

type FieldOptions = Partial<
  Omit<DocumentFieldDefinition, "key" | "label" | "description" | "section" | "sampleValue">
> & {
  description?: string;
};

function field(
  key: string,
  label: string,
  section: string,
  sampleValue: string,
  options: FieldOptions = {},
): DocumentFieldDefinition {
  return {
    key,
    label,
    description: options.description ?? label,
    section,
    valueType: options.valueType ?? "text",
    control: options.control ?? "text",
    source: options.source ?? "user",
    required: options.required ?? false,
    computationRequired: options.computationRequired ?? false,
    sampleValue,
    allowedBindingTypes: options.allowedBindingTypes ?? ["text"],
    ...(options.repeaterColumns ? { repeaterColumns: options.repeaterColumns } : {}),
    sensitiveData: options.sensitiveData ?? "none",
  };
}

function column(
  key: string,
  label: string,
  control: TemplateScalarControl,
  sampleValue: string,
  options: {
    required?: boolean;
    sensitiveData?: SensitiveDataClassification;
  } = {},
): DocumentRepeaterColumnDefinition {
  return {
    key,
    label,
    valueType:
      control === "checkbox"
        ? "boolean"
        : control === "number" || control === "currency" || control === "percent"
          ? "number"
          : control === "date"
            ? "date"
            : control === "time"
              ? "time"
              : "text",
    control,
    required: options.required ?? false,
    sampleValue,
    sensitiveData: options.sensitiveData ?? "none",
  };
}

function repeater(
  key: string,
  label: string,
  section: string,
  rows: readonly Record<string, unknown>[],
  columns: readonly DocumentRepeaterColumnDefinition[],
  options: FieldOptions = {},
): DocumentFieldDefinition {
  return field(key, label, section, JSON.stringify(rows), {
    ...options,
    valueType: "table",
    control: "repeater",
    allowedBindingTypes: ["table"],
    repeaterColumns: columns,
  });
}

function computed(
  key: string,
  label: string,
  section: string,
  sampleValue: string,
  options: FieldOptions = {},
): DocumentFieldDefinition {
  return field(key, label, section, sampleValue, {
    ...options,
    source: "computed",
    control: "hidden",
    valueType: options.valueType ?? "number",
    sensitiveData: options.sensitiveData ?? "financial",
  });
}

function system(
  key: string,
  label: string,
  section: string,
  sampleValue: string,
  options: FieldOptions = {},
): DocumentFieldDefinition {
  return field(key, label, section, sampleValue, {
    ...options,
    source: "system",
    control: "hidden",
  });
}

function reference(
  key: string,
  label: string,
  section: string,
  sampleValue: string,
  options: FieldOptions = {},
): DocumentFieldDefinition {
  return field(key, label, section, sampleValue, {
    ...options,
    source: "reference",
    control: "hidden",
  });
}

function defaultForm(
  fields: readonly DocumentFieldDefinition[],
  sectionLabels: readonly (readonly [string, string])[],
): TemplateFormConfig {
  return {
    sections: sectionLabels.flatMap(([id, label]) => {
      const entries = fields
        .filter((candidate) => candidate.section === id && candidate.source === "user")
        .map((candidate) => ({
          kind: "builtin" as const,
          key: candidate.key,
          label: candidate.label,
          helpText: candidate.description,
          required: candidate.required,
          enabled: true,
        }));
      return entries.length ? [{ id, label, entries }] : [];
    }),
  };
}

function definition(
  input: Omit<DocumentDefinition, "defaultForm"> & {
    sections: readonly (readonly [string, string])[];
  },
): DocumentDefinition {
  const { sections, ...document } = input;
  return {
    ...document,
    defaultForm: defaultForm(document.fields, sections),
  };
}

const invoiceFields = [
  field("businessName", "Business name", "business", "Northstar Studio", {
    required: true,
    sensitiveData: "contact",
  }),
  field("businessAddress", "Business address", "business", "42 Market Street\nAustin, TX 78701", {
    control: "textarea",
    sensitiveData: "contact",
  }),
  field("businessEmail", "Business email", "business", "hello@northstar.example", {
    control: "email",
    sensitiveData: "contact",
  }),
  field("businessPhone", "Business phone", "business", "+1 512 555 0142", {
    control: "phone",
    sensitiveData: "contact",
  }),
  field("customerName", "Customer name", "customer", "Avery Morgan", {
    required: true,
    sensitiveData: "contact",
  }),
  field("customerCompany", "Customer company", "customer", "Brightside Labs"),
  field("customerAddress", "Customer address", "customer", "18 Congress Avenue\nAustin, TX 78701", {
    control: "textarea",
    sensitiveData: "contact",
  }),
  field("customerEmail", "Customer email", "customer", "avery@example.com", {
    control: "email",
    sensitiveData: "contact",
  }),
  system("documentTitle", "Document title", "details", "INVOICE"),
  field("invoiceNumber", "Invoice number", "details", "INV-2026-0421", {
    required: true,
    computationRequired: true,
  }),
  field("invoiceDate", "Invoice date", "details", "2026-07-23", {
    control: "date",
    valueType: "date",
    required: true,
  }),
  field("dueDate", "Due date", "details", "2026-08-22", {
    control: "date",
    valueType: "date",
  }),
  field("paymentTerms", "Payment terms", "details", "Net 30"),
  field("poNumber", "Purchase order", "details", "PO-1842"),
  field("projectName", "Project", "details", "Brand refresh"),
  repeater(
    "lineItems",
    "Line items",
    "items",
    [
      {
        id: "item-1",
        description: "Brand strategy workshop",
        quantity: 1,
        rate: 1200,
        taxable: true,
      },
      {
        id: "item-2",
        description: "Website design",
        quantity: 24,
        rate: 75,
        taxable: true,
      },
    ],
    [
      column("description", "Description", "text", "Brand strategy workshop", {
        required: true,
      }),
      column("quantity", "Quantity", "number", "1", { required: true }),
      column("rate", "Rate", "currency", "1200", { required: true }),
      column("taxable", "Taxable", "checkbox", "true"),
    ],
    { required: true, computationRequired: true, sensitiveData: "financial" },
  ),
  field("discountType", "Discount type", "adjustments", "none", {
    control: "select",
    computationRequired: true,
  }),
  field("discountValue", "Discount value", "adjustments", "0", {
    control: "currency",
    valueType: "number",
    computationRequired: true,
    sensitiveData: "financial",
  }),
  field("taxRate", "Tax rate", "adjustments", "18", {
    control: "percent",
    valueType: "number",
    computationRequired: true,
    sensitiveData: "financial",
  }),
  field("shippingFee", "Shipping", "adjustments", "0", {
    control: "currency",
    valueType: "number",
    computationRequired: true,
    sensitiveData: "financial",
  }),
  field("amountPaid", "Amount paid", "payment", "0", {
    control: "currency",
    valueType: "number",
    sensitiveData: "financial",
  }),
  field(
    "paymentInstructions",
    "Payment instructions",
    "payment",
    "Pay by ACH using the reference above.",
    { control: "textarea", sensitiveData: "financial" },
  ),
  field("notes", "Notes", "notes", "Thank you for your business.", {
    control: "textarea",
  }),
  field("terms", "Terms", "notes", "Payment is due within 30 days.", {
    control: "textarea",
  }),
  computed("subtotal", "Subtotal", "totals", "$3,000.00"),
  computed("discountAmount", "Discount", "totals", "$0.00"),
  computed("taxableSubtotal", "Taxable subtotal", "totals", "$3,000.00"),
  computed("tax", "Tax", "totals", "$540.00"),
  computed("total", "Total", "totals", "$3,540.00"),
  computed("balanceDue", "Balance due", "totals", "$3,540.00"),
] as const;

const receiptFields = [
  field("businessName", "Merchant name", "merchant", "Northstar Market", {
    required: true,
    sensitiveData: "contact",
  }),
  field("businessAddress", "Merchant address", "merchant", "42 Market Street\nAustin, TX 78701", {
    control: "textarea",
    sensitiveData: "contact",
  }),
  field("businessPhone", "Merchant phone", "merchant", "+1 512 555 0184", {
    control: "phone",
    sensitiveData: "contact",
  }),
  field("customerName", "Customer name", "customer", "Avery Morgan", {
    sensitiveData: "contact",
  }),
  field("customerEmail", "Customer email", "customer", "avery@example.com", {
    control: "email",
    sensitiveData: "contact",
  }),
  system("documentTitle", "Document title", "transaction", "RECEIPT"),
  field("receiptNumber", "Receipt number", "transaction", "RCP-2026-0184", {
    required: true,
    computationRequired: true,
  }),
  field("receiptDate", "Receipt date", "transaction", "2026-07-23", {
    control: "date",
    valueType: "date",
    required: true,
  }),
  field("receiptTime", "Receipt time", "transaction", "16:32", {
    control: "time",
    valueType: "time",
  }),
  field("transactionId", "Transaction ID", "transaction", "TXN-908431"),
  field("relatedInvoiceNumber", "Related invoice", "transaction", "INV-2026-0421"),
  repeater(
    "lineItems",
    "Items",
    "items",
    [
      {
        id: "item-1",
        description: "Cold brew coffee",
        quantity: 2,
        unitPrice: 6,
      },
      {
        id: "item-2",
        description: "Canvas tote bag",
        quantity: 1,
        unitPrice: 18,
      },
    ],
    [
      column("description", "Item", "text", "Cold brew coffee", {
        required: true,
      }),
      column("quantity", "Quantity", "number", "2", { required: true }),
      column("unitPrice", "Unit price", "currency", "6", { required: true }),
    ],
    { required: true, computationRequired: true, sensitiveData: "financial" },
  ),
  field("discountValue", "Discount", "adjustments", "0", {
    control: "currency",
    valueType: "number",
    computationRequired: true,
    sensitiveData: "financial",
  }),
  field("salesTaxRate", "Sales tax rate", "adjustments", "8", {
    control: "percent",
    valueType: "number",
    computationRequired: true,
    sensitiveData: "financial",
  }),
  field("tip", "Tip", "adjustments", "3", {
    control: "currency",
    valueType: "number",
    computationRequired: true,
    sensitiveData: "financial",
  }),
  field("additionalFee", "Additional fee", "adjustments", "0", {
    control: "currency",
    valueType: "number",
    computationRequired: true,
    sensitiveData: "financial",
  }),
  field("amountRefunded", "Amount refunded", "refund", "0", {
    control: "currency",
    valueType: "number",
    computationRequired: true,
    sensitiveData: "financial",
  }),
  field("paymentMethod", "Payment method", "payment", "Visa •••• 4242", {
    sensitiveData: "financial",
  }),
  field("paymentNote", "Payment note", "payment", "Approved"),
  field("notes", "Notes", "notes", "Thank you for stopping by!", {
    control: "textarea",
  }),
  field("thankYouMessage", "Footer message", "notes", "We appreciate your business."),
  computed("subtotal", "Subtotal", "totals", "$30.00"),
  computed("discountAmount", "Discount", "totals", "$0.00"),
  computed("tax", "Tax", "totals", "$2.40"),
  computed("grossTotal", "Gross total", "totals", "$35.40"),
  computed("total", "Total", "totals", "$35.40"),
  computed("netPaid", "Net paid", "totals", "$35.40"),
  computed("balanceDue", "Balance", "totals", "$0.00"),
] as const;

const expenseFields = [
  field("reportNumber", "Report number", "report", "EXP-2026-039", {
    required: true,
  }),
  field("reportTitle", "Report title", "report", "Seattle Client Pitch Sprint", {
    required: true,
  }),
  field("reportDate", "Report date", "report", "2026-05-20", {
    control: "date",
    valueType: "date",
    required: true,
  }),
  field("periodStart", "Period start", "report", "2026-05-15", {
    control: "date",
    valueType: "date",
  }),
  field("periodEnd", "Period end", "report", "2026-05-20", {
    control: "date",
    valueType: "date",
  }),
  field("purpose", "Business purpose", "report", "Client pitch and onboarding sprint", {
    control: "textarea",
  }),
  field("submitterName", "Submitter name", "submitter", "Alex Mercer", {
    required: true,
    sensitiveData: "contact",
  }),
  field("submitterEmail", "Submitter email", "submitter", "alex@example.com", {
    control: "email",
    sensitiveData: "contact",
  }),
  field("submitterAddress", "Submitter address", "submitter", "404 Ridge Point Lane", {
    control: "textarea",
    sensitiveData: "contact",
  }),
  field("clientName", "Client", "project", "Acme Retail Co."),
  field("projectName", "Project", "project", "Acme Brand Alignment"),
  field("department", "Department", "project", "Client Services"),
  repeater(
    "expenseRows",
    "Expenses",
    "expenses",
    [
      {
        id: "expense-1",
        date: "2026-05-16",
        merchant: "Alaska Airlines",
        category: "Travel",
        description: "Round-trip flight",
        baseAmount: 480,
        tax: 35,
        tip: 0,
        reimbursable: true,
        billable: true,
      },
    ],
    [
      column("date", "Date", "date", "2026-05-16", { required: true }),
      column("merchant", "Merchant", "text", "Alaska Airlines", {
        required: true,
      }),
      column("category", "Category", "select", "Travel", { required: true }),
      column("description", "Description", "text", "Round-trip flight"),
      column("baseAmount", "Base amount", "currency", "480", { required: true }),
      column("tax", "Tax", "currency", "35"),
      column("tip", "Tip", "currency", "0"),
      column("reimbursable", "Reimbursable", "checkbox", "true"),
      column("billable", "Billable", "checkbox", "true"),
    ],
    { required: true, computationRequired: true, sensitiveData: "financial" },
  ),
  repeater(
    "mileageRows",
    "Mileage",
    "mileage",
    [
      {
        id: "mileage-1",
        date: "2026-05-17",
        purpose: "Office to airport",
        miles: 110,
        rate: 0.725,
      },
    ],
    [
      column("date", "Date", "date", "2026-05-17", { required: true }),
      column("purpose", "Purpose", "text", "Office to airport", {
        required: true,
      }),
      column("miles", "Miles", "number", "110", { required: true }),
      column("rate", "Rate", "currency", "0.725", { required: true }),
    ],
    { computationRequired: true, sensitiveData: "financial" },
  ),
  field("advanceReceived", "Advance received", "advance", "150", {
    control: "currency",
    valueType: "number",
    computationRequired: true,
    sensitiveData: "financial",
  }),
  field("evidenceSummary", "Evidence summary", "evidence", "3 receipts attached", {
    control: "textarea",
  }),
  field("certification", "Certification", "approval", "I certify these expenses are accurate.", {
    control: "checkbox",
    valueType: "boolean",
  }),
  field("approverName", "Approver", "approval", "Jordan Lee", {
    sensitiveData: "contact",
  }),
  computed("categoryTotals", "Category totals", "totals", "Travel $515.00", {
    valueType: "text",
  }),
  computed("taxTotal", "Tax total", "totals", "$35.00"),
  computed("tipTotal", "Tip total", "totals", "$0.00"),
  computed("mileageReimbursement", "Mileage reimbursement", "totals", "$79.75"),
  computed("reimbursableTotal", "Reimbursable total", "totals", "$594.75"),
  computed("billableTotal", "Billable total", "totals", "$515.00"),
  computed("reportTotal", "Report total", "totals", "$594.75"),
  computed("amountDue", "Amount due", "totals", "$444.75"),
] as const;

const mileageFields = [
  field("taxYear", "Tax year", "settings", "2026", {
    control: "number",
    valueType: "number",
    required: true,
    computationRequired: true,
    sensitiveData: "tax",
  }),
  field("vehicleDescription", "Vehicle", "vehicle", "2024 Ford Maverick Hybrid", {
    required: true,
  }),
  field("rateMode", "Rate mode", "settings", "irs-standard", {
    control: "select",
    required: true,
    computationRequired: true,
  }),
  field("customRate", "Custom rate", "settings", "0.70", {
    control: "currency",
    valueType: "number",
    computationRequired: true,
    sensitiveData: "financial",
  }),
  repeater(
    "trips",
    "Business trips",
    "trips",
    [
      {
        id: "trip-1",
        date: "2026-04-12",
        purpose: "Client pitch review",
        startLocation: "Asheville HQ",
        destination: "Broad Street Retail Lab",
        miles: 55,
        parking: 12,
        tolls: 4.5,
      },
      {
        id: "trip-2",
        date: "2026-07-15",
        purpose: "Site inspection",
        startLocation: "Charlotte",
        destination: "Corporate Center",
        miles: 35,
        parking: 0,
        tolls: 3,
      },
    ],
    [
      column("date", "Date", "date", "2026-04-12", { required: true }),
      column("purpose", "Business purpose", "text", "Client pitch review", {
        required: true,
      }),
      column("startLocation", "Start", "text", "Asheville HQ"),
      column("destination", "Destination", "text", "Broad Street Retail Lab"),
      column("miles", "Miles", "number", "55", { required: true }),
      column("parking", "Parking", "currency", "12"),
      column("tolls", "Tolls", "currency", "4.5"),
    ],
    { required: true, computationRequired: true, sensitiveData: "tax" },
  ),
  repeater(
    "fuelRecords",
    "Fuel records (informational)",
    "fuel",
    [
      {
        id: "fuel-1",
        date: "2026-04-10",
        gallons: 12,
        cost: 42,
        merchant: "Shell Asheville",
        odometer: 19050,
      },
    ],
    [
      column("date", "Date", "date", "2026-04-10"),
      column("gallons", "Gallons", "number", "12"),
      column("cost", "Cost", "currency", "42"),
      column("merchant", "Merchant", "text", "Shell Asheville"),
      column("odometer", "Odometer", "number", "19050"),
    ],
    { sensitiveData: "financial" },
  ),
  field("notes", "Notes", "notes", "Fuel records do not increase the standard-mileage deduction.", {
    control: "textarea",
  }),
  computed("effectiveRates", "Effective rates", "totals", "72.5¢ before July 1; 76¢ after"),
  computed("totalMiles", "Total miles", "totals", "90"),
  computed("parkingAndTolls", "Parking and tolls", "totals", "$19.50"),
  computed("standardMileageDeduction", "Standard-mileage deduction", "totals", "$86.00"),
  computed("fuelCost", "Fuel cost", "totals", "$42.00"),
  computed("fuelEconomy", "Fuel economy", "totals", "7.5 MPG"),
] as const;

const quarterlyTaxFields = [
  field("taxYear", "Tax year", "profile", "2026", {
    control: "number",
    valueType: "number",
    required: true,
    computationRequired: true,
    sensitiveData: "tax",
  }),
  field("filingStatus", "Filing status", "profile", "single", {
    control: "select",
    required: true,
    computationRequired: true,
    sensitiveData: "tax",
  }),
  field("grossRevenue", "Gross business revenue", "income", "85000", {
    control: "currency",
    valueType: "number",
    required: true,
    computationRequired: true,
    sensitiveData: "financial",
  }),
  field("otherIncome", "Other income", "income", "0", {
    control: "currency",
    valueType: "number",
    computationRequired: true,
    sensitiveData: "financial",
  }),
  field("existingWages", "Existing wages", "income", "0", {
    control: "currency",
    valueType: "number",
    computationRequired: true,
    sensitiveData: "financial",
  }),
  field("businessDeductions", "Business deductions", "deductions", "12500", {
    control: "currency",
    valueType: "number",
    computationRequired: true,
    sensitiveData: "tax",
  }),
  field("otherDeductions", "Above-line deductions", "deductions", "0", {
    control: "currency",
    valueType: "number",
    computationRequired: true,
    sensitiveData: "tax",
  }),
  field("itemizedDeductions", "Itemized deductions", "deductions", "0", {
    control: "currency",
    valueType: "number",
    computationRequired: true,
    sensitiveData: "tax",
  }),
  field("taxCredits", "Tax credits", "payments", "0", {
    control: "currency",
    valueType: "number",
    computationRequired: true,
    sensitiveData: "tax",
  }),
  field("federalWithholding", "Federal withholding", "payments", "0", {
    control: "currency",
    valueType: "number",
    computationRequired: true,
    sensitiveData: "tax",
  }),
  field("estimatedPaymentsMade", "Estimated payments made", "payments", "0", {
    control: "currency",
    valueType: "number",
    computationRequired: true,
    sensitiveData: "tax",
  }),
  field("priorYearTax", "Prior-year tax", "safe-harbor", "12000", {
    control: "currency",
    valueType: "number",
    computationRequired: true,
    sensitiveData: "tax",
  }),
  field("priorYearAgi", "Prior-year AGI", "safe-harbor", "95000", {
    control: "currency",
    valueType: "number",
    computationRequired: true,
    sensitiveData: "tax",
  }),
  field("stateTaxRate", "State estimate rate", "state", "4.5", {
    control: "percent",
    valueType: "number",
    computationRequired: true,
    sensitiveData: "tax",
  }),
  field(
    "assumptions",
    "Additional assumptions",
    "assumptions",
    "Income is earned evenly through the year.",
    {
      control: "textarea",
    },
  ),
  computed("adjustedGrossIncome", "Adjusted gross income", "summary", "$65,520.00"),
  computed("taxableIncome", "Taxable income", "summary", "$50,920.00"),
  computed("incomeTax", "Federal income tax", "summary", "$6,053.00"),
  computed("selfEmploymentTax", "Self-employment tax", "summary", "$10,248.00"),
  computed("stateEstimate", "Simple state estimate", "summary", "$2,291.00"),
  computed("estimatedLiability", "Estimated liability", "summary", "$18,592.00"),
  computed("requiredAnnualPayment", "Required annual payment", "summary", "$10,800.00"),
  computed(
    "quarterlyInstallments",
    "Quarterly installments",
    "schedule",
    JSON.stringify([
      { id: "q1", dueDate: "2026-04-15", amount: 2700 },
      { id: "q2", dueDate: "2026-06-15", amount: 2700 },
      { id: "q3", dueDate: "2026-09-15", amount: 2700 },
      { id: "q4", dueDate: "2027-01-15", amount: 2700 },
    ]),
    { valueType: "table", allowedBindingTypes: ["table"] },
  ),
  system("calculationVersion", "Calculation version", "assumptions", "2026.1"),
] as const;

const w9Fields = [
  field("requesterName", "Requester name", "requester", "Northstar Studio LLC", {
    required: true,
    sensitiveData: "contact",
  }),
  field("requesterEmail", "Requester email", "requester", "accounts@northstar.example", {
    control: "email",
    sensitiveData: "contact",
  }),
  field(
    "requesterAddress",
    "Requester address",
    "requester",
    "42 Market Street, Austin, TX 78701",
    {
      control: "textarea",
      sensitiveData: "contact",
    },
  ),
  field("contractorName", "Contractor legal name", "contractor", "Devon Lane", {
    required: true,
    sensitiveData: "contact",
  }),
  field("contractorBusinessName", "Contractor business name", "contractor", "Devon Dev LLC", {
    sensitiveData: "contact",
  }),
  field("contractorEmail", "Contractor email", "contractor", "devon@example.com", {
    control: "email",
    required: true,
    sensitiveData: "contact",
  }),
  field("requestDate", "Request date", "request", "2026-07-23", {
    control: "date",
    valueType: "date",
    required: true,
  }),
  field("dueDate", "Due date", "request", "2026-08-06", {
    control: "date",
    valueType: "date",
  }),
  field("reportingYear", "Reporting year", "request", "2026", {
    control: "number",
    valueType: "number",
    sensitiveData: "tax",
  }),
  field("message", "Request message", "message", "Please complete an official IRS Form W-9.", {
    control: "textarea",
  }),
  field(
    "secureSubmissionInstructions",
    "Secure submission instructions",
    "message",
    "Upload the completed form through your approved secure portal.",
    { control: "textarea" },
  ),
  field("supportContact", "Support contact", "message", "accounts@northstar.example", {
    control: "email",
    sensitiveData: "contact",
  }),
  field("requestStatus", "Request status", "status", "Requested", {
    control: "select",
  }),
  reference(
    "officialW9Url",
    "Official IRS W-9",
    "compliance",
    "https://www.irs.gov/pub/irs-pdf/fw9.pdf",
  ),
  system(
    "requestOnlyDisclaimer",
    "Request-only privacy disclaimer",
    "compliance",
    "This document is only a request to complete the official IRS Form W-9. Do not enter or return a TIN, SSN, EIN, certification, or signature in this request document.",
  ),
] as const;

const necFields = [
  field("reportingYear", "Reporting year", "report", "2026", {
    control: "number",
    valueType: "number",
    required: true,
    computationRequired: true,
    sensitiveData: "tax",
  }),
  field("payerName", "Payer name", "payer", "Northstar Studio LLC", {
    required: true,
    sensitiveData: "contact",
  }),
  field("payerAddress", "Payer address", "payer", "42 Market Street, Austin, TX 78701", {
    control: "textarea",
    sensitiveData: "contact",
  }),
  field("payerEmail", "Payer email", "payer", "accounts@northstar.example", {
    control: "email",
    sensitiveData: "contact",
  }),
  repeater(
    "paymentRows",
    "Payments",
    "payments",
    [
      {
        id: "payment-1",
        date: "2026-02-15",
        vendorId: "vendor-1",
        amount: 2450,
        paymentMethod: "ACH",
        category: "Services",
        description: "Design consulting",
        includeIn1099: true,
      },
    ],
    [
      column("date", "Date", "date", "2026-02-15", { required: true }),
      column("vendorId", "Vendor reference", "text", "vendor-1", {
        required: true,
      }),
      column("amount", "Amount", "currency", "2450", { required: true }),
      column("paymentMethod", "Payment method", "select", "ACH"),
      column("category", "Category", "select", "Services"),
      column("description", "Description", "text", "Design consulting"),
      column("includeIn1099", "Reportable", "checkbox", "true"),
    ],
    { required: true, computationRequired: true, sensitiveData: "tax" },
  ),
  repeater(
    "recipientAdjustments",
    "Annual recipient adjustments",
    "adjustments",
    [
      {
        id: "adjustment-1",
        vendorId: "vendor-1",
        cashTips: 0,
        occupationCode: "27-1024",
        qualifiedOvertime: 0,
        federalWithholding: 0,
        state: "TX",
        stateIncome: 0,
        stateWithholding: 0,
      },
    ],
    [
      column("vendorId", "Vendor reference", "text", "vendor-1", {
        required: true,
      }),
      column("cashTips", "Cash tips", "currency", "0"),
      column("occupationCode", "Occupation code", "text", "27-1024"),
      column("qualifiedOvertime", "Qualified overtime", "currency", "0"),
      column("federalWithholding", "Federal withholding", "currency", "0"),
      column("state", "State", "text", "TX"),
      column("stateIncome", "State income", "currency", "0"),
      column("stateWithholding", "State withholding", "currency", "0"),
    ],
    { computationRequired: true, sensitiveData: "tax" },
  ),
  reference(
    "vendorReferences",
    "Vendor and W-9 references",
    "references",
    "Devon Dev LLC · W-9 received",
  ),
  reference(
    "maskedTinReferences",
    "Masked TIN references",
    "references",
    "Devon Dev LLC · •••• 4821",
    {
      sensitiveData: "masked-tax-id",
    },
  ),
  field("filingStatus", "Filing status", "status", "Review required", {
    control: "select",
    sensitiveData: "tax",
  }),
  computed("reportableTotal", "Reportable total", "summary", "$2,450.00"),
  computed("thresholdStatus", "Threshold status", "summary", "Meets the 2026 $2,000 threshold", {
    valueType: "text",
  }),
  computed("box1Summary", "Box 1 summary", "summary", "$2,450.00"),
  computed("box4Summary", "Box 4 summary", "summary", "$0.00"),
  computed("stateSummary", "State summary", "summary", "$0.00"),
  system(
    "internalReportDisclaimer",
    "Internal-report disclaimer",
    "compliance",
    "Internal tracking report only. This is not an official or fileable Form 1099-NEC Copy A.",
  ),
] as const;

export const DOCUMENT_DEFINITIONS = [
  definition({
    documentType: "invoice",
    label: "Invoice",
    toolComponentKey: "invoice-generator",
    defaultPageFormat: "A4",
    allowedPageFormats: ["A4", "LETTER"],
    fields: invoiceFields,
    sections: [
      ["business", "Business"],
      ["customer", "Customer"],
      ["details", "Invoice details"],
      ["items", "Line items"],
      ["adjustments", "Discounts, tax, and shipping"],
      ["payment", "Payment information"],
      ["notes", "Notes and terms"],
    ],
    requiredBindings: [
      "businessName",
      "invoiceNumber",
      "customerName",
      "lineItems",
      "subtotal",
      "total",
      "balanceDue",
    ],
    complianceMode: "normal",
  }),
  definition({
    documentType: "receipt",
    label: "Receipt",
    toolComponentKey: "receipt-generator",
    defaultPageFormat: "RECEIPT_80MM",
    allowedPageFormats: ["RECEIPT_80MM", "RECEIPT_58MM"],
    fields: receiptFields,
    sections: [
      ["merchant", "Merchant"],
      ["customer", "Customer"],
      ["transaction", "Transaction details"],
      ["items", "Items"],
      ["adjustments", "Discounts, tax, tip, and fees"],
      ["payment", "Payment"],
      ["refund", "Refund"],
      ["notes", "Notes and footer"],
    ],
    requiredBindings: [
      "businessName",
      "receiptNumber",
      "lineItems",
      "subtotal",
      "total",
      "balanceDue",
    ],
    complianceMode: "normal",
  }),
  definition({
    documentType: "expense-report",
    label: "Expense report",
    toolComponentKey: "expense-report",
    defaultPageFormat: "LETTER",
    allowedPageFormats: ["A4", "LETTER"],
    fields: expenseFields,
    sections: [
      ["report", "Report details"],
      ["submitter", "Submitter"],
      ["project", "Client and project"],
      ["expenses", "Expenses"],
      ["mileage", "Mileage"],
      ["advance", "Advance"],
      ["evidence", "Evidence"],
      ["approval", "Certification and approval"],
    ],
    requiredBindings: ["reportNumber", "submitterName", "expenseRows", "reportTotal", "amountDue"],
    complianceMode: "normal",
  }),
  definition({
    documentType: "mileage-log",
    label: "Mileage log",
    toolComponentKey: "mileage-log",
    defaultPageFormat: "LETTER",
    allowedPageFormats: ["A4", "LETTER"],
    fields: mileageFields,
    sections: [
      ["settings", "Tax year and rate"],
      ["vehicle", "Vehicle"],
      ["trips", "Trips"],
      ["fuel", "Fuel records"],
      ["notes", "Notes"],
    ],
    requiredBindings: [
      "taxYear",
      "vehicleDescription",
      "trips",
      "totalMiles",
      "standardMileageDeduction",
    ],
    complianceMode: "internal-tax-report",
  }),
  definition({
    documentType: "quarterly-tax-estimator",
    label: "Quarterly tax estimate",
    toolComponentKey: "quarterly-tax-estimator",
    defaultPageFormat: "LETTER",
    allowedPageFormats: ["A4", "LETTER"],
    fields: quarterlyTaxFields,
    sections: [
      ["profile", "Tax profile"],
      ["income", "Income"],
      ["deductions", "Deductions"],
      ["payments", "Credits and withholding"],
      ["safe-harbor", "Prior-year safe harbor"],
      ["state", "State estimate"],
      ["assumptions", "Assumptions"],
    ],
    requiredBindings: [
      "taxYear",
      "filingStatus",
      "estimatedLiability",
      "requiredAnnualPayment",
      "quarterlyInstallments",
      "calculationVersion",
    ],
    complianceMode: "internal-tax-report",
  }),
  definition({
    documentType: "w9-request",
    label: "W-9 request",
    toolComponentKey: "w9-request",
    defaultPageFormat: "LETTER",
    allowedPageFormats: ["A4", "LETTER"],
    fields: w9Fields,
    sections: [
      ["requester", "Requester"],
      ["contractor", "Contractor"],
      ["request", "Request details"],
      ["message", "Message and secure submission"],
      ["status", "Status"],
    ],
    requiredBindings: ["requesterName", "contractorName", "officialW9Url", "requestOnlyDisclaimer"],
    complianceMode: "tax-request",
  }),
  definition({
    documentType: "1099-nec-tracker",
    label: "1099-NEC tracker",
    toolComponentKey: "1099-nec-tracker",
    defaultPageFormat: "LETTER",
    allowedPageFormats: ["A4", "LETTER"],
    fields: necFields,
    sections: [
      ["report", "Reporting year"],
      ["payer", "Payer profile"],
      ["payments", "Payments"],
      ["adjustments", "Annual recipient adjustments"],
      ["status", "Filing status"],
    ],
    requiredBindings: [
      "reportingYear",
      "payerName",
      "paymentRows",
      "reportableTotal",
      "thresholdStatus",
      "internalReportDisclaimer",
    ],
    complianceMode: "internal-tax-report",
  }),
] as const satisfies readonly DocumentDefinition[];

export const DOCUMENT_DEFINITION_BY_TYPE = Object.fromEntries(
  DOCUMENT_DEFINITIONS.map((item) => [item.documentType, item]),
) as Readonly<Record<DocumentType, DocumentDefinition>>;

export function getDocumentDefinition(documentType: DocumentType): DocumentDefinition {
  return DOCUMENT_DEFINITION_BY_TYPE[documentType];
}

export const LEGACY_FIELD_ALIASES: Readonly<
  Partial<Record<DocumentType, Readonly<Record<string, string>>>>
> = {
  invoice: {
    documentNumber: "invoiceNumber",
    invoiceNumber: "invoiceNumber",
    issueDate: "invoiceDate",
    invoiceDate: "invoiceDate",
    discount: "discountAmount",
    discountAmount: "discountAmount",
    shipping: "shippingFee",
    shippingFee: "shippingFee",
  },
  receipt: {
    documentNumber: "receiptNumber",
    receiptNumber: "receiptNumber",
    issueDate: "receiptDate",
    receiptDate: "receiptDate",
    discount: "discountAmount",
    discountAmount: "discountAmount",
  },
};

export function resolveDocumentFieldKey(documentType: DocumentType, key: string): string {
  return LEGACY_FIELD_ALIASES[documentType]?.[key] ?? key;
}

export function isDocumentType(value: string): value is DocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(value);
}

export function isPageFormatAllowed(documentType: DocumentType, pageFormat: PageFormat): boolean {
  return getDocumentDefinition(documentType).allowedPageFormats.includes(pageFormat);
}
