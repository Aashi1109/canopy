import { expect, test } from "vitest";
import { calculateMileageSummary, getMileageRate } from "../lib/paperwork/mileageRules.ts";
import { calculateExpenseTotals, normalizeExpenseRows } from "../lib/paperwork/expenseReportRules.ts";
import {
  calculateNecSummary,
  createEmptyRecipientAdjustment,
  createW9Request,
  get1099ReportingRule,
  maskTinReference,
} from "../lib/paperwork/contractorTaxRules.ts";
import {
  DEFAULT_QUARTERLY_TAX_DRAFT,
  QUARTERLY_TAX_RULES_2026,
  calculateQuarterlyTax,
  normalizeQuarterlyTaxDraft,
} from "../lib/paperwork/quarterlyTaxRules.ts";

test("mileage uses the 2026 effective-date schedule", () => {
  expect(getMileageRate("irs-standard", 2026, "2026-06-30", 0)).toBe(0.725);
  expect(getMileageRate("irs-standard", 2026, "2026-07-01", 0)).toBe(0.76);
  expect(getMileageRate("custom", 2026, "2026-07-01", 0.91)).toBe(0.91);
});

test("mileage adds parking and tolls but excludes fuel from the deduction", () => {
  const summary = calculateMileageSummary({
    taxYear: 2026,
    rateMode: "irs-standard",
    customRate: 0,
    trips: [
      { id: "a", date: "2026-06-30", miles: 10, parking: 1, tolls: 0 },
      { id: "b", date: "2026-07-01", miles: 5, parking: 0, tolls: 2 },
    ],
    fuelRecords: [{ cost: 999, gallons: 10, odometer: 100 }],
  });

  expect(summary.errors).toEqual([]);
  expect(summary.standardMileageDeduction).toBe(11.05);
  expect(summary.parkingAndTolls).toBe(3);
  expect(summary.totalDeduction).toBe(14.05);
  expect(summary.totalFuelCost).toBe(999);
});

test("unsupported mileage years fail instead of using a stale rate", () => {
  expect(() => getMileageRate("irs-standard", 2027, "2027-01-01", 0)).toThrow(/rules update required/i);
  expect(() => getMileageRate("custom", 2026, "2026-01-01", -1)).toThrow(/custom mileage rate/i);
  expect(() => getMileageRate("irs-standard", 2026, "2025-12-31", 0)).toThrow(/within tax year/i);
});

test("mileage reports invalid trip dates and computes MPG from later fills", () => {
  const summary = calculateMileageSummary({
    taxYear: 2026,
    rateMode: "irs-standard",
    customRate: 0,
    trips: [{ id: "bad", date: "", miles: 10 }],
    fuelRecords: [
      { cost: 30, gallons: 8, odometer: 1000 },
      { cost: 40, gallons: 10, odometer: 1300 },
    ],
  });

  expect(summary.errors[0]).toMatch(/within tax year/i);
  expect(summary.trips[0].amount).toBe(0);
  expect(summary.fuelEconomy).toBe(30);
});

test("expense totals make base, tax, tip, mileage, and advance semantics explicit", () => {
  const rows = normalizeExpenseRows([
    {
      id: "a",
      amount: 100,
      tax: 10,
      tip: 5,
      category: "Meals",
      reimbursable: true,
      billable: false,
    },
    {
      id: "b",
      amount: 50,
      tax: 0,
      tip: 2,
      category: "Travel",
      reimbursable: false,
      billable: true,
    },
  ]);
  const totals = calculateExpenseTotals(rows, [{ miles: 20, rate: 1 }], 30);

  expect(totals.baseAmount).toBe(150);
  expect(totals.taxAmount).toBe(10);
  expect(totals.tipAmount).toBe(7);
  expect(totals.expenseTotal).toBe(167);
  expect(totals.reimbursableTotal).toBe(115);
  expect(totals.billableTotal).toBe(52);
  expect(totals.mileageTotal).toBe(20);
  expect(totals.reportTotal).toBe(187);
  expect(totals.amountDue).toBe(105);
  expect(totals.categoryTotals).toEqual({ Meals: 115, Travel: 52 });
});

