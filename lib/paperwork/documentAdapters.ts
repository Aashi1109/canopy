import {
  containsFullTin,
  getDocumentDefinition,
  type AdvancedDocumentTemplate,
  type DocumentType,
  type TemplateFormConfig,
} from "../invoice-templates/index.ts";
import type { InvoiceData } from "./types";
import {
  DEFAULT_EXPENSE_REPORT_DRAFT,
  SAMPLE_EXPENSE_REPORT_DRAFT,
  normalizeExpenseReportDraft,
  type ExpenseReportDraft,
} from "../../app/paperwork/components/expense/ExpenseReportPage";
import {
  DEFAULT_MILEAGE_DRAFT,
  SAMPLE_MILEAGE_DRAFT,
  normalizeMileageLogDraft,
  type MileageLogDraft,
} from "../../app/paperwork/components/mileage/MileageLogPage";
import {
  DEFAULT_NEC_TRACKER_DRAFT,
  SAMPLE_NEC_TRACKER_DRAFT,
  normalizeNecTrackerDraft,
  type NecTrackerDraft,
} from "../../app/paperwork/components/nec1099/NecTrackerPage";
import {
  DEFAULT_W9_REQUEST_DRAFT,
  SAMPLE_W9_REQUEST_DRAFT,
  normalizeW9RequestDraft,
  type W9RequestDraft,
} from "../../app/paperwork/components/w9/W9RequestPage";
import { calculateInvoiceTotals } from "./utils/calculations";
import { validateInvoiceData } from "./utils/invoiceValidation";
import { getInitialBlankInvoice, getSampleInvoice } from "./utils/sampleData";
import { getInvoiceTemplateInputs, getReceiptTemplateInputs } from "./advancedTemplateData";
import { calculateReceiptTotals, DEFAULT_RECEIPT_DATA, SAMPLE_RECEIPT_DATA, type ReceiptData } from "./receiptDocument";
import {
  NEC_INTERNAL_REPORT_DISCLAIMER,
  OFFICIAL_W9_URL,
  W9_REQUEST_DISCLAIMER,
  calculateNecSummary,
  createW9Request,
  get1099ReportingRule,
  maskTinReference,
} from "./contractorTaxRules";
import { calculateExpenseTotals } from "./expenseReportRules";
import { calculateMileageSummary } from "./mileageRules";
import {
  DEFAULT_QUARTERLY_TAX_DRAFT,
  QUARTERLY_TAX_RULES_2026,
  SAMPLE_QUARTERLY_TAX_DRAFT,
  calculateQuarterlyTax,
  normalizeQuarterlyTaxDraft,
  type QuarterlyTaxDraft,
} from "./quarterlyTaxRules";
import { DataBridge, DataBridgeKeys } from "./shared/dataBridge";

export interface DocumentAdapter<TDraft> {
  documentType: DocumentType;
  getInitialDraft(): TDraft;
  getSampleDraft(): TDraft;
  readField(draft: TDraft, key: string): unknown;
  writeField(draft: TDraft, key: string, value: unknown): TDraft;
  validate(draft: TDraft, form: TemplateFormConfig): Record<string, string>;
  toPdfInputs(
    draft: TDraft,
    template: AdvancedDocumentTemplate,
    customValues: Record<string, unknown>,
  ): Record<string, string>;
  fileName(draft: TDraft): string;
}

function pdfValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function mergeTemplateInputs(
  sampleData: Record<string, string>,
  builtInValues: Record<string, unknown>,
  customValues: Record<string, unknown>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries({
      ...sampleData,
      ...builtInValues,
      ...customValues,
    }).map(([key, value]) => [key, pdfValue(value)]),
  );
}

function withoutFullTin(sampleData: Record<string, string>) {
  return Object.fromEntries(Object.entries(sampleData).filter(([, value]) => !containsFullTin(value)));
}

function numberInput(value: unknown): number {
  return value === "" ? ("" as unknown as number) : Number(value ?? 0);
}

function documentValues<TDraft>(
  documentType: DocumentType,
  draft: TDraft,
  readField: (draft: TDraft, key: string) => unknown,
) {
  return Object.fromEntries(getDocumentDefinition(documentType).fields.map(({ key }) => [key, readField(draft, key)]));
}

