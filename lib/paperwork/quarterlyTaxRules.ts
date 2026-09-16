export type FilingStatus = "single" | "married_joint" | "married_separate" | "head_household";

export interface QuarterlyTaxDraft {
  taxYear: number;
  filingStatus: FilingStatus;
  grossRevenue: number;
  businessExpenses: number;
  w2Wages: number;
  otherIncome: number;
  aboveLineDeductions: number;
  itemizedDeductions: number;
  taxCredits: number;
  federalWithholding: number;
  estimatedPaymentsMade: number;
  priorYearTaxLiability: number;
  priorYearAdjustedGrossIncome: number;
  stateTaxRate: number;
  assumptions: string;
}

interface TaxBracket {
  upper: number;
  rate: number;
}

export const QUARTERLY_TAX_RULES_2026 = {
  version: "2026.1",
  taxYear: 2026,
  standardDeductions: {
    single: 16100,
    married_joint: 32200,
    married_separate: 16100,
    head_household: 24150,
  },
  brackets: {
    single: [
      { upper: 12400, rate: 0.1 },
      { upper: 50400, rate: 0.12 },
      { upper: 105700, rate: 0.22 },
      { upper: 201775, rate: 0.24 },
      { upper: 256225, rate: 0.32 },
      { upper: 640600, rate: 0.35 },
      { upper: Infinity, rate: 0.37 },
    ],
    married_joint: [
      { upper: 24800, rate: 0.1 },
      { upper: 100800, rate: 0.12 },
      { upper: 211400, rate: 0.22 },
      { upper: 403550, rate: 0.24 },
      { upper: 512450, rate: 0.32 },
      { upper: 768700, rate: 0.35 },
      { upper: Infinity, rate: 0.37 },
    ],
    married_separate: [
      { upper: 12400, rate: 0.1 },
      { upper: 50400, rate: 0.12 },
      { upper: 105700, rate: 0.22 },
      { upper: 201775, rate: 0.24 },
      { upper: 256225, rate: 0.32 },
      { upper: 384350, rate: 0.35 },
      { upper: Infinity, rate: 0.37 },
    ],
    head_household: [
      { upper: 17700, rate: 0.1 },
      { upper: 67450, rate: 0.12 },
      { upper: 105700, rate: 0.22 },
      { upper: 201750, rate: 0.24 },
      { upper: 256200, rate: 0.32 },
      { upper: 640600, rate: 0.35 },
      { upper: Infinity, rate: 0.37 },
    ],
  } satisfies Record<FilingStatus, TaxBracket[]>,
  socialSecurityWageCap: 184500,
  additionalMedicareThresholds: {
    single: 200000,
    married_joint: 250000,
    married_separate: 125000,
    head_household: 200000,
  },
  paymentDates: ["2026-04-15", "2026-06-15", "2026-09-15", "2027-01-15"],
  assumptions: [
    "Calendar-year taxpayer using equal quarterly installments.",
    "Federal estimate uses the 2026 standard deduction unless itemized deductions are higher.",
    "Nonrefundable credits reduce federal income tax, not self-employment tax.",
    "No federal installments are suggested when estimated tax after withholding is under $1,000.",
    "State tax is a separate simple estimate and is not included in the federal payment schedule.",
    "This summary is an estimate only and is not an official payment voucher.",
  ],
} as const;

export const DEFAULT_QUARTERLY_TAX_DRAFT: QuarterlyTaxDraft = {
  taxYear: 2026,
  filingStatus: "single",
  grossRevenue: 85000,
  businessExpenses: 12500,
  w2Wages: 0,
  otherIncome: 0,
  aboveLineDeductions: 0,
  itemizedDeductions: 0,
  taxCredits: 0,
  federalWithholding: 0,
  estimatedPaymentsMade: 0,
  priorYearTaxLiability: 0,
  priorYearAdjustedGrossIncome: 0,
  stateTaxRate: 4.5,
  assumptions: "",
};

export const SAMPLE_QUARTERLY_TAX_DRAFT: QuarterlyTaxDraft = {
  ...DEFAULT_QUARTERLY_TAX_DRAFT,
  grossRevenue: 120000,
  businessExpenses: 24000,
  w2Wages: 18000,
  otherIncome: 2500,
  aboveLineDeductions: 3000,
  taxCredits: 750,
  federalWithholding: 4000,
  estimatedPaymentsMade: 2000,
  priorYearTaxLiability: 14500,
  priorYearAdjustedGrossIncome: 118000,
  assumptions: "Income is expected to be earned evenly through the year.",
};

