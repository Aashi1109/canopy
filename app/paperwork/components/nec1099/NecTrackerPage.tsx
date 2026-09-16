"use client";

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import type { DocumentTemplate } from "@smarttools/invoice-templates";
import {
  H3,
  Metric,
  Overline,
  P,
  Text,
  AlertBanner,
  Button,
  ToolActionButton,
  Card,
  Checkbox,
  Input,
  Label,
  MetricCard,
  Select,
  StatusBadge,
  ToolPageHeader,
} from "@smarttools/ui";
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
  Percent,
  CheckCircle,
  HelpCircle,
  ChevronRight,
  AlertTriangle,
  Receipt,
  UserCheck,
} from "lucide-react";
import { DataBridge, DataBridgeKeys, VendorProfile, PaymentItem } from "@/lib/paperwork/shared/dataBridge";
import {
  NEC_INTERNAL_REPORT_DISCLAIMER,
  RecipientAnnualAdjustment,
  calculateNecSummary,
  createEmptyRecipientAdjustment,
  maskTinReference,
} from "@/lib/paperwork/contractorTaxRules";
import { nec1099Adapter } from "@/lib/paperwork/documentAdapters";
import AdvancedTemplateWorkspace from "../AdvancedTemplateWorkspace";

export interface NecTrackerDraft {
  reportingYear: number;
  payerName: string;
  payerAddress: string;
  payerEmail: string;
  filingStatus: string;
  payments: PaymentItem[];
  recipientAdjustments: RecipientAnnualAdjustment[];
}

export const DEFAULT_NEC_TRACKER_DRAFT: NecTrackerDraft = {
  reportingYear: 2026,
  payerName: "",
  payerAddress: "",
  payerEmail: "",
  filingStatus: "Review required",
  payments: [
    {
      id: "pay-1",
      date: new Date().toISOString().substring(0, 10),
      vendorId: "vendor-1",
      amount: 1500.0,
      paymentMethod: "Zelle",
      category: "Services",
      description: "Design Consulting Consult",
      includeIn1099: true,
    },
  ],
  recipientAdjustments: [createEmptyRecipientAdjustment("vendor-1")],
};

export const SAMPLE_NEC_TRACKER_DRAFT: NecTrackerDraft = {
  reportingYear: 2026,
  payerName: "Northstar Studio LLC",
  payerAddress: "42 Market Street, Austin, TX 78701",
  payerEmail: "accounts@northstar.example",
  filingStatus: "Ready for preparer",
  payments: [
    {
      id: "pay-1",
      date: "2026-02-15",
      vendorId: "vendor-1",
      amount: 450.0,
      paymentMethod: "Zelle",
      category: "Services",
      description: "Design Consult Setup",
      includeIn1099: true,
    },
    {
      id: "pay-2",
      date: "2026-05-18",
      vendorId: "vendor-1",
      amount: 1200.0,
      paymentMethod: "ACH",
      category: "Services",
      description: "Figma Typography milestones",
      includeIn1099: true,
    },
    {
      id: "pay-3",
      date: "2026-08-20",
      vendorId: "vendor-new",
      amount: 50.0,
      paymentMethod: "Cash",
      category: "Rent",
      description: "Desk rent AVL Office block",
      includeIn1099: false,
    },
  ],
  recipientAdjustments: [
    {
      ...createEmptyRecipientAdjustment("vendor-1"),
      cashTips: 125,
      occupationCodes: "101",
      qualifiedOvertime: 240,
      maskedTinReference: "•••• 4821",
      state: "NC",
      stateIncome: 1650,
    },
  ],
};

const FALLBACK_VENDOR: VendorProfile = {
  id: "vendor-1",
  legalName: "Devon Lane",
  businessName: "Devon Dev LLC",
  email: "devon@lanestudio.com",
  phone: "+1 (555) 441-2820",
  addressLine1: "192 Silver Maple Ave, Seattle, WA 98101",
  entityType: "LLC",
  w9Status: "Received",
  notes: "Ruby-on-Rails setup developer.",
};