function readPath(value: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (current, part) =>
        current && typeof current === "object" ? (current as Record<string, unknown>)[part] : undefined,
      value,
    );
}

function writePath<TDraft>(draft: TDraft, path: string, value: unknown): TDraft {
  const next = structuredClone(draft) as Record<string, unknown>;
  const parts = path.split(".");
  let target = next;
  for (const part of parts.slice(0, -1)) {
    const nested = target[part];
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) {
      target[part] = {};
    }
    target = target[part] as Record<string, unknown>;
  }
  target[parts.at(-1)!] = value;
  return next as TDraft;
}

function address(value: {
  addressLine1: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}) {
  return [
    value.addressLine1,
    value.addressLine2,
    [value.city, value.state, value.zipCode].filter(Boolean).join(" "),
    value.country,
  ]
    .filter(Boolean)
    .join("\n");
}

const INVOICE_PATHS: Record<string, string> = {
  businessName: "business.name",
  businessEmail: "business.email",
  businessPhone: "business.phone",
  customerName: "client.name",
  customerCompany: "client.company",
  customerEmail: "client.email",
  invoiceNumber: "invoice.invoiceNumber",
  invoiceDate: "invoice.invoiceDate",
  dueDate: "invoice.dueDate",
  paymentTerms: "invoice.paymentTerms",
  poNumber: "invoice.poNumber",
  projectName: "invoice.projectName",
  discountType: "totalsConfig.discountType",
  discountValue: "totalsConfig.discountValue",
  taxRate: "totalsConfig.taxRate",
  shippingFee: "totalsConfig.shippingFee",
  amountPaid: "totalsConfig.amountPaid",
  paymentInstructions: "payment.instructions",
  notes: "notes.notes",
  terms: "notes.terms",
};

function readInvoiceField(draft: InvoiceData, key: string): unknown {
  if (key === "businessAddress") return address(draft.business);
  if (key === "customerAddress") return address(draft.client);
  if (key === "lineItems") {
    return draft.lineItems.map((item) => ({
      ...item,
      rate: item.unitPrice,
    }));
  }
  const path = INVOICE_PATHS[key];
  if (path) return readPath(draft, path);
  const totals = calculateInvoiceTotals(draft);
  const computed: Record<string, number> = {
    subtotal: totals.subtotal,
    discountAmount: totals.discountAmount,
    taxableSubtotal: totals.taxableSubtotal,
    tax: totals.taxAmount,
    total: totals.total,
    balanceDue: totals.balanceDue,
  };
  return computed[key];
}

function writeInvoiceField(draft: InvoiceData, key: string, value: unknown): InvoiceData {
  if (key === "businessAddress") {
    return writePath(draft, "business.addressLine1", value);
  }
  if (key === "customerAddress") {
    return writePath(draft, "client.addressLine1", value);
  }
  if (key === "lineItems" && Array.isArray(value)) {
    return {
      ...draft,
      lineItems: value.map((row, index) => {
        const item = row as Record<string, unknown>;
        return {
          id: typeof item.id === "string" ? item.id : `invoice-item-${index}-${crypto.randomUUID()}`,
          description: String(item.description ?? ""),
          quantity: item.quantity === "" ? ("" as unknown as number) : Number(item.quantity ?? 0),
          unitPrice: item.rate === "" ? ("" as unknown as number) : Number(item.rate ?? 0),
          taxable: Boolean(item.taxable),
        };
      }),
    };
  }
  const path = INVOICE_PATHS[key];
  return path ? writePath(draft, path, value) : draft;
}

