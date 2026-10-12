import { test, expect } from "vitest";
import { calculateQuarterlyTax, DEFAULT_QUARTERLY_TAX_DRAFT } from "../lib/paperwork/quarterlyTaxRules.ts";
import { calculateMileageSummary, getMileageRate } from "../lib/paperwork/mileageRules.ts";
import {
  calculateNecSummary,
  get1099ReportingRule,
  createEmptyRecipientAdjustment,
} from "../lib/paperwork/contractorTaxRules.ts";

test("payments made reduce remaining annual target without rewriting installments", () => {
  const draft = {
    ...DEFAULT_QUARTERLY_TAX_DRAFT,
    grossRevenue: 100000,
    priorYearTaxKnown: true,
    priorYearCoveredFullYear: true,
    priorYearTaxLiability: 12000,
  };
  const before = calculateQuarterlyTax(draft);
  const after = calculateQuarterlyTax({ ...draft, estimatedPaymentsMade: 3000 });
  expect(after.paymentSchedule).toEqual(before.paymentSchedule);
  expect(after.requiredAnnualPayment).toBe(12000);
  expect(after.remainingAnnualPayment).toBe(9000);
});
test("zero prior tax exemption requires a known full-year return and residency", () => {
  const draft = {
    ...DEFAULT_QUARTERLY_TAX_DRAFT,
    grossRevenue: 100000,
    priorYearTaxKnown: true,
    priorYearCoveredFullYear: true,
    priorYearResidentAllYear: true,
  };
  expect(calculateQuarterlyTax(draft).requiredAnnualPayment).toBe(0);
  expect(calculateQuarterlyTax({ ...draft, priorYearResidentAllYear: false }).requiredAnnualPayment).toBeGreaterThan(0);
});
test("nonfinite and negative tax amounts cannot produce an estimate", () => {
  expect(calculateQuarterlyTax({ ...DEFAULT_QUARTERLY_TAX_DRAFT, grossRevenue: NaN }).ok).toBe(false);
  expect(calculateQuarterlyTax({ ...DEFAULT_QUARTERLY_TAX_DRAFT, stateTaxRate: 101 }).ok).toBe(false);
});
test("custom reimbursement works outside IRS supported years but requires calendar dates", () => {
  expect(getMileageRate("custom", 2027, "2027-02-28", 0.8)).toBe(0.8);
  expect(() => getMileageRate("custom", 2027, "2027-02-30", 0.8)).toThrow();
});
test("mileage rejects negative and nonfinite records", () => {
  const summary = calculateMileageSummary({
    taxYear: 2026,
    rateMode: "irs-standard",
    customRate: 0,
    trips: [{ id: "x", date: "2026-01-01", miles: -1 }],
    fuelRecords: [{ cost: Infinity, gallons: 2, odometer: 100 }],
  });
  expect(summary.errors.length).toBeGreaterThan(0);
  expect(summary.totalDeduction).toBe(0);
});
test("NEC excludes wrong-year, card and rent payments from candidate compensation", () => {
  const pay = {
    vendorId: "v",
    amount: 100,
    includeIn1099: true,
    date: "2026-02-01",
    category: "Services",
    paymentMethod: "ACH",
  };
  const result = calculateNecSummary(
    {
      reportingYear: 2026,
      payments: [pay, { ...pay, date: "2025-02-01" }, { ...pay, paymentMethod: "Card" }, { ...pay, category: "Rent" }],
      recipientAdjustments: [],
    },
    ["v"],
  );
  expect(result.reportablePayments).toBe(100);
  expect(result.issues.length).toBeGreaterThan(0);
});
test("NEC backup withholding triggers filing review below threshold", () => {
  const adjustment = { ...createEmptyRecipientAdjustment("v"), federalWithholding: 100 };
  const result = calculateNecSummary(
    {
      reportingYear: 2026,
      payments: [
        {
          vendorId: "v",
          amount: 500,
          includeIn1099: true,
          date: "2026-02-01",
          category: "Services",
          paymentMethod: "ACH",
        },
      ],
      recipientAdjustments: [adjustment],
    },
    ["v"],
  );
  expect(result.aboveThresholdCount).toBe(0);
  expect(result.filingRequiredVendorIds).toContain("v");
  expect(result.warnings.join(" ")).toContain("withholding");
  expect(get1099ReportingRule(1900).supported).toBe(false);
});

test("self-employment tax starts at $400 of net self-employment earnings", () => {
  const result = calculateQuarterlyTax({ ...DEFAULT_QUARTERLY_TAX_DRAFT, grossRevenue: 400 });
  expect(result.selfEmploymentTax).toBe(0);
  const eligible = calculateQuarterlyTax({ ...DEFAULT_QUARTERLY_TAX_DRAFT, grossRevenue: 500 });
  expect(eligible.selfEmploymentTax).toBeGreaterThan(0);
});