export function normalizeNecTrackerDraft(draft: Partial<NecTrackerDraft>): NecTrackerDraft {
  return {
    reportingYear: Number(draft.reportingYear || DEFAULT_NEC_TRACKER_DRAFT.reportingYear),
    payerName: String(draft.payerName || ""),
    payerAddress: String(draft.payerAddress || ""),
    payerEmail: String(draft.payerEmail || ""),
    filingStatus: String(draft.filingStatus || DEFAULT_NEC_TRACKER_DRAFT.filingStatus),
    payments: (draft.payments || DEFAULT_NEC_TRACKER_DRAFT.payments).map((payment) => ({
      id: String(payment.id || `payment-${Date.now()}`),
      date: String(payment.date || ""),
      vendorId: String(payment.vendorId || ""),
      amount: Number(payment.amount || 0),
      paymentMethod: payment.paymentMethod || "Other",
      category: payment.category || "Other",
      description: String(payment.description || ""),
      includeIn1099: Boolean(payment.includeIn1099),
      invoiceReference: payment.invoiceReference ? String(payment.invoiceReference) : undefined,
    })),
    recipientAdjustments: (draft.recipientAdjustments || []).map((adjustment) => ({
      vendorId: String(adjustment.vendorId || ""),
      cashTips: Number(adjustment.cashTips || 0),
      occupationCodes: String(adjustment.occupationCodes || ""),
      qualifiedOvertime: Number(adjustment.qualifiedOvertime || 0),
      federalWithholding: Number(adjustment.federalWithholding || 0),
      state: String(adjustment.state || ""),
      stateIncome: Number(adjustment.stateIncome || 0),
      stateWithholding: Number(adjustment.stateWithholding || 0),
      maskedTinReference: maskTinReference(adjustment.maskedTinReference || ""),
    })),
  };
}

