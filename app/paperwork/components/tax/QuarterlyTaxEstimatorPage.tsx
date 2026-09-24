"use client";

import { WorkbenchPanes } from "@/components/tool-workbench/WorkbenchPanes";

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import type { DocumentTemplate } from "@/lib/invoice-templates/index.ts";
import {
  FieldDescription,
  Metric,
  Caption,
  H3,
  Overline,
  P,
  Text,
  AlertBanner,
  Button,
  Card,
  Input,
  Label,
  Select,
  StatusBadge,
  ToolPageHeader,
} from "@/components/ui/index.tsx";
import {
  FileText,
  Clock,
  Printer,
  FileDown,
  RefreshCw,
  Plus,
  Trash2,
  Copy,
  Check,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Download,
  Percent,
  CheckCircle,
  HelpCircle,
  ChevronRight,
  TrendingUp,
  Coins,
  ShieldAlert,
} from "lucide-react";
import { DataBridge, DataBridgeKeys, TaxEstimateSummaryData } from "@/lib/paperwork/shared/dataBridge";
import {
  DEFAULT_QUARTERLY_TAX_DRAFT,
  FilingStatus,
  QuarterlyTaxDraft,
  calculateQuarterlyTax,
  normalizeQuarterlyTaxDraft,
} from "@/lib/paperwork/quarterlyTaxRules";
import { quarterlyTaxAdapter } from "@/lib/paperwork/documentAdapters";
import AdvancedTemplateWorkspace from "../AdvancedTemplateWorkspace";

export type { QuarterlyTaxDraft } from "@/lib/paperwork/quarterlyTaxRules";
export { DEFAULT_QUARTERLY_TAX_DRAFT, SAMPLE_QUARTERLY_TAX_DRAFT } from "@/lib/paperwork/quarterlyTaxRules";

const FILING_STATUSES: Array<{ id: FilingStatus; label: string }> = [
  { id: "single", label: "Single Filer" },
  { id: "married_joint", label: "Married Filing Jointly" },
  { id: "married_separate", label: "Married Filing Separately" },
  { id: "head_household", label: "Head of Household" },
];