export const invoiceAdapter: DocumentAdapter<InvoiceData> = {
  documentType: "invoice",
  getInitialDraft: getInitialBlankInvoice,
  getSampleDraft: getSampleInvoice,
  readField: readInvoiceField,
  writeField: writeInvoiceField,
  validate(draft) {
    const source = validateInvoiceData(draft);
    const keys: Record<string, string> = {
      "business.name": "businessName",
      "business.email": "businessEmail",
      "client.name": "customerName",
      "client.email": "customerEmail",
      "invoice.invoiceNumber": "invoiceNumber",
      "invoice.invoiceDate": "invoiceDate",
      "invoice.dueDate": "dueDate",
    };
    return Object.fromEntries(
      Object.entries(source).map(([key, message]) => [
        keys[key] ?? (key.startsWith("lineItems") ? "lineItems" : key),
        message,
      ]),
    );
  },
  toPdfInputs(draft, template, customValues) {
    const builtInValues = {
      ...getInvoiceTemplateInputs(draft, {}),
      discountType: draft.totalsConfig.discountType,
      discountValue: draft.totalsConfig.discountValue,
      taxRate: draft.totalsConfig.taxRate,
      shippingFee: draft.totalsConfig.shippingFee,
      amountPaid: draft.totalsConfig.amountPaid,
    };
    return mergeTemplateInputs(template.config.sampleData, builtInValues, customValues);
  },
  fileName(draft) {
    const number = draft.invoice.invoiceNumber.trim().replace(/[^a-z0-9_-]+/gi, "-");
    return `invoice-${number || "draft"}.pdf`;
  },
};

const RECEIPT_PATHS: Record<string, string> = {
  businessName: "business.name",
  businessPhone: "business.phone",
  customerName: "customer.name",
  customerEmail: "customer.email",
  receiptNumber: "receiptNumber",
  receiptDate: "receiptDate",
  receiptTime: "receiptTime",
  transactionId: "transactionId",
  relatedInvoiceNumber: "relatedInvoiceNumber",
  discountValue: "discountValue",
  salesTaxRate: "salesTaxRate",
  tip: "tip",
  additionalFee: "additionalFee",
  amountRefunded: "amountRefunded",
  paymentMethod: "paymentMethod",
  paymentNote: "paymentNote",
  notes: "notes",
  thankYouMessage: "thankYouMessage",
};

function readReceiptField(draft: ReceiptData, key: string): unknown {
  if (key === "businessAddress") return address(draft.business);
  if (key === "lineItems") return draft.lineItems;
  const path = RECEIPT_PATHS[key];
  if (path) return readPath(draft, path);
  const totals = calculateReceiptTotals(draft);
  const computed: Record<string, number> = {
    subtotal: totals.subtotal,
    discountAmount: totals.discountAmount,
    tax: totals.taxAmount,
    grossTotal: totals.total,
    total: totals.total,
    netPaid: Math.max(0, totals.total - draft.amountRefunded),
    balanceDue: totals.balanceDue,
  };
  return computed[key];
}

function writeReceiptField(draft: ReceiptData, key: string, value: unknown): ReceiptData {
  if (key === "businessAddress") {
    return writePath(draft, "business.addressLine1", value);
  }
  if (key === "lineItems" && Array.isArray(value)) {
    return {
      ...draft,
      lineItems: value.map((row, index) => {
        const item = row as Record<string, unknown>;
        return {
          id: typeof item.id === "string" ? item.id : `receipt-item-${index}-${crypto.randomUUID()}`,
          description: String(item.description ?? ""),
          quantity: item.quantity === "" ? ("" as unknown as number) : Number(item.quantity ?? 0),
          unitPrice: item.unitPrice === "" ? ("" as unknown as number) : Number(item.unitPrice ?? 0),
          taxable: Boolean(item.taxable),
        };
      }),
    };
  }
  const path = RECEIPT_PATHS[key];
  return path ? writePath(draft, path, value) : draft;
}

export const receiptAdapter: DocumentAdapter<ReceiptData> = {
  documentType: "receipt",
  getInitialDraft() {
    return DataBridge.get<ReceiptData>(DataBridgeKeys.RECEIPT_DRAFT, structuredClone(DEFAULT_RECEIPT_DATA));
  },
  getSampleDraft() {
    return structuredClone(SAMPLE_RECEIPT_DATA);
  },
  readField: readReceiptField,
  writeField: writeReceiptField,
  validate(draft) {
    const errors: Record<string, string> = {};
    if (!draft.business.name.trim()) {
      errors.businessName = "Seller or provider name is required.";
    }
    if (!draft.lineItems.length) {
      errors.lineItems = "Add at least one receipt item.";
    }
    return errors;
  },
  toPdfInputs(draft, template, customValues) {
    const totals = calculateReceiptTotals(draft);
    const builtInValues = {
      ...getReceiptTemplateInputs(draft, totals, {}),
      discountValue: draft.discountValue,
      salesTaxRate: draft.salesTaxRate,
      grossTotal: totals.total,
      netPaid: Math.max(0, totals.total - draft.amountRefunded),
    };
    return mergeTemplateInputs(template.config.sampleData, builtInValues, customValues);
  },
  fileName(draft) {
    const number = draft.receiptNumber.trim().replace(/[^a-z0-9_-]+/gi, "-");
    return `receipt-${number || "draft"}.pdf`;
  },
};