export default function NecTrackerPage({
  onTrackClick,
  templates = [],
}: {
  onTrackClick: (item: string) => void;
  templates?: readonly DocumentTemplate[];
}) {
  const [data, setData] = useState<NecTrackerDraft>(() => {
    return normalizeNecTrackerDraft(DataBridge.get(DataBridgeKeys.NEC_DRAFT, DEFAULT_NEC_TRACKER_DRAFT));
  });

  const [vendors] = useState<VendorProfile[]>(() => {
    const loaded = DataBridge.getW9Vendors();
    return loaded.length > 0 ? loaded : [FALLBACK_VENDOR];
  });
  // Seed the shared vendor list so 1099 rows always resolve on first render.
  useEffect(() => {
    if (DataBridge.getW9Vendors().length === 0) {
      DataBridge.saveW9Vendors(vendors);
    }
  }, [vendors]);

  // Save payments draft
  useEffect(() => {
    DataBridge.set(DataBridgeKeys.NEC_DRAFT, data);
    const summary = calculateNecSummary(
      data,
      vendors.map((vendor) => vendor.id),
    );

    DataBridge.set(DataBridgeKeys.NEC_SUMMARY, {
      year: data.reportingYear,
      totalPayments: summary.totalPayments,
      reportablePayments: summary.reportablePayments,
      contractorsCount: summary.contractorsCount,
      aboveThresholdCount: summary.aboveThresholdCount,
      issues: summary.issues,
      boxTotals: summary.boxTotals,
    });
  }, [data, vendors]);

  const handleAddPayment = () => {
    const newPay: PaymentItem = {
      id: `pay-${Date.now()}`,
      date: new Date().toISOString().substring(0, 10),
      vendorId: vendors[0]?.id || "vendor-1",
      amount: 0,
      paymentMethod: "Zelle",
      category: "Services",
      description: "",
      includeIn1099: true,
    };
    setData({
      ...data,
      payments: [...data.payments, newPay],
    });
    onTrackClick("nec_payment_added");
  };

  const handleRemovePayment = (id: string) => {
    setData({
      ...data,
      payments: data.payments.filter((p) => p.id !== id),
    });
    onTrackClick("nec_payment_removed");
  };

  const handlePaymentChange = (id: string, field: keyof PaymentItem, val: any) => {
    const updated = data.payments.map((p) => {
      if (p.id === id) {
        return {
          ...p,
          [field]: field === "amount" ? (val === "" ? "" : Number(val)) : val,
        };
      }
      return p;
    });
    setData({ ...data, payments: updated });
  };

  const handleLoadSample = () => {
    setData(SAMPLE_NEC_TRACKER_DRAFT);
    onTrackClick("nec_sample_loaded");
  };

  const handleClearDraft = () => {
    if (confirm("Are you sure you want to clear payment tracking history?")) {
      setData(DEFAULT_NEC_TRACKER_DRAFT);
      onTrackClick("nec_draft_cleared");
    }
  };

  const stats = calculateNecSummary(
    data,
    vendors.map((vendor) => vendor.id),
  );
  const reportingThreshold = stats.rule.supported ? stats.rule.threshold : null;

  const handleAdjustmentChange = (vendorId: string, field: keyof RecipientAnnualAdjustment, value: string) => {
    const numericFields: Array<keyof RecipientAnnualAdjustment> = [
      "cashTips",
      "qualifiedOvertime",
      "federalWithholding",
      "stateIncome",
      "stateWithholding",
    ];
    const current =
      data.recipientAdjustments.find((adjustment) => adjustment.vendorId === vendorId) ||
      createEmptyRecipientAdjustment(vendorId);
    const nextValue =
      field === "maskedTinReference"
        ? maskTinReference(value)
        : numericFields.includes(field)
          ? Math.max(0, Number(value))
          : value;
    setData({
      ...data,
      recipientAdjustments: [
        ...data.recipientAdjustments.filter((adjustment) => adjustment.vendorId !== vendorId),
        { ...current, [field]: nextValue },
      ],
    });
  };

  const handleExportCSV = () => {
    onTrackClick("nec_csv_exported");
    let content =
      "Date,Contractor Legal Name,Amount Paid,Payment Method,Deduction Classification,Description,Included In 1099\n";
    data.payments.forEach((item) => {
      const v = vendors.find((vend) => vend.id === item.vendorId);
      const name = v ? v.legalName : "Unknown Contractor";
      content += `"${item.date}","${name.replace(/"/g, '""')}",${item.amount},"${item.paymentMethod}","${item.category}","${item.description.replace(/"/g, '""')}",${item.includeIn1099 ? "Yes" : "No"}\n`;
    });
    content += "\nANNUAL RECIPIENT ADJUSTMENTS\n";
    content +=
      "Contractor,Masked TIN Reference,Cash Tips,Occupation Codes,Qualified Overtime,Federal Withholding,State,State Income,State Withholding\n";
    data.recipientAdjustments.forEach((adjustment) => {
      const vendor = vendors.find((item) => item.id === adjustment.vendorId);
      content += `"${vendor?.legalName || "Missing vendor"}","${adjustment.maskedTinReference}",${adjustment.cashTips},"${adjustment.occupationCodes}",${adjustment.qualifiedOvertime},${adjustment.federalWithholding},"${adjustment.state}",${adjustment.stateIncome},${adjustment.stateWithholding}\n`;
    });

    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `annual-1099NEC-ledger-${data.reportingYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    onTrackClick("nec_print_clicked");
    window.print();
  };

  return (
    <div className="grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" id="nec-tracker-wrapper">
      <ToolPageHeader
        actions={
          <>
            <Button onClick={handleLoadSample} size="sm" variant="secondary">
              <RefreshCw className="size-3.5" />
              <span>Load Sample</span>
            </Button>
            <Button onClick={handleClearDraft} size="sm" variant="danger-subtle">
              Clear Fields
            </Button>
          </>
        }
        className="print:hidden"
        description="Monitor independent subcontractor payout caps, track verification thresholds, and download compliance checklists."
        eyebrow={<StatusBadge variant="warning">IRS Form 1099-NEC Threshold Tracker</StatusBadge>}
        title="1099-NEC Contractor Payments Tracker"
      />

      <AdvancedTemplateWorkspace
        adapter={nec1099Adapter}
        draft={data}
        onDraftChange={setData}
        onTrackClick={onTrackClick}
        templates={templates}
      />

      {stats.issues.length > 0 && (
        <AlertBanner title="1099 tracking issues" variant="warning">
          {stats.issues.join(" ")}
        </AlertBanner>
      )}

      {/* Threshold stats alerts row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 print:hidden">
        <MetricCard
          className="rounded-2xl border-slate-200 bg-white"
          label="Total payments ledger"
          value={`$${stats.totalPayments.toLocaleString()}`}
        />

        <MetricCard
          className="rounded-2xl border-slate-200 bg-white"
          label={
            reportingThreshold === null
              ? "Rules update required"
              : `At or above $${reportingThreshold.toLocaleString()} threshold`
          }
          value={
            <Text className="flex items-center justify-between gap-3">
              <Text className="flex items-baseline gap-1.5">
                <Metric className="text-amber-600">{stats.aboveThresholdCount}</Metric>
                <Overline className="text-slate-400">contractors</Overline>
              </Text>
              {stats.aboveThresholdCount > 0 && (
                <Text className="flex size-9 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-500">
                  <AlertTriangle className="size-5 animate-bounce-slow" />
                </Text>
              )}
            </Text>
          }
        />

        <MetricCard
          className="rounded-2xl border-slate-200 bg-white [&_strong]:text-emerald-600"
          label="Eligible 1099 payouts"
          value={`$${stats.reportablePayments.toLocaleString()}`}
        />
      </div>

      {/* Split Columns Editor & Live Render */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* PAYMENT LEDGER INPUTS */}
        <div className="lg:col-span-7 space-y-6 print:hidden">
          <Card className="space-y-6">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex gap-4">
                <div className="space-y-1">
                  <Overline className="text-slate-500">Contractor Payments Log ledger</Overline>
                </div>
              </div>

              <Button type="button" onClick={handleAddPayment} size="sm" variant="strong">
                <Plus className="size-3.5" />
                <span>Log Payment</span>
              </Button>
            </div>

            <div className="max-w-48">
              <Label className="block text-slate-400 mb-1" htmlFor="nec-reporting-year">
                Reporting year
              </Label>
              <Select
                id="nec-reporting-year"
                value={data.reportingYear}
                onChange={(event) => setData({ ...data, reportingYear: Number(event.target.value) })}
              >
                <option value={2026}>2026 ($2,000)</option>
                <option value={2025}>2025 ($600)</option>
              </Select>
            </div>

            <div className="space-y-4">
              {data.payments.map((pay) => (
                <div key={pay.id} className="p-4 bg-slate-50 border rounded-xl space-y-3 relative">
                  <Button
                    type="button"
                    onClick={() => handleRemovePayment(pay.id)}
                    aria-label="Remove payment"
                    className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"
                    size="icon"
                    variant="ghost"
                  >
                    <Trash2 className="size-4" />
                  </Button>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <Label className="block text-slate-400 mb-1" htmlFor={`nec-payment-${pay.id}-date`}>
                        Payment Date *
                      </Label>
                      <Input
                        type="date"
                        id={`nec-payment-${pay.id}-date`}
                        value={pay.date}
                        onChange={(e) => handlePaymentChange(pay.id, "date", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="block text-slate-400 mb-1" htmlFor={`nec-payment-${pay.id}-vendor`}>
                        Contractor Name *
                      </Label>
                      <Select
                        id={`nec-payment-${pay.id}-vendor`}
                        value={pay.vendorId}
                        onChange={(e) => handlePaymentChange(pay.id, "vendorId", e.target.value)}
                      >
                        {vendors.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.legalName}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label className="block text-slate-400 mb-1" htmlFor={`nec-payment-${pay.id}-amount`}>
                        Amount ($) *
                      </Label>
                      <Input
                        type="number"
                        placeholder="0.00"
                        id={`nec-payment-${pay.id}-amount`}
                        value={pay.amount || ""}
                        onChange={(e) => handlePaymentChange(pay.id, "amount", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="block text-slate-500 mb-1" htmlFor={`nec-payment-${pay.id}-method`}>
                        Payment Route
                      </Label>
                      <Select
                        id={`nec-payment-${pay.id}-method`}
                        value={pay.paymentMethod}
                        onChange={(e) => handlePaymentChange(pay.id, "paymentMethod", e.target.value)}
                      >
                        <option value="Zelle">Zelle Deposit</option>
                        <option value="ACH">Direct Wire ACH</option>
                        <option value="Check">Business Check</option>
                        <option value="PayPal">PayPal Balance</option>
                        <option value="Cash">Cash Ledger</option>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-1">
                    <div className="md:col-span-8">
                      <Input
                        aria-label="Payment memo"
                        type="text"
                        placeholder="Additional memo reference (e.g. Design Consulting consult)..."
                        value={pay.description}
                        onChange={(e) => handlePaymentChange(pay.id, "description", e.target.value)}
                      />
                    </div>
                    <div className="md:col-span-4 flex items-center justify-end text-slate-500">
                      <Checkbox
                        checked={pay.includeIn1099}
                        label="Include in 1099 NEC"
                        onCheckedChange={(checked) => handlePaymentChange(pay.id, "includeIn1099", checked === true)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-4">
            <div className="border-b pb-2">
              <H3 className="text-slate-500">Annual recipient adjustments</H3>
              <P className="mt-1 text-slate-500">Store only a masked last-four reference here, never a full TIN.</P>
            </div>
            {vendors.map((vendor) => {
              const adjustment =
                data.recipientAdjustments.find((item) => item.vendorId === vendor.id) ||
                createEmptyRecipientAdjustment(vendor.id);
              return (
                <div key={vendor.id} className="space-y-3 rounded-xl border bg-slate-50 p-4">
                  <P className="text-slate-900">{vendor.legalName}</P>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {(
                      [
                        ["cashTips", "Cash tips", "number"],
                        ["occupationCodes", "Occupation codes", "text"],
                        ["qualifiedOvertime", "Qualified overtime", "number"],
                        ["federalWithholding", "Federal withholding", "number"],
                        ["state", "State", "text"],
                        ["stateIncome", "State income", "number"],
                        ["stateWithholding", "State withholding", "number"],
                      ] as const
                    ).map(([field, label, type]) => (
                      <div key={field}>
                        <Label className="block text-slate-400" htmlFor={`nec-${vendor.id}-${field}`}>
                          {label}
                        </Label>
                        <Input
                          id={`nec-${vendor.id}-${field}`}
                          min={type === "number" ? "0" : undefined}
                          type={type}
                          value={adjustment[field]}
                          onChange={(event) => handleAdjustmentChange(vendor.id, field, event.target.value)}
                        />
                      </div>
                    ))}
                    <div>
                      <Label className="block text-slate-400" htmlFor={`nec-${vendor.id}-masked-tin`}>
                        Masked TIN reference
                      </Label>
                      <Input
                        id={`nec-${vendor.id}-masked-tin`}
                        inputMode="numeric"
                        placeholder="Last four only"
                        value={adjustment.maskedTinReference}
                        onChange={(event) =>
                          handleAdjustmentChange(vendor.id, "maskedTinReference", event.target.value)
                        }
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </Card>

          {/* Compliance notice block */}
          <AlertBanner title="IRS 1099-NEC Threshold warnings" variant="warning">
            <P>
              {"error" in stats.rule
                ? stats.rule.error
                : `The general Form 1099-NEC reporting threshold for ${data.reportingYear} is $${stats.rule.threshold.toLocaleString()}. Confirm recipient and payment eligibility in your filing workflow.`}
            </P>
          </AlertBanner>
        </div>

        {/* PRINT SUITE AND SUMMARY COMPLIANCE VERIFICATION REPORTS */}
        <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-20">
          <Card className="space-y-3 p-4 print:hidden">
            <div className="flex items-center justify-between text-slate-500 border-b pb-2">
              <Text>REPORT EXPORT BAR</Text>
              <StatusBadge variant="warning">Internal report — not Copy A</StatusBadge>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button onClick={handlePrint} className="w-full" type="button" variant="strong">
                <Printer className="size-4" />
                <span>Save Report PDF</span>
              </Button>
              <ToolActionButton action="download" onClick={handleExportCSV} type="button">
                <span>Export CSV Sheet</span>
              </ToolActionButton>
            </div>
          </Card>

          {/* Formulated paper template sheet */}
          <div className="relative group border border-slate-200 shadow-2xl rounded-2xl overflow-hidden">
            <div className="p-8 bg-white min-h-[750px] font-sans text-slate-800 font-semibold" id="receipt-print-area">
              <div className="border-b-2 border-slate-900 pb-4 mb-6">
                <span className="text-[11px] font-black text-slate-400 block uppercase font-mono tracking-wider">
                  ANNUAL CONTRACTOR COMPLIANCE VERIFICATIONS
                </span>
                <h1 className="text-lg font-black text-slate-950 leading-tight">1099-NEC INTERNAL REPORTING LEDGER</h1>
                <p className="text-[10px] text-slate-400 font-bold font-mono">
                  INTERNAL REVIEW PERIOD {data.reportingYear}
                </p>
              </div>

              {/* Status parameters */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-50 border rounded-lg p-3 text-xs">
                  <span className="text-[11px] uppercase tracking-wider text-slate-400 font-extrabold block">
                    Eligible 1099 payments
                  </span>
                  <p className="text-slate-900 font-black font-mono text-sm mt-0.5">
                    ${stats.reportablePayments.toLocaleString()}
                  </p>
                </div>
                <div className="bg-slate-50 border rounded-lg p-3 text-xs text-right">
                  <span className="text-[11px] uppercase tracking-wider text-slate-400 font-extrabold block">
                    Threshold filers alert
                  </span>
                  <p className="text-amber-700 font-black font-mono text-sm mt-0.5">
                    {stats.aboveThresholdCount} contractors
                  </p>
                </div>
              </div>

              <div className="mb-6 grid grid-cols-2 gap-2 text-[10px] md:grid-cols-3">
                {(
                  [
                    ["Cash tips", stats.boxTotals.cashTips],
                    ["Qualified overtime", stats.boxTotals.qualifiedOvertime],
                    ["Federal withholding", stats.boxTotals.federalWithholding],
                    ["State income", stats.boxTotals.stateIncome],
                    ["State withholding", stats.boxTotals.stateWithholding],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="rounded-lg border bg-slate-50 p-2">
                    <span className="block font-black uppercase text-slate-400">{label}</span>
                    <span className="font-mono font-black text-slate-900">${value.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Threshold alerts contractors listing table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs mb-6">
                <div className="bg-slate-100/50 px-3 py-2 border-b text-[11px] font-black text-slate-900 uppercase">
                  Contractor annual payout sums{" "}
                  {reportingThreshold === null
                    ? "(rules update required)"
                    : `(threshold $${reportingThreshold.toLocaleString()})`}
                </div>

                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[11px] text-slate-400 font-black uppercase">
                    <tr className="border-b">
                      <th className="py-2 px-3">Contractor Name</th>
                      <th className="py-2 px-3">Company Type / DBA</th>
                      <th className="py-2 px-3 text-right">Deduction Sum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendors.map((vend) => {
                      const sum = stats.vendorTotals[vend.id] || 0;
                      return (
                        <tr key={vend.id} className="border-b last:border-0 border-slate-100">
                          <td className="py-3 px-3 font-extrabold text-slate-950">
                            {vend.legalName}
                            {reportingThreshold !== null && sum >= reportingThreshold && (
                              <span className="block text-[11px] text-amber-600 font-bold uppercase tracking-wide pt-0.5">
                                ⚠ threshold reached
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 font-bold">
                              {vend.entityType} {vend.businessName ? `(${vend.businessName})` : ""}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-black text-slate-900">
                            ${sum.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Complete ledgers payment records lists */}
              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs mb-6">
                <div className="bg-slate-100/50 px-3 py-2 border-b text-[11px] font-black text-slate-900 uppercase">
                  complete Ledger Payment record logs
                </div>
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b text-[11px] text-slate-400 font-black uppercase">
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">Contractor Name</th>
                      <th className="py-2 px-3 text-right">Sum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((p, idx) => {
                      const vDetail = vendors.find((vend) => vend.id === p.vendorId);
                      return (
                        <tr key={p.id || idx} className="border-b last:border-0 border-slate-100">
                          <td className="py-2.5 px-3 font-mono text-slate-500">{p.date}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-700">
                            {vDetail ? vDetail.legalName : "Unknown contractor"}
                            {p.description && (
                              <span className="block text-[11px] text-slate-400 font-medium">{p.description}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900">
                            ${Number(p.amount || 0).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="border-t pt-6 mt-12 text-center text-xs text-slate-600 leading-relaxed font-semibold">
                <p className="font-extrabold text-slate-900 uppercase">Internal report disclaimer</p>
                <p className="text-[10px] text-slate-500 max-w-xl mx-auto pt-2">{NEC_INTERNAL_REPORT_DISCLAIMER}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