test("legacy expense rows normalize missing tax and tip to zero", () => {
  expect(normalizeExpenseRows([{ id: "legacy", amount: 25 }])).toEqual([{ id: "legacy", amount: 25, tax: 0, tip: 0 }]);
  expect(calculateExpenseTotals([{ amount: 10 }], [{}], 0).categoryTotals).toEqual({ Other: 10 });
});

test("1099 thresholds are year-owned and unknown future years fail safely", () => {
  expect(get1099ReportingRule(2025)).toEqual({
    supported: true,
    year: 2025,
    threshold: 600,
  });
  expect(get1099ReportingRule(2026)).toEqual({
    supported: true,
    year: 2026,
    threshold: 2000,
  });
  expect(get1099ReportingRule(2027)).toEqual({
    supported: false,
    year: 2027,
    error: "1099-NEC rules update required for 2027.",
  });
});

test("1099 summary reports missing vendors and annual box adjustments", () => {
  const summary = calculateNecSummary(
    {
      reportingYear: 2026,
      payments: [
        { vendorId: "known", amount: 2100, includeIn1099: true },
        { vendorId: "missing", amount: 20, includeIn1099: true },
      ],
      recipientAdjustments: [
        {
          vendorId: "known",
          cashTips: 40,
          occupationCodes: "101",
          qualifiedOvertime: 75,
          federalWithholding: 12,
          state: "NC",
          stateIncome: 2100,
          stateWithholding: 4,
          maskedTinReference: "•••• 1234",
        },
      ],
    },
    ["known"],
  );

  expect(summary.aboveThresholdCount).toBe(1);
  expect(summary.missingVendorIds).toEqual(["missing"]);
  expect(summary.issues[0]).toMatch(/missing/i);
  expect(summary.boxTotals.cashTips).toBe(40);
  expect(summary.boxTotals.qualifiedOvertime).toBe(75);
  expect(summary.boxTotals.federalWithholding).toBe(12);
});

test("unsupported 1099 summaries and empty W-9 settings stay explicit", () => {
  const summary = calculateNecSummary({ reportingYear: 2027, payments: [], recipientAdjustments: [] }, []);
  expect(summary.issues[0]).toMatch(/rules update required/i);
  expect(summary.aboveThresholdCount).toBe(0);
  expect(createEmptyRecipientAdjustment("vendor")).toEqual({
    vendorId: "vendor",
    cashTips: 0,
    occupationCodes: "",
    qualifiedOvertime: 0,
    federalWithholding: 0,
    state: "",
    stateIncome: 0,
    stateWithholding: 0,
    maskedTinReference: "",
  });
  const futureRequest = createW9Request({
    reportingYear: 2027,
    contractorName: "",
    secureSubmissionInstructions: "",
  }).body;
  expect(futureRequest).toMatch(/rules update required/i);
  expect(futureRequest).toMatch(/approved secure document portal/i);
  expect(maskTinReference("")).toBe("");
});

test("TIN references retain only the last four digits", () => {
  expect(maskTinReference("12-3456789")).toBe("•••• 6789");
  expect(maskTinReference("12")).toBe("•••• 12");
});

test("W-9 requests use the official form, year rule, secure return instructions, and request-only disclaimer", () => {
  const request = createW9Request({
    reportingYear: 2026,
    contractorName: "Devon Lane",
    contractorBusinessName: "Devon Dev LLC",
    secureSubmissionInstructions: "Upload through the Acme secure vendor portal.",
  });

  expect(request.body).toMatch(/https:\/\/www\.irs\.gov\/pub\/irs-pdf\/fw9\.pdf/);
  expect(request.body).toMatch(/\$2,000/);
  expect(request.body).toMatch(/Acme secure vendor portal/);
  expect(request.body).toMatch(/request only/i);
  expect(request.body).toMatch(/do not send.*(?:TIN|SSN|EIN)/i);
});

