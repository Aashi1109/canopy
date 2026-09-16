import assert from "node:assert/strict";
import test from "node:test";

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
  assert.equal(getMileageRate("irs-standard", 2026, "2026-06-30", 0), 0.725);
  assert.equal(getMileageRate("irs-standard", 2026, "2026-07-01", 0), 0.76);
  assert.equal(getMileageRate("custom", 2026, "2026-07-01", 0.91), 0.91);
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

  assert.deepEqual(summary.errors, []);
  assert.equal(summary.standardMileageDeduction, 11.05);
  assert.equal(summary.parkingAndTolls, 3);
  assert.equal(summary.totalDeduction, 14.05);
  assert.equal(summary.totalFuelCost, 999);
});

test("unsupported mileage years fail instead of using a stale rate", () => {
  assert.throws(() => getMileageRate("irs-standard", 2027, "2027-01-01", 0), /rules update required/i);
  assert.throws(() => getMileageRate("custom", 2026, "2026-01-01", -1), /custom mileage rate/i);
  assert.throws(() => getMileageRate("irs-standard", 2026, "2025-12-31", 0), /within tax year/i);
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

  assert.match(summary.errors[0], /within tax year/i);
  assert.equal(summary.trips[0].amount, 0);
  assert.equal(summary.fuelEconomy, 30);
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

  assert.equal(totals.baseAmount, 150);
  assert.equal(totals.taxAmount, 10);
  assert.equal(totals.tipAmount, 7);
  assert.equal(totals.expenseTotal, 167);
  assert.equal(totals.reimbursableTotal, 115);
  assert.equal(totals.billableTotal, 52);
  assert.equal(totals.mileageTotal, 20);
  assert.equal(totals.reportTotal, 187);
  assert.equal(totals.amountDue, 105);
  assert.deepEqual(totals.categoryTotals, { Meals: 115, Travel: 52 });
});

test("legacy expense rows normalize missing tax and tip to zero", () => {
  assert.deepEqual(normalizeExpenseRows([{ id: "legacy", amount: 25 }]), [
    { id: "legacy", amount: 25, tax: 0, tip: 0 },
  ]);
  assert.deepEqual(calculateExpenseTotals([{ amount: 10 }], [{}], 0).categoryTotals, { Other: 10 });
});

test("1099 thresholds are year-owned and unknown future years fail safely", () => {
  assert.deepEqual(get1099ReportingRule(2025), {
    supported: true,
    year: 2025,
    threshold: 600,
  });
  assert.deepEqual(get1099ReportingRule(2026), {
    supported: true,
    year: 2026,
    threshold: 2000,
  });
  assert.deepEqual(get1099ReportingRule(2027), {
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

  assert.equal(summary.aboveThresholdCount, 1);
  assert.deepEqual(summary.missingVendorIds, ["missing"]);
  assert.match(summary.issues[0], /missing/i);
  assert.equal(summary.boxTotals.cashTips, 40);
  assert.equal(summary.boxTotals.qualifiedOvertime, 75);
  assert.equal(summary.boxTotals.federalWithholding, 12);
});

test("unsupported 1099 summaries and empty W-9 settings stay explicit", () => {
  const summary = calculateNecSummary({ reportingYear: 2027, payments: [], recipientAdjustments: [] }, []);
  assert.match(summary.issues[0], /rules update required/i);
  assert.equal(summary.aboveThresholdCount, 0);
  assert.deepEqual(createEmptyRecipientAdjustment("vendor"), {
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
  assert.match(futureRequest, /rules update required/i);
  assert.match(futureRequest, /approved secure document portal/i);
  assert.equal(maskTinReference(""), "");
});

test("TIN references retain only the last four digits", () => {
  assert.equal(maskTinReference("12-3456789"), "•••• 6789");
  assert.equal(maskTinReference("12"), "•••• 12");
});

test("W-9 requests use the official form, year rule, secure return instructions, and request-only disclaimer", () => {
  const request = createW9Request({
    reportingYear: 2026,
    contractorName: "Devon Lane",
    contractorBusinessName: "Devon Dev LLC",
    secureSubmissionInstructions: "Upload through the Acme secure vendor portal.",
  });

  assert.match(request.body, /https:\/\/www\.irs\.gov\/pub\/irs-pdf\/fw9\.pdf/);
  assert.match(request.body, /\$2,000/);
  assert.match(request.body, /Acme secure vendor portal/);
  assert.match(request.body, /request only/i);
  assert.match(request.body, /do not send.*(?:TIN|SSN|EIN)/i);
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
    assert.equal(result.ok, true);
    assert.equal(result.deductionValue, QUARTERLY_TAX_RULES_2026.standardDeductions[filingStatus]);
    assert.equal(result.calculationVersion, QUARTERLY_TAX_RULES_2026.version);
  }
});

test("quarterly tax compares safe harbors, subtracts withholding, and returns payment dates", () => {
  const result = calculateQuarterlyTax(BASE_TAX_DRAFT);
  assert.equal(result.ok, true);

  const expectedSafeHarbor = Math.min(result.estimatedFederalLiability * 0.9, BASE_TAX_DRAFT.priorYearTaxLiability);
  assert.equal(
    result.requiredAnnualPayment,
    Math.max(0, expectedSafeHarbor - BASE_TAX_DRAFT.federalWithholding - BASE_TAX_DRAFT.estimatedPaymentsMade),
  );
  assert.deepEqual(
    result.paymentSchedule.map(({ dueDate }) => dueDate),
    ["2026-04-15", "2026-06-15", "2026-09-15", "2027-01-15"],
  );
  assert.equal(
    result.paymentSchedule.reduce((total, payment) => total + payment.amount, 0),
    result.requiredAnnualPayment,
  );
  assert.ok(result.assumptions.length > 0);
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

  assert.equal(result.ok, true);
  assert.equal(result.estimatedFederalLiability, result.selfEmploymentTax);
  assert.ok(result.estimatedFederalLiability - 500 < 1000);
  assert.equal(result.requiredAnnualPayment, 0);
});

test("quarterly tax rejects unsupported years", () => {
  assert.deepEqual(calculateQuarterlyTax({ ...BASE_TAX_DRAFT, taxYear: 2027 }), {
    ok: false,
    error: "Quarterly tax rules update required for 2027.",
  });
});

test("quarterly tax normalizes legacy drafts and applies the high-income safe harbor", () => {
  assert.deepEqual(normalizeQuarterlyTaxDraft({ taxYear: 2026, filingStatus: "invalid" }), DEFAULT_QUARTERLY_TAX_DRAFT);

  const result = calculateQuarterlyTax({
    ...BASE_TAX_DRAFT,
    priorYearAdjustedGrossIncome: 200000,
    itemizedDeductions: 20000,
  });
  assert.equal(result.ok, true);
  assert.equal(result.deductionValue, 20000);
  assert.equal(result.priorYearSafeHarbor, 13200);
});