export function normalizeQuarterlyTaxDraft(draft: Partial<QuarterlyTaxDraft>): QuarterlyTaxDraft {
  const filingStatus = ["single", "married_joint", "married_separate", "head_household"].includes(
    draft.filingStatus || "",
  )
    ? (draft.filingStatus as FilingStatus)
    : DEFAULT_QUARTERLY_TAX_DRAFT.filingStatus;
  return {
    ...DEFAULT_QUARTERLY_TAX_DRAFT,
    ...draft,
    filingStatus,
    taxYear: Number(draft.taxYear || DEFAULT_QUARTERLY_TAX_DRAFT.taxYear),
  };
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function calculateProgressiveTax(taxableIncome: number, brackets: readonly TaxBracket[]): number {
  let tax = 0;
  let lower = 0;
  for (const bracket of brackets) {
    const amount = Math.min(taxableIncome, bracket.upper) - lower;
    if (amount > 0) {
      tax += amount * bracket.rate;
    }
    if (taxableIncome <= bracket.upper) {
      break;
    }
    lower = bracket.upper;
  }
  return money(tax);
}

export function calculateQuarterlyTax(draft: QuarterlyTaxDraft):
  | { ok: false; error: string }
  | {
      ok: true;
      calculationVersion: string;
      netSelfEmploymentProfit: number;
      selfEmploymentTax: number;
      adjustedGrossIncome: number;
      deductionValue: number;
      taxableIncome: number;
      federalIncomeTax: number;
      estimatedFederalLiability: number;
      estimatedStateTax: number;
      estimatedTotalLiability: number;
      currentYearSafeHarbor: number;
      priorYearSafeHarbor: number | null;
      requiredAnnualPayment: number;
      quarterlyPayment: number;
      paymentSchedule: Array<{
        installment: number;
        dueDate: string;
        amount: number;
      }>;
      assumptions: readonly string[];
    } {
  const rules =
    draft.taxYear === QUARTERLY_TAX_RULES_2026.taxYear ? QUARTERLY_TAX_RULES_2026 : null;
  if (!rules) {
    return {
      ok: false,
      error: `Quarterly tax rules update required for ${draft.taxYear}.`,
    };
  }

  const nonnegative = (value: number) => Math.max(0, Number(value || 0));
  const netSelfEmploymentProfit = money(
    Math.max(0, nonnegative(draft.grossRevenue) - nonnegative(draft.businessExpenses)),
  );
  const netSelfEmploymentEarnings = netSelfEmploymentProfit * 0.9235;
  const remainingSocialSecurityBase = Math.max(
    0,
    rules.socialSecurityWageCap - nonnegative(draft.w2Wages),
  );
  const socialSecurityTax =
    Math.min(netSelfEmploymentEarnings, remainingSocialSecurityBase) * 0.124;
  const medicareTax = netSelfEmploymentEarnings * 0.029;
  const additionalMedicareTax =
    Math.max(
      0,
      nonnegative(draft.w2Wages) +
        netSelfEmploymentEarnings -
        rules.additionalMedicareThresholds[draft.filingStatus],
    ) * 0.009;
  const selfEmploymentTax = money(socialSecurityTax + medicareTax + additionalMedicareTax);
  const deductibleSelfEmploymentTax = (socialSecurityTax + medicareTax) / 2;
  const adjustedGrossIncome = money(
    Math.max(
      0,
      netSelfEmploymentProfit +
        nonnegative(draft.w2Wages) +
        nonnegative(draft.otherIncome) -
        deductibleSelfEmploymentTax -
        nonnegative(draft.aboveLineDeductions),
    ),
  );
  const deductionValue = Math.max(
    rules.standardDeductions[draft.filingStatus],
    nonnegative(draft.itemizedDeductions),
  );
  const taxableIncome = money(Math.max(0, adjustedGrossIncome - deductionValue));
  const federalIncomeTax = calculateProgressiveTax(
    taxableIncome,
    rules.brackets[draft.filingStatus],
  );
  const incomeTaxAfterCredits = money(
    Math.max(0, federalIncomeTax - nonnegative(draft.taxCredits)),
  );
  const estimatedFederalLiability = money(incomeTaxAfterCredits + selfEmploymentTax);
  const estimatedStateTax = money(taxableIncome * (nonnegative(draft.stateTaxRate) / 100));
  const estimatedTotalLiability = money(estimatedFederalLiability + estimatedStateTax);
  const currentYearSafeHarbor = money(estimatedFederalLiability * 0.9);
  const highIncomeThreshold = draft.filingStatus === "married_separate" ? 75000 : 150000;
  const priorYearSafeHarbor =
    nonnegative(draft.priorYearTaxLiability) > 0
      ? money(
          nonnegative(draft.priorYearTaxLiability) *
            (nonnegative(draft.priorYearAdjustedGrossIncome) > highIncomeThreshold ? 1.1 : 1),
        )
      : null;
  const safeHarborTarget =
    priorYearSafeHarbor === null
      ? currentYearSafeHarbor
      : Math.min(currentYearSafeHarbor, priorYearSafeHarbor);
  const estimatedTaxAfterWithholding = money(
    Math.max(0, estimatedFederalLiability - nonnegative(draft.federalWithholding)),
  );
  const requiredAnnualPayment =
    estimatedTaxAfterWithholding < 1000
      ? 0
      : money(
          Math.max(
            0,
            safeHarborTarget -
              nonnegative(draft.federalWithholding) -
              nonnegative(draft.estimatedPaymentsMade),
          ),
        );
  const quarterlyPayment = money(requiredAnnualPayment / 4);

  return {
    ok: true,
    calculationVersion: rules.version,
    netSelfEmploymentProfit,
    selfEmploymentTax,
    adjustedGrossIncome,
    deductionValue,
    taxableIncome,
    federalIncomeTax,
    estimatedFederalLiability,
    estimatedStateTax,
    estimatedTotalLiability,
    currentYearSafeHarbor,
    priorYearSafeHarbor,
    requiredAnnualPayment,
    quarterlyPayment,
    paymentSchedule: rules.paymentDates.map((dueDate, index) => ({
      installment: index + 1,
      dueDate,
      amount:
        index === rules.paymentDates.length - 1
          ? money(requiredAnnualPayment - quarterlyPayment * (rules.paymentDates.length - 1))
          : quarterlyPayment,
    })),
    assumptions: rules.assumptions,
  };
}
