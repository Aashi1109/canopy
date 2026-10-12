import { isCalendarDate } from "./documentValidation";

export class PaperworkStorageValidationError extends Error {
  readonly status = 400;
}

const COLLECTIONS: Readonly<Record<string, readonly string[]>> = {
  paperwork_kit_invoice_draft: ["lineItems"],
  "paperworkkit.receipt.draft": ["lineItems"],
  "paperworkkit.expenseReport.draft": ["expenses", "mileageRows"],
  "paperworkkit.mileageLog.draft": ["trips", "fuelRecords"],
  "paperworkkit.1099Tracker.draft": ["payments", "recipientAdjustments"],
  "paperworkkit.w9Request.draft": ["vendors"],
  "paperworkkit.taxEstimator.draft": [],
  "paperworkkit.taxEstimator.summary": ["assumptions", "paymentSchedule"],
  "paperworkkit.1099Tracker.summary": ["issues"],
};
const NUMBER_FIELDS = new Set(
  "quantity unitPrice discountValue taxRate shippingFee amountPaid amountReceived salesTaxRate tip additionalFee amountRefunded advanceReceived amount tax miles rate parking tolls startOdometer endOdometer odometer customRate grossRevenue businessExpenses w2Wages otherIncome aboveLineDeductions itemizedDeductions taxCredits federalWithholding estimatedPaymentsMade priorYearTaxLiability priorYearAdjustedGrossIncome stateTaxRate cashTips qualifiedOvertime federalWithholding stateIncome stateWithholding total balanceDue totalPaid totalAmount reimbursableAmount totalMiles estimatedTotalTax suggestedQuarterly totalPayments contractorsCount aboveThresholdCount".split(
    " ",
  ),
);
const BOOLEAN_FIELDS = new Set(
  "taxable reimbursable billable receiptAttached certification roundTrip includeIn1099 priorYearTaxKnown priorYearCoveredFullYear priorYearResidentAllYear".split(
    " ",
  ),
);
const STRING_FIELDS = new Set(
  "id name contactName company email phone website addressLine1 addressLine2 city state zipCode country logo taxId invoiceNumber paymentTerms currency poNumber projectName description taxLabel instructions lateFeeNote thankYouNote terms template receiptNumber receiptTime relatedInvoiceNumber transactionId salesTaxLabel paymentMethod paymentNote receivedBy thankYouMessage reportNumber title purpose department address category receiptName merchant evidenceSummary approverName vehicleModel startLocation destination assumptions requesterName requesterEmail requesterAddress message secureSubmissionInstructions supportContact requestStatus legalName businessName vendorId invoiceReference occupationCodes maskedTinReference clientName customerName dateRange filingStatus".split(
    " ",
  ),
);
const TEXT_ARRAY_FIELDS = new Set(["methods", "assumptions", "issues"]);
const OBJECT_FIELDS = new Set([
  "business",
  "client",
  "customer",
  "invoice",
  "totalsConfig",
  "payment",
  "notes",
  "submitter",
]);
const DATE_FIELDS = new Set([
  "date",
  "invoiceDate",
  "dueDate",
  "issueDate",
  "paymentDate",
  "receiptDate",
  "reportDate",
  "startDate",
  "endDate",
  "requestDate",
]);
const ENUMS: Readonly<Record<string, readonly string[]>> = {
  discountType: ["none", "percent", "fixed"],
  rateMode: ["irs-standard", "custom"],
  filingStatus: ["single", "married_joint", "married_separate", "head_household"],
  paymentStatus: ["Unpaid", "Paid", "Partially Paid", "Refunded"],
  receiptType: ["Service", "Product", "Rent", "Contractor", "Deposit", "Refund"],
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const invalid = (field: string): never => {
  throw new PaperworkStorageValidationError(`Invalid saved draft field: ${field}.`);
};

// Drafts can be incomplete while editing. Validate their contracts, not completion.
export function validatePaperworkStorageValue(key: string, value: unknown): void {
  if (!isRecord(value)) throw new PaperworkStorageValidationError("Invalid saved draft field: document.");
  const collections = COLLECTIONS[key];
  const isDraft = key.endsWith(".draft") || key === "paperwork_kit_invoice_draft";
  if (!collections && !key.endsWith(".summary")) invalid("key");
  function inspect(record: Record<string, unknown>, depth: number): void {
    if (depth > 5 || Object.keys(record).length > 200) invalid("document");
    for (const [field, item] of Object.entries(record)) {
      if (item === undefined) continue;
      if (
        STRING_FIELDS.has(field) &&
        typeof item !== "string" &&
        !(field === "assumptions" && key === "paperworkkit.taxEstimator.summary" && Array.isArray(item))
      )
        invalid(field);
      if (
        NUMBER_FIELDS.has(field) &&
        !(isDraft && item === "") &&
        (typeof item !== "number" || !Number.isFinite(item) || item < 0 || item > 1e12)
      )
        invalid(field);
      if (BOOLEAN_FIELDS.has(field) && typeof item !== "boolean") invalid(field);
      if (
        ["taxYear", "reportingYear", "year"].includes(field) &&
        !(isDraft && item === "") &&
        (typeof item !== "number" || !Number.isInteger(item) || item < 1900 || item > 9999)
      )
        invalid(field);
      if (
        ENUMS[field] &&
        !(field === "filingStatus" && key === "paperworkkit.1099Tracker.draft") &&
        (typeof item !== "string" || !ENUMS[field].includes(item))
      )
        invalid(field);
      if (DATE_FIELDS.has(field) && (typeof item !== "string" || (item !== "" && !isCalendarDate(item))))
        invalid(field);
      if (OBJECT_FIELDS.has(field) && !(field === "notes" && typeof item === "string") && !isRecord(item))
        invalid(field);
      if (Array.isArray(item)) {
        if (item.length > 1000) invalid(field);
        if (TEXT_ARRAY_FIELDS.has(field)) {
          if (field !== "methods" && !collections?.includes(field)) invalid(field);
          if (!item.every((entry) => typeof entry === "string" && entry.length <= 10_000)) invalid(field);
        } else {
          if (!collections?.includes(field) || !item.every(isRecord)) invalid(field);
          item.forEach((entry) => inspect(entry, depth + 1));
        }
      } else if (isRecord(item)) inspect(item, depth + 1);
      else if (typeof item === "string") {
        if (item.length > (field === "logo" ? 2_500_000 : 10_000)) invalid(field);
      } else if (typeof item === "number") {
        if (!Number.isFinite(item) || Math.abs(item) > 1e12) invalid(field);
      } else if (typeof item !== "boolean" && item !== null) invalid(field);
    }
  }
  for (const field of collections ?? []) if (field in value && !Array.isArray(value[field])) invalid(field);
  inspect(value, 0);
}