const EXPENSE_PATHS: Record<string, string> = {
  reportNumber: "reportNumber",
  reportTitle: "title",
  reportDate: "reportDate",
  periodStart: "startDate",
  periodEnd: "endDate",
  purpose: "purpose",
  submitterName: "submitter.name",
  submitterEmail: "submitter.email",
  submitterAddress: "submitter.address",
  clientName: "client.name",
  projectName: "projectName",
  department: "department",
  advanceReceived: "advanceReceived",
  evidenceSummary: "evidenceSummary",
  certification: "certification",
  approverName: "approverName",
};

function readExpenseField(draft: ExpenseReportDraft, key: string): unknown {
  if (key === "expenseRows") {
    return draft.expenses.map((row) => ({
      ...row,
      baseAmount: row.amount,
    }));
  }
  if (key === "mileageRows") return draft.mileageRows;
  const path = EXPENSE_PATHS[key];
  if (path) return readPath(draft, path);
  const totals = calculateExpenseTotals(draft.expenses, draft.mileageRows, draft.advanceReceived);
  const computed: Record<string, unknown> = {
    categoryTotals: totals.categoryTotals,
    taxTotal: totals.taxAmount,
    tipTotal: totals.tipAmount,
    mileageReimbursement: totals.mileageTotal,
    reimbursableTotal: totals.reimbursableTotal,
    billableTotal: totals.billableTotal,
    reportTotal: totals.reportTotal,
    amountDue: totals.amountDue,
  };
  return computed[key];
}

function writeExpenseField(draft: ExpenseReportDraft, key: string, value: unknown): ExpenseReportDraft {
  if (key === "expenseRows" && Array.isArray(value)) {
    return normalizeExpenseReportDraft({
      ...draft,
      expenses: value.map((row, index) => {
        const item = row as Record<string, unknown>;
        const previous = draft.expenses[index];
        return {
          id: typeof item.id === "string" ? item.id : `expense-${crypto.randomUUID()}`,
          date: String(item.date ?? ""),
          merchant: String(item.merchant ?? ""),
          category: String(item.category ?? ""),
          description: String(item.description ?? ""),
          paymentMethod: previous?.paymentMethod ?? "Other",
          amount: numberInput(item.baseAmount),
          tax: numberInput(item.tax),
          tip: numberInput(item.tip),
          reimbursable: Boolean(item.reimbursable),
          billable: Boolean(item.billable),
          receiptAttached: previous?.receiptAttached ?? false,
          receiptName: previous?.receiptName,
        };
      }),
    });
  }
  if (key === "mileageRows" && Array.isArray(value)) {
    return normalizeExpenseReportDraft({
      ...draft,
      mileageRows: value.map((row) => {
        const item = row as Record<string, unknown>;
        return {
          id: typeof item.id === "string" ? item.id : `mileage-${crypto.randomUUID()}`,
          date: String(item.date ?? ""),
          purpose: String(item.purpose ?? ""),
          startLocation: String(item.startLocation ?? ""),
          destination: String(item.destination ?? ""),
          miles: numberInput(item.miles),
          rate: numberInput(item.rate),
          amount: numberInput(item.miles) * numberInput(item.rate),
        };
      }),
    });
  }
  const path = EXPENSE_PATHS[key];
  return path ? writePath(draft, path, value) : draft;
}

