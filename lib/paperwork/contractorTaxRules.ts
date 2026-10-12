import { isCalendarDate, isNonnegativeAmount } from "./documentValidation";
export const OFFICIAL_W9_URL = "https://www.irs.gov/pub/irs-pdf/fw9.pdf";
export const W9_REQUEST_DISCLAIMER =
  "This is a W-9 request only. Do not send a TIN, SSN, EIN, certification, or signature through this tool.";
export const NEC_INTERNAL_REPORT_DISCLAIMER =
  "This is an internal tracking report, not a fileable Form 1099-NEC or Copy A. Do not submit it to the IRS.";

export const W9_REQUEST_DISCLAIMER_MESSAGE = { key: "w9.requestDisclaimer" } as const;
export const NEC_INTERNAL_REPORT_DISCLAIMER_MESSAGE = { key: "nec.reportDisclaimer" } as const;

type ContractorIssueMessage = {
  key: string;
  values: Record<string, string | number>;
};

export interface RecipientAnnualAdjustment {
  vendorId: string;
  cashTips: number;
  occupationCodes: string;
  qualifiedOvertime: number;
  federalWithholding: number;
  state: string;
  stateIncome: number;
  stateWithholding: number;
  maskedTinReference: string;
}

export interface NecRulePayment {
  vendorId: string;
  amount: number;
  includeIn1099: boolean;
  date?: string;
  paymentMethod?: string;
  category?: string;
}

export interface NecRuleDraft {
  reportingYear: number;
  payments: NecRulePayment[];
  recipientAdjustments: RecipientAnnualAdjustment[];
}

export interface W9RequestInput {
  reportingYear: number;
  contractorName: string;
  contractorBusinessName?: string;
  secureSubmissionInstructions: string;
}

export function get1099ReportingRule(
  year: number,
):
  | { supported: true; year: number; threshold: number }
  | { supported: false; year: number; error: string; errorMessage: ContractorIssueMessage } {
  if (Number.isInteger(year) && year >= 2020 && year <= 2025) {
    return { supported: true, year, threshold: 600 };
  }
  if (year === 2026) {
    return { supported: true, year, threshold: 2000 };
  }
  return {
    supported: false,
    year,
    error: `1099-NEC rules update required for ${year}.`,
    errorMessage: { key: "nec.validation.rulesUpdateRequired", values: { year } },
  };
}

export function maskTinReference(value: string): string {
  const lastFour = value.replace(/\D/g, "").slice(-4);
  return lastFour ? `•••• ${lastFour}` : "";
}

export function createEmptyRecipientAdjustment(vendorId: string): RecipientAnnualAdjustment {
  return {
    vendorId,
    cashTips: 0,
    occupationCodes: "",
    qualifiedOvertime: 0,
    federalWithholding: 0,
    state: "",
    stateIncome: 0,
    stateWithholding: 0,
    maskedTinReference: "",
  };
}