const BASE_TAX_DRAFT = {
  taxYear: 2026,
  filingStatus: "single",
  grossRevenue: 100000,
  businessExpenses: 20000,
  w2Wages: 10000,
  otherIncome: 2000,
  aboveLineDeductions: 1000,
  itemizedDeductions: 0,
  taxCredits: 500,
  federalWithholding: 3000,
  estimatedPaymentsMade: 1000,
  priorYearTaxLiability: 12000,
  priorYearAdjustedGrossIncome: 100000,
  stateTaxRate: 4,
};

test("quarterly tax uses the versioned 2026 pack for every filing status", () => {
  for (const filingStatus of ["single", "married_joint", "married_separate", "head_household"]) {
    const result = calculateQuarterlyTax({ ...BASE_TAX_DRAFT, filingStatus });
    expect(result.ok).toBe(true);
    expect(result.deductionValue).toBe(QUARTERLY_TAX_RULES_2026.standardDeductions[filingStatus]);
    expect(result.calculationVersion).toBe(QUARTERLY_TAX_RULES_2026.version);
  }
});

test("quarterly tax compares safe harbors, subtracts withholding, and returns payment dates", () => {
  const result = calculateQuarterlyTax(BASE_TAX_DRAFT);
  expect(result.ok).toBe(true);

  const expectedSafeHarbor = Math.min(result.estimatedFederalLiability * 0.9, BASE_TAX_DRAFT.priorYearTaxLiability);
  expect(result.requiredAnnualPayment).toBe(
    Math.max(0, expectedSafeHarbor - BASE_TAX_DRAFT.federalWithholding - BASE_TAX_DRAFT.estimatedPaymentsMade),
  );
  expect(result.paymentSchedule.map(({ dueDate }) => dueDate)).toEqual([
    "2026-04-15",
    "2026-06-15",
    "2026-09-15",
    "2027-01-15",
  ]);
  expect(result.paymentSchedule.reduce((total, payment) => total + payment.amount, 0)).toBe(
    result.requiredAnnualPayment,
  );
  expect(result.assumptions.length > 0).toBeTruthy();
});

test("quarterly tax keeps self-employment tax outside nonrefundable credits and applies the $1,000 floor", () => {
  const result = calculateQuarterlyTax({
    ...BASE_TAX_DRAFT,
    grossRevenue: 10000,
    businessExpenses: 0,
    w2Wages: 0,
    otherIncome: 0,
    aboveLineDeductions: 0,
    taxCredits: 50000,
    federalWithholding: 500,
    estimatedPaymentsMade: 0,
    priorYearTaxLiability: 0,
  });

  expect(result.ok).toBe(true);
  expect(result.estimatedFederalLiability).toBe(result.selfEmploymentTax);
  expect(result.estimatedFederalLiability - 500 < 1000).toBeTruthy();
  expect(result.requiredAnnualPayment).toBe(0);
});

test("quarterly tax rejects unsupported years", () => {
  expect(calculateQuarterlyTax({ ...BASE_TAX_DRAFT, taxYear: 2027 })).toEqual({
    ok: false,
    error: "Quarterly tax rules update required for 2027.",
  });
});

test("quarterly tax normalizes legacy drafts and applies the high-income safe harbor", () => {
  expect(normalizeQuarterlyTaxDraft({ taxYear: 2026, filingStatus: "invalid" })).toEqual(DEFAULT_QUARTERLY_TAX_DRAFT);

  const result = calculateQuarterlyTax({
    ...BASE_TAX_DRAFT,
    priorYearAdjustedGrossIncome: 200000,
    itemizedDeductions: 20000,
  });
  expect(result.ok).toBe(true);
  expect(result.deductionValue).toBe(20000);
  expect(result.priorYearSafeHarbor).toBe(13200);
});