export const expenseReportAdapter: DocumentAdapter<ExpenseReportDraft> = {
  documentType: "expense-report",
  getInitialDraft() {
    return normalizeExpenseReportDraft(
      DataBridge.get(DataBridgeKeys.EXPENSE_DRAFT, structuredClone(DEFAULT_EXPENSE_REPORT_DRAFT)),
    );
  },
  getSampleDraft() {
    return structuredClone(SAMPLE_EXPENSE_REPORT_DRAFT);
  },
  readField: readExpenseField,
  writeField: writeExpenseField,
  validate(draft) {
    const errors: Record<string, string> = {};
    if (!draft.reportNumber.trim()) {
      errors.reportNumber = "Report number is required.";
    }
    if (!draft.submitter.name.trim()) {
      errors.submitterName = "Submitter name is required.";
    }
    if (!draft.expenses.length) {
      errors.expenseRows = "Add at least one expense.";
    }
    return errors;
  },
  toPdfInputs(draft, template, customValues) {
    return mergeTemplateInputs(
      template.config.sampleData,
      documentValues("expense-report", draft, readExpenseField),
      customValues,
    );
  },
  fileName(draft) {
    const number = draft.reportNumber.trim().replace(/[^a-z0-9_-]+/gi, "-");
    return `expense-report-${number || "draft"}.pdf`;
  },
};

const MILEAGE_PATHS: Record<string, string> = {
  taxYear: "taxYear",
  vehicleDescription: "vehicleModel",
  rateMode: "rateMode",
  customRate: "customRate",
  trips: "trips",
  fuelRecords: "fuelRecords",
  notes: "notes",
};

function readMileageField(draft: MileageLogDraft, key: string): unknown {
  const path = MILEAGE_PATHS[key];
  if (path) return readPath(draft, path);
  const summary = calculateMileageSummary(draft);
  const computed: Record<string, unknown> = {
    effectiveRates: [...new Set(summary.trips.map(({ rate }) => `${rate * 100}¢`))].join(", "),
    totalMiles: summary.totalMiles,
    parkingAndTolls: summary.parkingAndTolls,
    standardMileageDeduction: summary.standardMileageDeduction,
    fuelCost: summary.totalFuelCost,
    fuelEconomy: summary.fuelEconomy,
  };
  return computed[key];
}

function writeMileageField(draft: MileageLogDraft, key: string, value: unknown): MileageLogDraft {
  if (key === "trips" && Array.isArray(value)) {
    return normalizeMileageLogDraft({
      ...draft,
      trips: value.map((row, index) => {
        const item = row as Record<string, unknown>;
        const previous = draft.trips[index];
        return {
          id: typeof item.id === "string" ? item.id : `trip-${crypto.randomUUID()}`,
          date: String(item.date ?? ""),
          purpose: String(item.purpose ?? ""),
          startLocation: String(item.startLocation ?? ""),
          destination: String(item.destination ?? ""),
          startOdometer: previous?.startOdometer,
          endOdometer: previous?.endOdometer,
          miles: numberInput(item.miles),
          parking: numberInput(item.parking),
          tolls: numberInput(item.tolls),
          rate: previous?.rate ?? 0,
          amount: previous?.amount ?? 0,
        };
      }),
    });
  }
  if (key === "fuelRecords" && Array.isArray(value)) {
    return normalizeMileageLogDraft({
      ...draft,
      fuelRecords: value.map((row) => {
        const item = row as Record<string, unknown>;
        return {
          id: typeof item.id === "string" ? item.id : `fuel-${crypto.randomUUID()}`,
          date: String(item.date ?? ""),
          gallons: numberInput(item.gallons),
          cost: numberInput(item.cost),
          merchant: String(item.merchant ?? ""),
          odometer: numberInput(item.odometer),
        };
      }),
    });
  }
  const path = MILEAGE_PATHS[key];
  return path ? writePath(draft, path, value) : draft;
}