export default function QuarterlyTaxEstimatorPage({
  onTrackClick,
  templates = [],
}: {
  onTrackClick: (item: string) => void;
  templates?: readonly DocumentTemplate[];
}) {
  const [draft, setDraft] = useState<QuarterlyTaxDraft>(() =>
    normalizeQuarterlyTaxDraft(DataBridge.get(DataBridgeKeys.TAX_DRAFT, DEFAULT_QUARTERLY_TAX_DRAFT)),
  );
  const [hasImportedExpenses, setHasImportedExpenses] = useState(false);

  // Auto load summaries from active expense report & active mileage logs
  useEffect(() => {
    let cumulativeExpenses = 0;

    // 1. Load Expense report summary total
    const expenseSummary = DataBridge.get<any | null>("paperworkkit.expenseReport.summary", null);
    if (expenseSummary && expenseSummary.totalAmount) {
      cumulativeExpenses += Number(expenseSummary.totalAmount || 0);
    }

    // 2. Load Mileage logs summary total
    const mileageSummary = DataBridge.get<any | null>(DataBridgeKeys.MILEAGE_SUMMARY, null);
    if (mileageSummary && mileageSummary.totalAmount) {
      cumulativeExpenses += Number(mileageSummary.totalAmount || 0);
    }

    if (cumulativeExpenses > 0) {
      setDraft((current) => ({
        ...current,
        businessExpenses: Math.round(cumulativeExpenses),
      }));
      setHasImportedExpenses(true);
    }
  }, []);

  const results = calculateQuarterlyTax(draft);
  const effectiveTaxRate =
    results.ok && draft.grossRevenue > 0 ? (results.estimatedTotalLiability / draft.grossRevenue) * 100 : 0;

  useEffect(() => {
    DataBridge.set(DataBridgeKeys.TAX_DRAFT, draft);
  }, [draft]);

  // Save to summary data bridge
  useEffect(() => {
    if (!results.ok) return;
    DataBridge.set(DataBridgeKeys.TAX_SUMMARY, {
      year: draft.taxYear,
      filingStatus: draft.filingStatus,
      calculationVersion: results.calculationVersion,
      assumptions: results.assumptions,
      estimatedTotalTax: results.estimatedTotalLiability,
      requiredAnnualPayment: results.requiredAnnualPayment,
      suggestedQuarterly: results.quarterlyPayment,
      paymentSchedule: results.paymentSchedule,
    });
  }, [draft.filingStatus, draft.taxYear, results]);

  const handlePrint = () => {
    onTrackClick("tax_estimator_print_clicked");
    window.print();
  };

  return (
    <div className="grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" id="tax-estimator-wrapper">
      <ToolPageHeader
        actions={
          hasImportedExpenses ? (
            <StatusBadge className="gap-1.5" variant="success">
              <CheckCircle className="size-4" />
              <span>Pulled ${draft.businessExpenses} from active expenses / mileage</span>
            </StatusBadge>
          ) : undefined
        }
        className="print:hidden"
        description="IRS self-employment Schedule SE projection and estimated federal bracket analysis."
        eyebrow={<StatusBadge variant="success">Form 1040-ES Estimator</StatusBadge>}
        title="Quarterly Tax Estimator"
      />

      <AdvancedTemplateWorkspace
        adapter={quarterlyTaxAdapter}
        draft={draft}
        onDraftChange={setDraft}
        onTrackClick={onTrackClick}
        templates={templates}
      />

      {"error" in results && (
        <AlertBanner title="Tax rules need attention" variant="warning">
          {results.error}
        </AlertBanner>
      )}

      {/* Main interactive cards split */}
      <WorkbenchPanes className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* INPUT PARAMETERS CARD COLUMN */}
        <div className="lg:col-span-6 space-y-6 print:hidden">
          <Card className="space-y-5">
            <H3 className="text-slate-500 border-b border-slate-100 pb-2">1. Contractor Operating Figures</H3>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="tax-year">
                    Tax year
                  </Label>
                  <Select
                    id="tax-year"
                    value={draft.taxYear}
                    onChange={(event) => setDraft({ ...draft, taxYear: Number(event.target.value) })}
                  >
                    <option value={2026}>2026</option>
                  </Select>
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="tax-filing-status">
                    Filing status
                  </Label>
                  <Select
                    id="tax-filing-status"
                    value={draft.filingStatus}
                    onChange={(event) => setDraft({ ...draft, filingStatus: event.target.value as FilingStatus })}
                  >
                    {FILING_STATUSES.map((status) => (
                      <option key={status.id} value={status.id}>
                        {status.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <Label className="block text-slate-400 mb-1" htmlFor="tax-gross-revenue">
                  Estimated Gross Contractor Income ($) *
                </Label>
                <Input
                  aria-describedby="tax-gross-revenue-description"
                  type="number"
                  step="500"
                  id="tax-gross-revenue"
                  value={draft.grossRevenue}
                  onChange={(event) => setDraft({ ...draft, grossRevenue: Math.max(0, Number(event.target.value)) })}
                />
                <FieldDescription className="text-slate-400 block mt-1" id="tax-gross-revenue-description">
                  Total annual 1099 payouts you expect before deductions.
                </FieldDescription>
              </div>

              <div className="relative">
                <Label className="block text-slate-400 mb-1" htmlFor="tax-business-expenses">
                  Business Deductible Expenses ($)
                </Label>
                <div className="flex gap-2">
                  <Input
                    aria-describedby="tax-business-expenses-description"
                    type="number"
                    step="100"
                    className="grow"
                    id="tax-business-expenses"
                    value={draft.businessExpenses}
                    onChange={(event) => {
                      setDraft({
                        ...draft,
                        businessExpenses: Math.max(0, Number(event.target.value)),
                      });
                      setHasImportedExpenses(false);
                    }}
                  />
                </div>
                <FieldDescription className="text-slate-400 block mt-1" id="tax-business-expenses-description">
                  Operating expense totals, date-based mileage deductions, and gear.
                </FieldDescription>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="tax-w2-wages">
                    Existing W-2 wages ($)
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    id="tax-w2-wages"
                    value={draft.w2Wages}
                    onChange={(event) => setDraft({ ...draft, w2Wages: Math.max(0, Number(event.target.value)) })}
                  />
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="tax-state-rate">
                    State Tax rate (%)
                  </Label>
                  <Input
                    type="number"
                    step="0.1"
                    id="tax-state-rate"
                    value={draft.stateTaxRate}
                    onChange={(event) => setDraft({ ...draft, stateTaxRate: Math.max(0, Number(event.target.value)) })}
                  />
                </div>
              </div>

              <div>
                <Label className="block text-slate-400 mb-1" htmlFor="tax-other-income">
                  Other income ($)
                </Label>
                <Input
                  type="number"
                  step="500"
                  id="tax-other-income"
                  value={draft.otherIncome}
                  onChange={(event) => setDraft({ ...draft, otherIncome: Math.max(0, Number(event.target.value)) })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {(
                  [
                    ["aboveLineDeductions", "Above-line deductions"],
                    ["itemizedDeductions", "Itemized deductions"],
                    ["taxCredits", "Tax credits"],
                    ["federalWithholding", "Federal withholding"],
                    ["estimatedPaymentsMade", "Estimated payments made"],
                    ["priorYearTaxLiability", "Prior-year tax liability"],
                    ["priorYearAdjustedGrossIncome", "Prior-year AGI"],
                  ] as const
                ).map(([field, label]) => (
                  <div key={field}>
                    <Label className="block text-slate-400 mb-1" htmlFor={`tax-${field}`}>
                      {label} ($)
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      id={`tax-${field}`}
                      value={draft[field]}
                      onChange={(event) => setDraft({ ...draft, [field]: Math.max(0, Number(event.target.value)) })}
                    />
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <AlertBanner title="Estimated Tax Safe Harbor Rules">
            <P>
              The federal schedule compares 90% of current-year liability with the applicable prior-year safe harbor,
              then subtracts withholding and payments already made.
            </P>
          </AlertBanner>
        </div>

        {/* OUTPUT ANALYSIS & ESTIMATE SUMMARY CARD */}
        <div className="lg:col-span-6 space-y-6">
          {results.ok && (
            <>
              <Card className="space-y-6 print:hidden">
                <div className="text-center pb-4 border-b">
                  <Overline className="text-slate-400">Suggested federal Q1/Q2/Q3/Q4 payment</Overline>
                  <div className="text-slate-900 mt-1">
                    <Metric>
                      $
                      {results.quarterlyPayment.toLocaleString("en-US", {
                        maximumFractionDigits: 0,
                      })}
                    </Metric>
                    <Overline className="text-slate-400 block mt-1">Four Scheduled Installments</Overline>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {[
                    ["Estimated net profit", results.netSelfEmploymentProfit],
                    ["Self-employment tax", results.selfEmploymentTax],
                    ["Deduction used", results.deductionValue],
                    ["Federal income tax", results.federalIncomeTax],
                    ["Separate state estimate", results.estimatedStateTax],
                    ["Required annual federal payment", results.requiredAnnualPayment],
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <Overline className="text-slate-400 block">{label}</Overline>
                      <Text className="text-slate-900">
                        ${Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                      </Text>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="flex justify-between text-slate-400 pb-1">
                    <Text>Federal progressive estimate</Text>
                    <Text className="text-blue-600">Effective rate: {effectiveTaxRate.toFixed(1)}%</Text>
                  </div>
                  <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                    <div className="bg-indigo-600 h-full" style={{ width: `${Math.min(100, effectiveTaxRate)}%` }} />
                  </div>
                  <Caption className="block text-slate-400 mt-1.5">
                    Calculation pack {results.calculationVersion}. State tax stays separate from the federal installment
                    schedule.
                  </Caption>
                </div>

                <Button onClick={handlePrint} className="w-full" type="button" variant="strong">
                  <Printer className="size-4" />
                  <span>Print Estimate Summary</span>
                </Button>
              </Card>

              <div
                className="relative group border border-slate-200 shadow-xl rounded-2xl overflow-hidden"
                id="tax-estimate-print"
              >
                <div className="p-8 bg-white min-h-[750px] font-sans text-slate-800" id="receipt-print-area">
                  <div className="border-b-2 border-slate-900 pb-4 mb-6">
                    <span className="text-[10px] font-black text-slate-400 block uppercase font-mono">
                      SMARTTOOLS ESTIMATE SUMMARY
                    </span>
                    <h1 className="text-lg font-black text-slate-950 leading-tight">
                      ESTIMATED FEDERAL TAX PAYMENT SCHEDULE
                    </h1>
                    <p className="text-[10px] text-slate-500 font-bold font-mono">
                      CALENDAR TAX YEAR {draft.taxYear} · CALCULATION {results.calculationVersion}
                    </p>
                  </div>

                  <div className="space-y-4">
                    {results.paymentSchedule.map((item) => (
                      <div
                        key={item.installment}
                        className="border border-slate-300 rounded-xl p-4 text-xs font-semibold"
                      >
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-black">
                              Installment {item.installment}
                            </span>
                            <p className="text-sm font-black text-slate-950">Q{item.installment} estimated payment</p>
                            <span className="block text-[10px] text-slate-500 font-bold font-mono mt-1">
                              Due date: {item.dueDate}
                            </span>
                          </div>
                          <div className="text-right flex flex-col justify-end">
                            <span className="text-[11px] uppercase font-black text-slate-400">Installment amount</span>
                            <p className="text-md font-black text-slate-900 font-mono">
                              $
                              {item.amount.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-8 space-y-1 text-[10px] text-slate-500">
                    {results.assumptions.map((assumption) => (
                      <p key={assumption}>• {assumption}</p>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </WorkbenchPanes>
    </div>
  );
}
