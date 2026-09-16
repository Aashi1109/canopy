export const OFFICIAL_W9_URL = "https://www.irs.gov/pub/irs-pdf/fw9.pdf";
export const W9_REQUEST_DISCLAIMER =
  "This is a W-9 request only. Do not send a TIN, SSN, EIN, certification, or signature through this tool.";
export const NEC_INTERNAL_REPORT_DISCLAIMER =
  "This is an internal tracking report, not a fileable Form 1099-NEC or Copy A. Do not submit it to the IRS.";

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
): { supported: true; year: number; threshold: number } | { supported: false; year: number; error: string } {
  if (year <= 2025) {
    return { supported: true, year, threshold: 600 };
  }
  if (year === 2026) {
    return { supported: true, year, threshold: 2000 };
  }
  return {
    supported: false,
    year,
    error: `1099-NEC rules update required for ${year}.`,
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

export function calculateNecSummary(draft: NecRuleDraft, knownVendorIds: readonly string[]) {
  const knownVendors = new Set(knownVendorIds);
  const vendorTotals: Record<string, number> = {};
  let totalPayments = 0;
  let reportablePayments = 0;

  draft.payments.forEach((payment) => {
    const amount = Number(payment.amount || 0);
    totalPayments += amount;
    if (payment.includeIn1099) {
      reportablePayments += amount;
      vendorTotals[payment.vendorId] = (vendorTotals[payment.vendorId] || 0) + amount;
    }
  });

  const missingVendorIds = [
    ...new Set(draft.payments.map((payment) => payment.vendorId).filter((vendorId) => !knownVendors.has(vendorId))),
  ];
  const rule = get1099ReportingRule(draft.reportingYear);
  const issues = missingVendorIds.map((vendorId) => `Payment references missing vendor "${vendorId}".`);
  if ("error" in rule) {
    issues.unshift(rule.error);
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
    issues,
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