export const mileageLogAdapter: DocumentAdapter<MileageLogDraft> = {
  documentType: "mileage-log",
  getInitialDraft() {
    return normalizeMileageLogDraft(
      DataBridge.get(DataBridgeKeys.MILEAGE_DRAFT, structuredClone(DEFAULT_MILEAGE_DRAFT)),
    );
  },
  getSampleDraft() {
    return structuredClone(SAMPLE_MILEAGE_DRAFT);
  },
  readField: readMileageField,
  writeField: writeMileageField,
  validate(draft) {
    const summary = calculateMileageSummary(draft);
    const errors: Record<string, string> = {};
    if (!draft.vehicleModel.trim()) {
      errors.vehicleDescription = "Vehicle description is required.";
    }
    if (!draft.trips.length) errors.trips = "Add at least one business trip.";
    if (summary.errors.length) errors.taxYear = summary.errors.join(" ");
    return errors;
  },
  toPdfInputs(draft, template, customValues) {
    return mergeTemplateInputs(
      template.config.sampleData,
      documentValues("mileage-log", draft, readMileageField),
      customValues,
    );
  },
  fileName(draft) {
    return `mileage-log-${draft.taxYear}.pdf`;
  },
};

const QUARTERLY_TAX_PATHS: Record<string, string> = {
  taxYear: "taxYear",
  filingStatus: "filingStatus",
  grossRevenue: "grossRevenue",
  otherIncome: "otherIncome",
  existingWages: "w2Wages",
  businessDeductions: "businessExpenses",
  otherDeductions: "aboveLineDeductions",
  itemizedDeductions: "itemizedDeductions",
  taxCredits: "taxCredits",
  federalWithholding: "federalWithholding",
  estimatedPaymentsMade: "estimatedPaymentsMade",
  priorYearTax: "priorYearTaxLiability",
  priorYearAgi: "priorYearAdjustedGrossIncome",
  stateTaxRate: "stateTaxRate",
  assumptions: "assumptions",
};

function readQuarterlyTaxField(draft: QuarterlyTaxDraft, key: string): unknown {
  const path = QUARTERLY_TAX_PATHS[key];
  if (path) return readPath(draft, path);
  const result = calculateQuarterlyTax(draft);
  if ("error" in result) {
    return key === "calculationVersion" ? result.error : "";
  }
  const computed: Record<string, unknown> = {
    adjustedGrossIncome: result.adjustedGrossIncome,
    taxableIncome: result.taxableIncome,
    incomeTax: result.federalIncomeTax,
    selfEmploymentTax: result.selfEmploymentTax,
    stateEstimate: result.estimatedStateTax,
    estimatedLiability: result.estimatedTotalLiability,
    requiredAnnualPayment: result.requiredAnnualPayment,
    quarterlyInstallments: result.paymentSchedule.map((payment) => ({
      id: `q${payment.installment}`,
      ...payment,
    })),
    calculationVersion: result.calculationVersion,
  };
  return computed[key];
}

export const quarterlyTaxAdapter: DocumentAdapter<QuarterlyTaxDraft> = {
  documentType: "quarterly-tax-estimator",
  getInitialDraft() {
    return normalizeQuarterlyTaxDraft(
      DataBridge.get(DataBridgeKeys.TAX_DRAFT, structuredClone(DEFAULT_QUARTERLY_TAX_DRAFT)),
    );
  },
  getSampleDraft() {
    return structuredClone(SAMPLE_QUARTERLY_TAX_DRAFT);
  },
  readField: readQuarterlyTaxField,
  writeField(draft, key, value) {
    const path = QUARTERLY_TAX_PATHS[key];
    return path ? writePath(draft, path, value) : draft;
  },
  validate(draft) {
    const result = calculateQuarterlyTax(draft);
    const errors: Record<string, string> = {};
    if ("error" in result) errors.taxYear = result.error;
    return errors;
  },
  toPdfInputs(draft, template, customValues) {
    const values = documentValues("quarterly-tax-estimator", draft, readQuarterlyTaxField);
    values.assumptions = [draft.assumptions, ...QUARTERLY_TAX_RULES_2026.assumptions].filter(Boolean).join("\n");
    return mergeTemplateInputs(template.config.sampleData, values, customValues);
  },
  fileName(draft) {
    return `quarterly-tax-estimate-${draft.taxYear}.pdf`;
  },
};

const W9_PATHS: Record<string, string> = {
  requesterName: "requesterName",
  requesterEmail: "requesterEmail",
  requesterAddress: "requesterAddress",
  requestDate: "requestDate",
  dueDate: "dueDate",
  reportingYear: "reportingYear",
  message: "message",
  secureSubmissionInstructions: "secureSubmissionInstructions",
  supportContact: "supportContact",
  requestStatus: "requestStatus",
};