export function calculateNecSummary(
  draft: NecRuleDraft,
  knownVendorIds: readonly string[],
  vendors: readonly { id: string; entityType: string }[] = [],
) {
  const knownVendors = new Set(knownVendorIds);
  const vendorTotals: Record<string, number> = {};
  let totalPayments = 0;
  let reportablePayments = 0;

  const validationIssues: string[] = [];
  const validationKeys: Record<string, string> = {
    "Payment amounts must be finite and nonnegative.": "nec.validation.paymentAmount",
    "Payment date must be a real date within the reporting year.": "nec.validation.paymentDate",
    "Review payment network eligibility: qualifying third-party network payments belong to processor reporting, not NEC. Record direct payments as ACH/check/cash when accurate.":
      "nec.validation.networkReview",
    "Select a supported service category or exclude this payment pending preparer review.":
      "nec.validation.categoryReview",
    "Each payment needs a valid date in the reporting year, a description, payment method and category.":
      "nec.validation.completePayment",
  };
  const warnings: string[] = [];
  const warningKeys: Record<string, string> = {
    "Card payments are excluded from NEC compensation; the payment processor handles applicable reporting.":
      "nec.warnings.cardExcluded",
    "Rent is excluded from NEC compensation; review Form 1099-MISC.": "nec.warnings.rentExcluded",
    "Corporation payments are generally excluded; review exceptions with your preparer.":
      "nec.warnings.corporationExcluded",
    "Confirm the contractor's W-9 tax classification. LLC alone does not establish NEC eligibility.":
      "nec.warnings.classificationReview",
    "Backup withholding requires filing review even when compensation is below the reporting threshold.":
      "nec.warnings.backupWithholding",
  };
  draft.payments.forEach((payment) => {
    const amount = payment.amount;
    if (!isNonnegativeAmount(amount)) {
      validationIssues.push("Payment amounts must be finite and nonnegative.");
      return;
    }
    // Older internal summaries lack eligibility metadata. Keep them readable; full draft exports require it.
    if (
      payment.date !== undefined &&
      (!isCalendarDate(payment.date) || !payment.date.startsWith(`${draft.reportingYear}-`))
    ) {
      validationIssues.push("Payment date must be a real date within the reporting year.");
      return;
    }
    totalPayments += amount;
    if (payment.includeIn1099) {
      if (payment.paymentMethod === "Card") {
        warnings.push(
          "Card payments are excluded from NEC compensation; the payment processor handles applicable reporting.",
        );
        return;
      }
      if (["PayPal", "Venmo", "Other"].includes(payment.paymentMethod || "")) {
        validationIssues.push(
          "Review payment network eligibility: qualifying third-party network payments belong to processor reporting, not NEC. Record direct payments as ACH/check/cash when accurate.",
        );
        return;
      }
      if (payment.category === "Rent") {
        warnings.push("Rent is excluded from NEC compensation; review Form 1099-MISC.");
        return;
      }
      if (payment.category === "Other") {
        validationIssues.push("Select a supported service category or exclude this payment pending preparer review.");
        return;
      }
      const entity = vendors.find((vendor) => vendor.id === payment.vendorId)?.entityType;
      if (entity === "Corporation" && payment.category !== "Legal") {
        warnings.push("Corporation payments are generally excluded; review exceptions with your preparer.");
        return;
      }
      if (entity === "Unknown" || entity === "LLC") {
        warnings.push("Confirm the contractor's W-9 tax classification. LLC alone does not establish NEC eligibility.");
      }

      reportablePayments += amount;
      vendorTotals[payment.vendorId] = (vendorTotals[payment.vendorId] || 0) + amount;
    }
  });

  const missingVendorIds = [
    ...new Set(draft.payments.map((payment) => payment.vendorId).filter((vendorId) => !knownVendors.has(vendorId))),
  ];
  const rule = get1099ReportingRule(draft.reportingYear);
  const issueEntries: Array<{ text: string; message: ContractorIssueMessage }> = missingVendorIds.map((vendorId) => ({
    text: `Payment references missing vendor "${vendorId}".`,
    message: { key: "nec.validation.missingVendor", values: { vendorId } },
  }));
  if ("error" in rule) {
    issueEntries.unshift({ text: rule.error, message: rule.errorMessage });
  }

  validationIssues.forEach((text) =>
    issueEntries.push({
      text,
      message: { key: validationKeys[text] || "nec.validation.eligibilityReview", values: { detail: text } },
    }),
  );
  const filingRequiredVendorIds = new Set<string>(
    rule.supported ? Object.keys(vendorTotals).filter((id) => vendorTotals[id] >= rule.threshold) : [],
  );
  for (const adjustment of draft.recipientAdjustments) {
    if (
      ![
        adjustment.cashTips,
        adjustment.qualifiedOvertime,
        adjustment.federalWithholding,
        adjustment.stateIncome,
        adjustment.stateWithholding,
      ].every(isNonnegativeAmount) ||
      !knownVendors.has(adjustment.vendorId)
    ) {
      issueEntries.push({
        text: "Recipient adjustments require an existing contractor and finite nonnegative amounts.",
        message: { key: "nec.validation.invalidAdjustments", values: {} },
      });
    }
    if (adjustment.federalWithholding > 0) {
      filingRequiredVendorIds.add(adjustment.vendorId);
      warnings.push(
        "Backup withholding requires filing review even when compensation is below the reporting threshold.",
      );
    }
  }
  const boxTotals = draft.recipientAdjustments.reduce(
    (totals, adjustment) => ({
      cashTips: totals.cashTips + Number(adjustment.cashTips || 0),
      qualifiedOvertime: totals.qualifiedOvertime + Number(adjustment.qualifiedOvertime || 0),
      federalWithholding: totals.federalWithholding + Number(adjustment.federalWithholding || 0),
      stateIncome: totals.stateIncome + Number(adjustment.stateIncome || 0),
      stateWithholding: totals.stateWithholding + Number(adjustment.stateWithholding || 0),
    }),
    {
      cashTips: 0,
      qualifiedOvertime: 0,
      federalWithholding: 0,
      stateIncome: 0,
      stateWithholding: 0,
    },
  );

  return {
    rule,
    warnings: [...new Set(warnings)],
    warningMessages: [...new Set(warnings)].map((text) => ({ key: warningKeys[text], values: {} })),
    filingRequiredVendorIds: [...filingRequiredVendorIds],
    issues: issueEntries.map((issue) => issue.text),
    issueMessages: issueEntries.map((issue) => issue.message),
    missingVendorIds,
    vendorTotals,
    totalPayments,
    reportablePayments,
    contractorsCount: Object.keys(vendorTotals).length,
    aboveThresholdCount: rule.supported
      ? Object.values(vendorTotals).filter((total) => total >= rule.threshold).length
      : 0,
    boxTotals,
  };
}

export function createW9Request(input: W9RequestInput) {
  const rule = get1099ReportingRule(input.reportingYear);
  const reportingLanguage =
    "error" in rule
      ? `${rule.error} Confirm the current reporting threshold before sending this request.`
      : `For ${input.reportingYear}, the general Form 1099-NEC reporting threshold is $${rule.threshold.toLocaleString("en-US")}.`;
  const secureInstructions =
    input.secureSubmissionInstructions.trim() || "Use your organization's approved secure document portal.";

  return {
    subject: `W-9 request for ${input.contractorBusinessName || input.contractorName}`,
    body: `Hello ${input.contractorName || "Contractor"},

Please complete the current IRS Form W-9 from the official IRS source:
${OFFICIAL_W9_URL}

Return the completed form using this secure method:
${secureInstructions}

${reportingLanguage}

${W9_REQUEST_DISCLAIMER}`,
    disclaimer: W9_REQUEST_DISCLAIMER,
    officialUrl: OFFICIAL_W9_URL,
  };
}