const W9_VENDOR_PATHS: Record<string, string> = {
  contractorName: "legalName",
  contractorBusinessName: "businessName",
  contractorEmail: "email",
};

function readW9Field(draft: W9RequestDraft, key: string): unknown {
  const path = W9_PATHS[key];
  if (path) return readPath(draft, path);
  const vendorPath = W9_VENDOR_PATHS[key];
  if (vendorPath) return readPath(draft.vendors[0], vendorPath);
  if (key === "officialW9Url") return OFFICIAL_W9_URL;
  if (key === "requestOnlyDisclaimer") return W9_REQUEST_DISCLAIMER;
  return undefined;
}

function writeW9Field(draft: W9RequestDraft, key: string, value: unknown): W9RequestDraft {
  const path = W9_PATHS[key];
  if (path) return writePath(draft, path, value);
  const vendorPath = W9_VENDOR_PATHS[key];
  if (!vendorPath) return draft;
  const vendor = structuredClone(draft.vendors[0] ?? DEFAULT_W9_REQUEST_DRAFT.vendors[0]);
  return {
    ...draft,
    vendors: [writePath(vendor, vendorPath, value), ...draft.vendors.slice(1)],
  };
}

export const w9RequestAdapter: DocumentAdapter<W9RequestDraft> = {
  documentType: "w9-request",
  getInitialDraft() {
    return normalizeW9RequestDraft(
      DataBridge.get("paperworkkit.w9Request.draft", structuredClone(DEFAULT_W9_REQUEST_DRAFT)),
    );
  },
  getSampleDraft() {
    return structuredClone(SAMPLE_W9_REQUEST_DRAFT);
  },
  readField: readW9Field,
  writeField: writeW9Field,
  validate(draft) {
    const errors: Record<string, string> = {};
    const vendor = draft.vendors[0];
    if (!draft.requesterName.trim()) {
      errors.requesterName = "Requester name is required.";
    }
    if (!vendor?.legalName.trim()) {
      errors.contractorName = "Contractor legal name is required.";
    }
    if (!vendor?.email.trim()) {
      errors.contractorEmail = "Contractor email is required.";
    }
    const rule = get1099ReportingRule(draft.reportingYear);
    if ("error" in rule) errors.reportingYear = rule.error;
    return errors;
  },
  toPdfInputs(draft, template, customValues) {
    const vendor = draft.vendors[0] ?? DEFAULT_W9_REQUEST_DRAFT.vendors[0];
    const request = createW9Request({
      reportingYear: draft.reportingYear,
      contractorName: vendor.legalName,
      contractorBusinessName: vendor.businessName,
      secureSubmissionInstructions: draft.secureSubmissionInstructions,
    });
    return mergeTemplateInputs(
      withoutFullTin(template.config.sampleData),
      {
        ...documentValues("w9-request", draft, readW9Field),
        message: `${draft.message}\n\n${request.body}`,
        officialW9Url: request.officialUrl,
        requestOnlyDisclaimer: request.disclaimer,
      },
      customValues,
    );
  },
  fileName(draft) {
    const vendor = draft.vendors[0]?.businessName || draft.vendors[0]?.legalName;
    const slug = vendor?.trim().replace(/[^a-z0-9_-]+/gi, "-");
    return `w9-request-${slug || "draft"}.pdf`;
  },
};

const NEC_PATHS: Record<string, string> = {
  reportingYear: "reportingYear",
  payerName: "payerName",
  payerAddress: "payerAddress",
  payerEmail: "payerEmail",
  filingStatus: "filingStatus",
};

function necVendors() {
  return DataBridge.getW9Vendors();
}

function readNecField(draft: NecTrackerDraft, key: string): unknown {
  const path = NEC_PATHS[key];
  if (path) return readPath(draft, path);
  if (key === "paymentRows") return draft.payments;
  if (key === "recipientAdjustments") {
    return draft.recipientAdjustments.map((adjustment) => ({
      ...adjustment,
      id: adjustment.vendorId,
      occupationCode: adjustment.occupationCodes,
    }));
  }
  const vendors = necVendors();
  const summary = calculateNecSummary(
    draft,
    vendors.map(({ id }) => id),
  );
  const rule = summary.rule;
  const computed: Record<string, unknown> = {
    vendorReferences: vendors.map((vendor) => `${vendor.businessName || vendor.legalName} · ${vendor.w9Status}`),
    maskedTinReferences: draft.recipientAdjustments
      .filter(({ maskedTinReference }) => maskedTinReference)
      .map(({ vendorId, maskedTinReference }) => `${vendorId} · ${maskedTinReference}`),
    reportableTotal: summary.reportablePayments,
    thresholdStatus:
      "error" in rule
        ? rule.error
        : `${summary.aboveThresholdCount} recipient(s) meet the ${rule.year} $${rule.threshold.toLocaleString("en-US")} threshold`,
    box1Summary: summary.reportablePayments,
    box4Summary: summary.boxTotals.federalWithholding,
    stateSummary: `${summary.boxTotals.stateIncome} income · ${summary.boxTotals.stateWithholding} withheld`,
    internalReportDisclaimer: NEC_INTERNAL_REPORT_DISCLAIMER,
  };
  return computed[key];
}

function writeNecField(draft: NecTrackerDraft, key: string, value: unknown): NecTrackerDraft {
  if (key === "paymentRows" && Array.isArray(value)) {
    return normalizeNecTrackerDraft({
      ...draft,
      payments: value.map((row) => {
        const item = row as Record<string, unknown>;
        return {
          id: typeof item.id === "string" ? item.id : `payment-${crypto.randomUUID()}`,
          date: String(item.date ?? ""),
          vendorId: String(item.vendorId ?? ""),
          amount: numberInput(item.amount),
          paymentMethod: String(item.paymentMethod || "Other") as NecTrackerDraft["payments"][number]["paymentMethod"],
          category: String(item.category || "Other") as NecTrackerDraft["payments"][number]["category"],
          description: String(item.description ?? ""),
          includeIn1099: Boolean(item.includeIn1099),
        };
      }),
    });
  }
  if (key === "recipientAdjustments" && Array.isArray(value)) {
    return normalizeNecTrackerDraft({
      ...draft,
      recipientAdjustments: value.map((row) => {
        const item = row as Record<string, unknown>;
        return {
          vendorId: String(item.vendorId ?? ""),
          cashTips: numberInput(item.cashTips),
          occupationCodes: String(item.occupationCode ?? item.occupationCodes ?? ""),
          qualifiedOvertime: numberInput(item.qualifiedOvertime),
          federalWithholding: numberInput(item.federalWithholding),
          state: String(item.state ?? ""),
          stateIncome: numberInput(item.stateIncome),
          stateWithholding: numberInput(item.stateWithholding),
          maskedTinReference: maskTinReference(String(item.maskedTinReference ?? "")),
        };
      }),
    });
  }
  const path = NEC_PATHS[key];
  return path ? writePath(draft, path, value) : draft;
}

export const nec1099Adapter: DocumentAdapter<NecTrackerDraft> = {
  documentType: "1099-nec-tracker",
  getInitialDraft() {
    return normalizeNecTrackerDraft(
      DataBridge.get(DataBridgeKeys.NEC_DRAFT, structuredClone(DEFAULT_NEC_TRACKER_DRAFT)),
    );
  },
  getSampleDraft() {
    return structuredClone(SAMPLE_NEC_TRACKER_DRAFT);
  },
  readField: readNecField,
  writeField: writeNecField,
  validate(draft) {
    const summary = calculateNecSummary(
      draft,
      necVendors().map(({ id }) => id),
    );
    const errors: Record<string, string> = {};
    if (!draft.payerName.trim()) errors.payerName = "Payer name is required.";
    if (!draft.payments.length) errors.paymentRows = "Add at least one payment.";
    if (summary.issues.length) {
      errors.paymentRows = summary.issues.join(" ");
    }
    return errors;
  },
  toPdfInputs(draft, template, customValues) {
    return mergeTemplateInputs(
      withoutFullTin(template.config.sampleData),
      documentValues("1099-nec-tracker", draft, readNecField),
      customValues,
    );
  },
  fileName(draft) {
    return `1099-nec-tracker-${draft.reportingYear}.pdf`;
  },
};
