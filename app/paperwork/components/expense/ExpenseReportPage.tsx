"use client";

import { PaperworkToolHeader, PaperworkMobileTabs } from "../PaperworkWorkspace";

import { useFormatter, useTranslations } from "next-intl";

import { WorkbenchPanes } from "@/components/tool-workbench/WorkbenchPanes";

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from "react";
import type { DocumentTemplate } from "@/lib/invoice-templates/index.ts";
import {
  FieldError,
  Strong,
  H3,
  H4,
  Overline,
  MetricCard,
  P,
  Text,
  AlertBanner,
  Button,
  ToolActionButton,
  Card,
  Checkbox,
  Input,
  Label,
  Select,
  StatusBadge,
  TabsList,
  TabsTrigger,
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
  Percent,
  CheckCircle,
  HelpCircle,
  Info,
  ChevronRight,
  CheckCircle2,
  Paperclip,
  TrendingUp,
  MapPin,
} from "lucide-react";
import {
  DataBridge,
  DataBridgeKeys,
  BusinessProfile,
  ClientProfile,
  ExpenseRow,
  MileageEntry,
} from "@/lib/paperwork/shared/dataBridge";
import {
  calculateExpenseTotals,
  getExpenseLineTotal,
  normalizeExpenseRows,
  getExpenseMileageTotal,
  importExpenseMileageRows,
  validateExpenseReportData,
} from "@/lib/paperwork/expenseReportRules";
import { expenseReportAdapter } from "@/lib/paperwork/documentAdapters";
import type { MileageLogDraft } from "../mileage/MileageLogPage";
import { csvCell, localDate } from "@/lib/paperwork/exportValues";
import { usePaperworkFeedback } from "../PaperworkFeedback";
import AdvancedTemplateWorkspace from "../AdvancedTemplateWorkspace";

export interface ExpenseReportDraft {
  reportNumber: string;
  title: string;
  reportDate: string;
  startDate: string;
  endDate: string;
  purpose: string;
  projectName: string;
  department: string;
  submitter: {
    name: string;
    email: string;
    phone: string;
    address: string;
  };
  client: {
    name: string;
    contact: string;
    email: string;
    address: string;
  };
  expenses: ExpenseRow[];
  mileageRows: MileageEntry[];
  advanceReceived: number;
  evidenceSummary: string;
  certification: boolean;
  approverName: string;
}

export const DEFAULT_EXPENSE_REPORT_DRAFT: ExpenseReportDraft = {
  reportNumber: `EXP-${new Date().getFullYear()}-001`,
  title: "",
  reportDate: localDate(),
  startDate: localDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
  endDate: localDate(),
  purpose: "",
  projectName: "",
  department: "",
  submitter: {
    name: "",
    email: "",
    phone: "",
    address: "",
  },
  client: {
    name: "",
    contact: "",
    email: "",
    address: "",
  },
  expenses: [],
  mileageRows: [],
  advanceReceived: 0,
  evidenceSummary: "",
  certification: false,
  approverName: "",
};

export const SAMPLE_EXPENSE_REPORT_DRAFT: ExpenseReportDraft = {
  reportNumber: `EXP-2026-039`,
  title: "Seattle Client Pitch Sprint",
  reportDate: localDate(),
  startDate: "2026-05-15",
  endDate: "2026-05-20",
  purpose: "Acme Retail Client Pitch & Onboarding Sprint",
  projectName: "Acme Brand Alignment",
  department: "Client Services",
  submitter: {
    name: "Alex Mercer",
    email: "alex@blueridgeweb.com",
    phone: "+1 (555) 789-1234",
    address: "404 Ridge Point Lane, Asheville, NC 28801",
  },
  client: {
    name: "Acme Retail Co.",
    contact: "Sarah Jenkins",
    email: "billing@acmeretail.com",
    address: "822 Broad Street, Charlotte, NC 28202",
  },
  expenses: [
    {
      id: "row-1",
      date: "2026-05-16",
      merchant: "Alaska Airlines",
      category: "Travel",
      description: "Roundtrip Flight Charlotte -> Seattle",
      paymentMethod: "Card",
      amount: 480.0,
      tax: 35.0,
      tip: 0,
      reimbursable: true,
      billable: true,
      receiptAttached: true,
      receiptName: "alaska_boarding_pass.pdf",
    },
    {
      id: "row-2",
      date: "2026-05-17",
      merchant: "The Westin Seattle",
      category: "Lodging",
      description: "4 Nights Room and Lodging Levy",
      paymentMethod: "Card",
      amount: 720.0,
      tax: 88.0,
      tip: 10.0,
      reimbursable: true,
      billable: true,
      receiptAttached: true,
      receiptName: "westin_invoice_8820.png",
    },
    {
      id: "row-3",
      date: "2026-05-18",
      merchant: "Metropolitan Grill",
      category: "Meals",
      description: "Lunch working session with Acme designers",
      paymentMethod: "Card",
      amount: 145.0,
      tax: 14.5,
      tip: 30.0,
      reimbursable: true,
      billable: false,
      receiptAttached: true,
      receiptName: "met_grill_rec.png",
    },
    {
      id: "row-4",
      date: "2026-05-19",
      merchant: "Figma Inc",
      category: "Software",
      description: "Pro plan subscription premium tier add-on",
      paymentMethod: "Personal funds",
      amount: 15.0,
      tax: 0,
      tip: 0,
      reimbursable: false,
      billable: false,
      receiptAttached: false,
    },
  ],
  mileageRows: [
    {
      id: "mil-1",
      date: "2026-05-17",
      purpose: "Drive Asheville office to CLT Airport terminal",
      startLocation: "Asheville Office",
      destination: "CLT Airport Parking",
      miles: 110,
      rate: 0.725,
      amount: 79.75,
    },
  ],
  advanceReceived: 150.0,
  evidenceSummary: "Three external receipt references recorded (sample data)",
  certification: true,
  approverName: "Jordan Lee",
};

export function normalizeExpenseReportDraft(draft: Partial<ExpenseReportDraft>): ExpenseReportDraft {
  return {
    ...DEFAULT_EXPENSE_REPORT_DRAFT,
    ...draft,
    submitter: {
      ...DEFAULT_EXPENSE_REPORT_DRAFT.submitter,
      ...draft.submitter,
    },
    client: {
      ...DEFAULT_EXPENSE_REPORT_DRAFT.client,
      ...draft.client,
    },
    expenses: normalizeExpenseRows(draft.expenses || DEFAULT_EXPENSE_REPORT_DRAFT.expenses).map((row, index) => ({
      id: row.id || `row-${index}`,
      date: row.date || "",
      merchant: row.merchant || "",
      category: row.category || "Other",
      description: row.description || "",
      paymentMethod: row.paymentMethod || "",
      reimbursable: row.reimbursable ?? false,
      billable: row.billable ?? false,
      receiptAttached: row.receiptAttached ?? false,
      receiptName: row.receiptName || "",
      amount: row.amount,
      tax: row.tax,
      tip: row.tip,
    })),
    mileageRows: (draft.mileageRows || []).map((row, index) => ({
      ...row,
      id: row.id || `mil-${index}`,
      date: row.date || "",
      purpose: row.purpose || "",
      startLocation: row.startLocation || "",
      destination: row.destination || "",
      miles: row.miles ?? 0,
      rate: row.rate ?? 0,
      amount: getExpenseMileageTotal(row),
    })),
    advanceReceived: Number(draft.advanceReceived || 0),
    evidenceSummary: String(draft.evidenceSummary || ""),
    certification: Boolean(draft.certification),
    approverName: String(draft.approverName || ""),
  };
}

export default function ExpenseReportPage({
  onTrackClick,
  templates = [],
  embedded = false,
}: {
  onTrackClick: (item: string) => void;
  templates?: readonly DocumentTemplate[];
  embedded?: boolean;
}) {
  const t = useTranslations("Tool.runtime");
  const format = useFormatter();
  const { notify, confirm: confirmAction } = usePaperworkFeedback();
  const money = (value: number) => format.number(value, { style: "currency", currency: "USD" });
  const [data, setData] = useState<ExpenseReportDraft>(() => {
    return normalizeExpenseReportDraft(DataBridge.get(DataBridgeKeys.EXPENSE_DRAFT, DEFAULT_EXPENSE_REPORT_DRAFT));
  });

  const [selectedTheme, setSelectedTheme] = useState<"classic" | "client" | "travel" | "contractor" | "monthly">(
    "classic",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const [importAvailable, setImportAvailable] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);

  // Auto-save draft
  useEffect(() => {
    DataBridge.set(DataBridgeKeys.EXPENSE_DRAFT, data);
  }, [data]);

  // Sync with Quarterly Tax Estimator (deductible expenses aggregate)
  useEffect(() => {
    const summary = calculateExpenseTotals(data.expenses, data.mileageRows, data.advanceReceived);

    // Save to shared expense summary key
    DataBridge.set("paperworkkit.expenseReport.summary", {
      reportNumber: data.reportNumber,
      title: data.title,
      dateRange: `${data.startDate} to ${data.endDate}`,
      baseAmount: summary.baseAmount,
      taxAmount: summary.taxAmount,
      tipAmount: summary.tipAmount,
      mileageAmount: summary.mileageTotal,
      totalAmount: summary.reportTotal,
      reimbursableAmount: summary.reimbursableTotal,
      billableAmount: summary.billableTotal,
      amountDue: summary.amountDue,
    });
  }, [data]);

  // Check if Mileage Log draft is available for import
  useEffect(() => {
    const mileageData = DataBridge.get<Partial<MileageLogDraft> | null>(DataBridgeKeys.MILEAGE_DRAFT, null);
    if (mileageData && mileageData.trips && mileageData.trips.length > 0) {
      setImportAvailable(true);
    }
  }, []);

  const handleImportMileage = () => {
    const mileageData = DataBridge.get<Partial<MileageLogDraft> | null>(DataBridgeKeys.MILEAGE_DRAFT, null);
    if (!mileageData || !mileageData.trips) return;

    const result = importExpenseMileageRows(data.mileageRows, {
      taxYear: mileageData.taxYear ?? 2026,
      rateMode: mileageData.rateMode ?? "irs-standard",
      customRate: mileageData.customRate ?? 0.725,
      trips: mileageData.trips,
      fuelRecords: mileageData.fuelRecords ?? [],
    });
    if (result.errors.length) {
      notify(result.errors.join(" "), "error");
      return;
    }
    setData({ ...data, mileageRows: result.rows });
    setShowImportConfirm(false);
    onTrackClick("import_mileage_completed");
    notify(
      t("expense.successfullyImportedValueTripsFromYourActiveMileage", { value1: mileageData.trips.length }),
      "success",
    );
  };

  const handleLoadSample = () => {
    setData(SAMPLE_EXPENSE_REPORT_DRAFT);
    onTrackClick("expense_sample_loaded");
  };

  const handleClearDraft = async () => {
    if (await confirmAction(t("expense.areYouSureYouWantToClearThis"))) {
      setData(DEFAULT_EXPENSE_REPORT_DRAFT);
      onTrackClick("expense_draft_cleared");
    }
  };

  const handleAddExpenseRow = () => {
    const newRow: ExpenseRow = {
      id: `row-${Date.now()}`,
      date: localDate(),
      merchant: "",
      category: "Meals",
      description: "",
      paymentMethod: "Card",
      amount: 0,
      tax: 0,
      tip: 0,
      reimbursable: true,
      billable: false,
      receiptAttached: false,
    };
    setData({
      ...data,
      expenses: [...data.expenses, newRow],
    });
    onTrackClick("expense_item_added");
  };

  const handleAddMileageRow = () => {
    const newRow: MileageEntry = {
      id: `mil-${Date.now()}`,
      date: localDate(),
      purpose: "",
      startLocation: "",
      destination: "",
      miles: 0,
      rate: 0,
      amount: 0,
    };
    setData({
      ...data,
      mileageRows: [...data.mileageRows, newRow],
    });
    onTrackClick("expense_mileage_row_added");
  };

  const handleRemoveExpenseRow = (id: string) => {
    setData({
      ...data,
      expenses: data.expenses.filter((r) => r.id !== id),
    });
    onTrackClick("expense_item_removed");
  };

  const handleRemoveMileageRow = (id: string) => {
    setData({
      ...data,
      mileageRows: data.mileageRows.filter((r) => r.id !== id),
    });
    onTrackClick("expense_mileage_row_removed");
  };

  const handleExpenseRowChange = (id: string, field: keyof ExpenseRow, val: any) => {
    const updated = data.expenses.map((item) => {
      if (item.id === id) {
        return {
          ...item,
          [field]: field === "amount" || field === "tax" || field === "tip" ? (val === "" ? 0 : Number(val)) : val,
        };
      }
      return item;
    });
    setData({ ...data, expenses: updated });
  };

  const handleMileageRowChange = (id: string, field: keyof MileageEntry, val: any) => {
    const updated = data.mileageRows.map((item) => {
      if (item.id === id) {
        const uItem = {
          ...item,
          [field]:
            field === "miles" || field === "rate" || field === "parking" || field === "tolls"
              ? val === ""
                ? 0
                : Number(val)
              : val,
        };
        uItem.amount = getExpenseMileageTotal(uItem);
        return uItem;
      }
      return item;
    });
    setData({ ...data, mileageRows: updated });
  };

  const totals = {
    ...calculateExpenseTotals(data.expenses, data.mileageRows, data.advanceReceived),
    receiptCount: data.expenses.filter((expense) => expense.receiptAttached).length,
  };

  // Export CSV Action
  const handleExportCSV = () => {
    onTrackClick("expense_csv_exported");
    if (!validateReport()) return;
    const headers = [
      "Report number",
      "Submitter",
      "Period start",
      "Period end",
      "Currency",
      "Entry type",
      "Date",
      "Merchant / purpose",
      "Category / destination",
      "Description / start location",
      "Payment method",
      "Base amount / miles",
      "Tax / rate",
      "Tip / parking",
      "Tolls",
      "Line total",
      "Reimbursable",
      "Billable",
      "Receipt reference",
      "Advance received",
      "Reimbursement due",
      "Advance to return",
    ];
    const summary = [data.reportNumber, data.submitter.name, data.startDate, data.endDate, "USD"];
    const rows: unknown[][] = [headers];
    data.expenses.forEach((item) =>
      rows.push([
        ...summary,
        "Expense",
        item.date,
        item.merchant,
        item.category,
        item.description,
        item.paymentMethod,
        item.amount,
        item.tax,
        item.tip,
        "",
        getExpenseLineTotal(item),
        item.reimbursable,
        item.billable,
        item.receiptAttached ? item.receiptName || "Reference recorded" : "",
        "",
        "",
        "",
      ]),
    );
    data.mileageRows.forEach((item) =>
      rows.push([
        ...summary,
        "Mileage",
        item.date,
        item.purpose,
        item.destination,
        item.startLocation,
        "",
        item.miles,
        item.rate,
        item.parking || 0,
        item.tolls || 0,
        getExpenseMileageTotal(item),
        true,
        false,
        "",
        "",
        "",
        "",
      ]),
    );
    rows.push([
      ...summary,
      "Summary",
      data.reportDate,
      "",
      "",
      "",
      "",
      totals.baseAmount,
      totals.taxAmount,
      totals.tipAmount,
      "",
      totals.reportTotal,
      "",
      "",
      data.evidenceSummary,
      data.advanceReceived,
      Math.max(0, totals.amountDue),
      Math.max(0, -totals.amountDue),
    ]);
    const content = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");

    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `expense-report-${data.reportNumber}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const validateReport = (): boolean => {
    const newErrors = validateExpenseReportData(data);
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handlePrint = () => {
    onTrackClick("expense_print_clicked");
    if (validateReport()) {
      window.print();
    } else {
      const el = document.getElementById("expense-mobile-tabs") || document.getElementById("expense-report-wrapper");
      el?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const initialDraft = useRef(JSON.stringify(data));
  const hasEdits = JSON.stringify(data) !== initialDraft.current;
  const hasAdvancedTemplate = templates.some(
    (template) =>
      template.documentType === "expense-report" &&
      template.layoutFamily === "advanced" &&
      template.status === "published",
  );

  return (
    <div
      className={embedded ? "min-w-0 w-full p-4 sm:p-5" : "grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"}
      id="expense-report-wrapper"
      data-language-switch-state={hasEdits ? "dirty" : "clean"}
    >
      {/* 1. Page Header banner */}
      <PaperworkToolHeader
        embedded={embedded}
        actions={
          <>
            {importAvailable && (
              <Button onClick={() => setShowImportConfirm(true)} size="sm" type="button" variant="outline">
                <Plus className="size-3.5" />
                <span>{t("expense.importMileageLogs")}</span>
              </Button>
            )}
            <Button onClick={handleLoadSample} size="sm" type="button" variant="secondary">
              <RefreshCw className="size-3.5" />
              <span>{t("expense.loadSample")}</span>
            </Button>
            <Button
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleClearDraft}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("expense.clearBoard")}
            </Button>
            {embedded && (
              <div className="flex flex-wrap gap-2">
                {!hasAdvancedTemplate && (
                  <Button onClick={handlePrint} type="button">
                    <Printer className="w-4 h-4" />
                    <span>{t("expense.printSavePdf")}</span>
                  </Button>
                )}
                <ToolActionButton action="download" onClick={handleExportCSV} type="button">
                  <span>{t("expense.exportCsv")}</span>
                </ToolActionButton>
              </div>
            )}
          </>
        }
        className="print:hidden"
        description={t("expense.categorizeCorporatePurchasesReconcileItemLogsAndFormulate")}
        eyebrow={<StatusBadge variant="info">{t("expense.corporateReimbursementTrack")}</StatusBadge>}
        title={t("expense.expenseReportGenerator")}
      />

      {/* 2. Import Dialog Popup overlay */}
      {showImportConfirm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md gap-4 rounded-2xl shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                <MapPin className="w-5 h-5" />
              </div>
              <H4 className="text-slate-900">{t("expense.importMileageLogEntries")}</H4>
            </div>
            <P className="text-slate-600">{t("expense.thisRoutineReadsYourActiveMileageLogDraft")}</P>
            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={() => setShowImportConfirm(false)} size="sm" type="button" variant="secondary">
                {t("expense.cancel")}
              </Button>
              <Button onClick={handleImportMileage} size="sm" type="button">
                {t("expense.yesAppendMileageRows")}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* 3. Mobile tabs mapping */}
      <PaperworkMobileTabs
        className="mb-4 lg:hidden print:hidden"
        id="expense-mobile-view-tabs"
        onValueChange={(value) => setActiveTab(value as "edit" | "preview")}
        value={activeTab}
      >
        <TabsList className="grid w-full grid-cols-2 border border-slate-200/50" variant="segmented">
          <TabsTrigger className="whitespace-normal py-1.5" value="edit">
            {t("expense.label1EditItems")}
          </TabsTrigger>
          <TabsTrigger className="whitespace-normal py-1.5" value="preview">
            {t("expense.label2PdfPrintView")}
          </TabsTrigger>
        </TabsList>
      </PaperworkMobileTabs>

      {/* 4. Split Screen layout */}
      <WorkbenchPanes
        singlePaneDisplay="block"
        className={
          embedded
            ? "grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-12"
            : "grid grid-cols-1 items-start gap-8 lg:grid-cols-12"
        }
      >
        {/* LEFT COLUMN: THE REPORT DATA INPUTS */}
        <div
          className={`min-w-0 lg:col-span-7 space-y-4 ${activeTab === "edit" ? "block" : "hidden lg:block"} print:hidden`}
        >
          <Card className={embedded ? "gap-4 p-4 shadow-sm" : "gap-6 rounded-2xl p-6 shadow-sm"}>
            {/* Report Metadata segment */}
            <div>
              <H3 className="text-slate-500 border-b border-slate-100 pb-2 mb-4">
                {t("expense.label1ReportConfiguration")}
              </H3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <Label className="block text-slate-400 mb-1" htmlFor="expense-report-title">
                    {t("expense.reportTitlePurpose")}
                  </Label>
                  <Input
                    type="text"
                    required
                    id="expense-report-title"
                    value={data.title}
                    onChange={(e) => setData({ ...data, title: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="expense-report-number">
                    {t("expense.reportNumber")}
                  </Label>
                  <Input
                    type="text"
                    id="expense-report-number"
                    aria-invalid={Boolean(errors["reportNumber"])}
                    aria-describedby={errors["reportNumber"] ? "expense-report-number-error" : undefined}
                    value={data.reportNumber}
                    onChange={(e) => setData({ ...data, reportNumber: e.target.value })}
                  />
                  {errors["reportNumber"] && (
                    <FieldError id="expense-report-number-error">{errors["reportNumber"]}</FieldError>
                  )}
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="expense-report-date">
                    {t("expense.reportIssueDate")}
                  </Label>
                  <Input
                    type="date"
                    id="expense-report-date"
                    aria-invalid={Boolean(errors["reportDate"])}
                    aria-describedby={errors["reportDate"] ? "expense-report-date-error" : undefined}
                    value={data.reportDate}
                    onChange={(e) => setData({ ...data, reportDate: e.target.value })}
                  />
                  {errors["reportDate"] && (
                    <FieldError id="expense-report-date-error">{errors["reportDate"]}</FieldError>
                  )}
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="expense-period-start">
                    {t("expense.periodStart")}
                  </Label>
                  <Input
                    type="date"
                    id="expense-period-start"
                    aria-invalid={Boolean(errors["startDate"])}
                    aria-describedby={errors["startDate"] ? "expense-period-start-error" : undefined}
                    value={data.startDate}
                    onChange={(e) => setData({ ...data, startDate: e.target.value })}
                  />
                  {errors["startDate"] && (
                    <FieldError id="expense-period-start-error">{errors["startDate"]}</FieldError>
                  )}
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="expense-period-end">
                    {t("expense.periodEnd")}
                  </Label>
                  <Input
                    type="date"
                    id="expense-period-end"
                    aria-invalid={Boolean(errors["endDate"])}
                    aria-describedby={errors["endDate"] ? "expense-period-end-error" : undefined}
                    value={data.endDate}
                    onChange={(e) => setData({ ...data, endDate: e.target.value })}
                  />
                  {errors["endDate"] && <FieldError id="expense-period-end-error">{errors["endDate"]}</FieldError>}
                </div>
              </div>
            </div>

            {/* Submitter Info Grid */}
            <div>
              <H3 className="text-slate-500 border-b border-slate-100 pb-2 mb-4">
                {t("expense.label2SubmitterEmployeeContractor")}
              </H3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="expense-submitter-name">
                    {t("expense.legalName")}
                  </Label>
                  <Input
                    aria-errormessage={errors["submitter.name"] ? "expense-submitter-name-error" : undefined}
                    type="text"
                    placeholder={t("expense.eGAlexMercer")}
                    aria-invalid={Boolean(errors["submitter.name"])}
                    className={` ${errors["submitter.name"] ? "bg-destructive/5" : ""}`}
                    id="expense-submitter-name"
                    value={data.submitter.name}
                    onChange={(e) => {
                      setData({ ...data, submitter: { ...data.submitter, name: e.target.value } });
                      if (errors["submitter.name"]) setErrors((prev) => ({ ...prev, "submitter.name": "" }));
                    }}
                  />
                  {errors["submitter.name"] && (
                    <FieldError className="mt-1 text-destructive" id="expense-submitter-name-error" role="alert">
                      {errors["submitter.name"]}
                    </FieldError>
                  )}
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="expense-submitter-email">
                    {t("expense.emailCoordinates")}
                  </Label>
                  <Input
                    type="email"
                    placeholder={t("expense.alexBrandCom")}
                    id="expense-submitter-email"
                    value={data.submitter.email}
                    onChange={(e) => setData({ ...data, submitter: { ...data.submitter, email: e.target.value } })}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="block text-slate-400 mb-1" htmlFor="expense-department">
                    {t("expense.corporateDepartmentTeam")}
                  </Label>
                  <Input
                    type="text"
                    placeholder={t("expense.eGClientSolutionsGroup")}
                    id="expense-department"
                    value={data.department}
                    onChange={(e) => setData({ ...data, department: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Parent Association or Target Client Coordinates */}
            <div>
              <H3 className="text-slate-500 border-b border-slate-100 pb-2 mb-4">
                {t("expense.label3ReimbursementEntityCompanyClient")}
              </H3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="expense-client-name">
                    {t("expense.companyClientName")}
                  </Label>
                  <Input
                    type="text"
                    placeholder={t("expense.eGAcmeRetailCorp")}
                    id="expense-client-name"
                    value={data.client.name}
                    onChange={(e) => setData({ ...data, client: { ...data.client, name: e.target.value } })}
                  />
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="expense-client-contact">
                    {t("expense.pointOfContact")}
                  </Label>
                  <Input
                    type="text"
                    placeholder={t("expense.sarahJenkins")}
                    id="expense-client-contact"
                    value={data.client.contact}
                    onChange={(e) => setData({ ...data, client: { ...data.client, contact: e.target.value } })}
                  />
                </div>
              </div>
            </div>

            {/* Expense Itemization table */}
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-4">
                <H3 className="text-slate-500">{t("expense.label4PurchaseItemization")}</H3>
                <Button onClick={handleAddExpenseRow} size="sm" type="button">
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t("expense.addPurchase")}</span>
                </Button>
              </div>

              <div className="space-y-4">
                {data.expenses.map((row, index) => (
                  <div
                    key={row.id}
                    className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl space-y-3 relative"
                  >
                    <Button
                      aria-label={t("expense.removeExpenseFromValue", { value1: row.merchant || `row ${index + 1}` })}
                      className="absolute right-2 top-2 text-slate-400 hover:text-rose-600"
                      onClick={() => handleRemoveExpenseRow(row.id)}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="w-4.5 h-4.5" />
                    </Button>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <Label className="block text-slate-400 mb-0.5" htmlFor={`expense-row-${row.id}-date`}>
                          {t("expense.date")}
                        </Label>
                        <Input
                          type="date"
                          id={`expense-row-${row.id}-date`}
                          aria-invalid={Boolean(errors[`expenses[${index}].date`])}
                          aria-describedby={
                            errors[`expenses[${index}].date`] ? `expense-row-${row.id}-date-error` : undefined
                          }
                          value={row.date}
                          onChange={(e) => handleExpenseRowChange(row.id, "date", e.target.value)}
                        />
                        {errors[`expenses[${index}].date`] && (
                          <FieldError id={`expense-row-${row.id}-date-error`}>
                            {errors[`expenses[${index}].date`]}
                          </FieldError>
                        )}
                      </div>
                      <div>
                        <Label className="block text-slate-400 mb-0.5" htmlFor={`expense-row-${row.id}-merchant`}>
                          {t("expense.merchantVendor")}
                        </Label>
                        <Input
                          type="text"
                          placeholder={t("expense.amazonShellEtc")}
                          id={`expense-row-${row.id}-merchant`}
                          aria-invalid={Boolean(errors[`expenses[${index}].merchant`])}
                          aria-describedby={
                            errors[`expenses[${index}].merchant`] ? `expense-row-${row.id}-merchant-error` : undefined
                          }
                          value={row.merchant}
                          onChange={(e) => handleExpenseRowChange(row.id, "merchant", e.target.value)}
                        />
                        {errors[`expenses[${index}].merchant`] && (
                          <FieldError id={`expense-row-${row.id}-merchant-error`}>
                            {errors[`expenses[${index}].merchant`]}
                          </FieldError>
                        )}
                      </div>
                      <div>
                        <Label className="block text-slate-400 mb-0.5" htmlFor={`expense-row-${row.id}-category`}>
                          {t("expense.expenseCategory")}
                        </Label>
                        <Select
                          id={`expense-row-${row.id}-category`}
                          value={row.category}
                          onChange={(e) => handleExpenseRowChange(row.id, "category", e.target.value)}
                        >
                          <option value="Meals">{t("expense.mealsDinner")}</option>
                          <option value="Travel">{t("expense.flightsTravel")}</option>
                          <option value="Lodging">{t("expense.lodgingHotel")}</option>
                          <option value="Office supplies">{t("expense.officeSupplies")}</option>
                          <option value="Software">{t("expense.softwareSubscription")}</option>
                          <option value="Equipment">{t("expense.hardwareGear")}</option>
                          <option value="Phone/internet">{t("expense.phoneWifi")}</option>
                          <option value="Client materials">{t("expense.clientMaterials")}</option>
                          <option value="Other">{t("expense.otherExpenses")}</option>
                        </Select>
                      </div>
                      <div>
                        <Label className="block text-slate-500 mb-0.5" htmlFor={`expense-row-${row.id}-amount`}>
                          {t("expense.purchaseAmount")}
                        </Label>
                        <Input
                          type="number"
                          placeholder="0.00"
                          id={`expense-row-${row.id}-amount`}
                          aria-invalid={Boolean(errors[`expenses[${index}].amount`])}
                          aria-describedby={
                            errors[`expenses[${index}].amount`] ? `expense-row-${row.id}-amount-error` : undefined
                          }
                          value={row.amount}
                          onChange={(e) => handleExpenseRowChange(row.id, "amount", e.target.value)}
                        />
                        {errors[`expenses[${index}].amount`] && (
                          <FieldError id={`expense-row-${row.id}-amount-error`}>
                            {errors[`expenses[${index}].amount`]}
                          </FieldError>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label className="block text-slate-400 mb-0.5" htmlFor={`expense-row-${row.id}-tax`}>
                          {t("expense.tax")}
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          id={`expense-row-${row.id}-tax`}
                          aria-invalid={Boolean(errors[`expenses[${index}].tax`])}
                          aria-describedby={
                            errors[`expenses[${index}].tax`] ? `expense-row-${row.id}-tax-error` : undefined
                          }
                          value={row.tax}
                          onChange={(e) => handleExpenseRowChange(row.id, "tax", e.target.value)}
                        />
                        {errors[`expenses[${index}].tax`] && (
                          <FieldError id={`expense-row-${row.id}-tax-error`}>
                            {errors[`expenses[${index}].tax`]}
                          </FieldError>
                        )}
                      </div>
                      <div>
                        <Label className="block text-slate-400 mb-0.5" htmlFor={`expense-row-${row.id}-tip`}>
                          {t("expense.tip")}
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          id={`expense-row-${row.id}-tip`}
                          aria-invalid={Boolean(errors[`expenses[${index}].tip`])}
                          aria-describedby={
                            errors[`expenses[${index}].tip`] ? `expense-row-${row.id}-tip-error` : undefined
                          }
                          value={row.tip}
                          onChange={(e) => handleExpenseRowChange(row.id, "tip", e.target.value)}
                        />
                        {errors[`expenses[${index}].tip`] && (
                          <FieldError id={`expense-row-${row.id}-tip-error`}>
                            {errors[`expenses[${index}].tip`]}
                          </FieldError>
                        )}
                      </div>
                      <div>
                        <Overline className="block text-slate-400 mb-0.5">{t("expense.lineTotal")}</Overline>
                        <output className="flex min-h-10 items-center text-slate-900">
                          <Strong>
                            {format.number(getExpenseLineTotal(row), { style: "currency", currency: "USD" })}
                          </Strong>
                        </output>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-1">
                      <div className="md:col-span-6">
                        <Input
                          aria-label={t("expense.expenseValueNotes", { value1: index + 1 })}
                          type="text"
                          placeholder={t("expense.additionalDetailedNotes")}
                          value={row.description}
                          onChange={(e) => handleExpenseRowChange(row.id, "description", e.target.value)}
                        />
                      </div>
                      <div className="md:col-span-6 flex flex-wrap gap-4 items-center justify-end text-slate-600">
                        <Checkbox
                          checked={row.reimbursable}
                          className="min-h-0 items-center gap-1.5 [&_[data-slot=checkbox]]:size-3.5"
                          label={t("expense.reimbursable")}
                          onCheckedChange={(checked) =>
                            handleExpenseRowChange(row.id, "reimbursable", checked === true)
                          }
                        />
                        <Checkbox
                          checked={row.billable}
                          className="min-h-0 items-center gap-1.5 [&_[data-slot=checkbox]]:size-3.5"
                          label={t("expense.billClient")}
                          onCheckedChange={(checked) => handleExpenseRowChange(row.id, "billable", checked === true)}
                        />
                        <Checkbox
                          checked={row.receiptAttached}
                          className="min-h-0 items-center gap-1.5 [&_[data-slot=checkbox]]:size-3.5"
                          label={t("expense.receiptFile")}
                          onCheckedChange={(checked) =>
                            handleExpenseRowChange(row.id, "receiptAttached", checked === true)
                          }
                        />
                      </div>
                    </div>

                    {row.receiptAttached && (
                      <div className="bg-white/80 border border-dashed border-slate-200 px-3 py-1.5 rounded-lg text-slate-500 flex items-center justify-between">
                        <Text className="flex items-center gap-1">
                          <Paperclip className="w-3 h-3 text-slate-400" />
                          <Text>
                            {t("expense.receiptReference", {
                              name: row.receiptName || t("expense.purchaseReceiptReferenceJpg"),
                            })}
                          </Text>
                        </Text>
                        <Input
                          aria-label={t("expense.receiptLabelForExpenseValue", { value1: index + 1 })}
                          type="text"
                          required
                          placeholder={t("expense.editLabel")}
                          className="h-8 max-w-32"
                          value={row.receiptName || ""}
                          onChange={(e) => handleExpenseRowChange(row.id, "receiptName", e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <P className="text-muted-foreground">{t("expense.evidenceReferenceOnly")}</P>
            {/* Mileage Block entries */}
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-4">
                <div className="flex items-center gap-1.5">
                  <H3 className="text-slate-500">{t("expense.label5DrivenMileageRows")}</H3>
                  <StatusBadge variant="neutral">{t("expense.perRowRate")}</StatusBadge>
                </div>
                <Button onClick={handleAddMileageRow} size="sm" type="button">
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t("expense.addMileage")}</span>
                </Button>
              </div>

              {data.mileageRows.length === 0 ? (
                <div className="text-center py-6 bg-slate-50 border border-dashed rounded-xl text-slate-400">
                  <Text>{t("expense.noMileageRecordsRegisteredReconcileTripLogsUsing")}</Text>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.mileageRows.map((mRow, mileageIndex) => (
                    <div
                      key={mRow.id}
                      className="bg-slate-50/60 border rounded-lg p-3 relative flex flex-col md:flex-row gap-3"
                    >
                      <Button
                        aria-label={t("expense.removeMileageRow")}
                        className="absolute right-2 top-2 text-slate-400 hover:text-rose-600"
                        onClick={() => handleRemoveMileageRow(mRow.id)}
                        size="icon-xs"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>

                      <div
                        className="grow grid grid-cols-2 md:grid-cols-5 gap-2"
                        aria-describedby={`expense-mileage-${mRow.id}-errors`}
                      >
                        <div>
                          <Label className="block text-slate-400" htmlFor={`expense-mileage-${mRow.id}-date`}>
                            {t("expense.date2")}
                          </Label>
                          <Input
                            type="date"
                            id={`expense-mileage-${mRow.id}-date`}
                            value={mRow.date}
                            onChange={(e) => handleMileageRowChange(mRow.id, "date", e.target.value)}
                          />
                        </div>
                        <div className="col-span-2">
                          <Label className="block text-slate-400" htmlFor={`expense-mileage-${mRow.id}-purpose`}>
                            {t("expense.tripPurpose")}
                          </Label>
                          <Input
                            type="text"
                            placeholder={t("expense.eGTravelToCltAirportTerminal")}
                            id={`expense-mileage-${mRow.id}-purpose`}
                            value={mRow.purpose}
                            onChange={(e) => handleMileageRowChange(mRow.id, "purpose", e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="block text-slate-400" htmlFor={`expense-mileage-${mRow.id}-miles`}>
                            {t("expense.drivenMiles")}
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            id={`expense-mileage-${mRow.id}-miles`}
                            value={mRow.miles}
                            onChange={(e) => handleMileageRowChange(mRow.id, "miles", e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="block text-slate-400" htmlFor={`expense-mileage-${mRow.id}-rate`}>
                            {t("expense.rateMile")}
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.001"
                            id={`expense-mileage-${mRow.id}-rate`}
                            value={mRow.rate}
                            onChange={(e) => handleMileageRowChange(mRow.id, "rate", e.target.value)}
                          />
                        </div>
                        <div className="col-span-full" id={`expense-mileage-${mRow.id}-errors`}>
                          {Object.entries(errors)
                            .filter(([key, message]) => key.startsWith(`mileageRows[${mileageIndex}]`) && message)
                            .map(([key, message]) => (
                              <FieldError key={key}>{message}</FieldError>
                            ))}
                        </div>
                        {(["startLocation", "destination"] as const).map((field) => (
                          <div key={field}>
                            <Label htmlFor={`expense-mileage-${mRow.id}-${field}`}>{t(`expense.${field}`)}</Label>
                            <Input
                              id={`expense-mileage-${mRow.id}-${field}`}
                              value={mRow[field]}
                              onChange={(e) => handleMileageRowChange(mRow.id, field, e.target.value)}
                            />
                          </div>
                        ))}
                        {(["parking", "tolls"] as const).map((field) => (
                          <div key={field}>
                            <Label htmlFor={`expense-mileage-${mRow.id}-${field}`}>{t(`expense.${field}`)}</Label>
                            <Input
                              id={`expense-mileage-${mRow.id}-${field}`}
                              type="number"
                              min={0}
                              step="0.01"
                              value={mRow[field] || 0}
                              onChange={(e) => handleMileageRowChange(mRow.id, field, e.target.value)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Float Adjustment advance */}
            <div>
              <H3 className="text-slate-500 border-b border-slate-100 pb-2 mb-4">
                {t("expense.label6CorporateAdvanceReceived")}
              </H3>
              <div className="max-w-xs">
                <Label className="block text-slate-400 mb-1" htmlFor="expense-advance">
                  {t("expense.prePaidAdvance")}
                </Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  id="expense-advance"
                  aria-invalid={Boolean(errors["advanceReceived"])}
                  aria-describedby={errors["advanceReceived"] ? "expense-advance-error" : undefined}
                  value={data.advanceReceived}
                  onChange={(e) => setData({ ...data, advanceReceived: Math.max(0, Number(e.target.value)) })}
                />
                {errors["advanceReceived"] && (
                  <FieldError id="expense-advance-error">{errors["advanceReceived"]}</FieldError>
                )}
              </div>
            </div>
          </Card>

          {/* Compliance Info Banner */}
          <AlertBanner title={t("expense.reimbursementPolicyWarning")} variant="info">
            {t("expense.thisDocumentStructuresOperatingWriteOffsUnderIrs")}
          </AlertBanner>
        </div>

        {/* RIGHT COLUMN: PREVIEW ACTION TRIGGER BAR */}
        <div
          className={`min-w-0 lg:col-span-5 space-y-4 lg:sticky print:static print:block ${embedded ? "lg:top-0" : "lg:top-20"} ${activeTab === "preview" ? "block" : "hidden lg:block"}`}
        >
          <MetricCard
            className="min-w-0 p-3 print:hidden [&_[data-slot=typography-metric]]:break-all"
            label={totals.amountDue < 0 ? t("expense.advanceToReturn") : t("expense.reimbursementDue")}
            value={money(Math.abs(totals.amountDue))}
          />
          <AdvancedTemplateWorkspace
            mode="export"
            alwaysShowPreview
            adapter={expenseReportAdapter}
            draft={data}
            onDraftChange={setData}
            onTrackClick={onTrackClick}
            templates={templates}
          />

          {!embedded && (
            <Card className="gap-3 rounded-2xl p-4 shadow-sm print:hidden">
              <div className="flex items-center justify-between text-slate-500 border-b border-slate-100 pb-2">
                <Text>{t("expense.reportActionsPanel")}</Text>
                <StatusBadge variant="info">{t("expense.readyToPrint")}</StatusBadge>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {!hasAdvancedTemplate && (
                  <Button className="w-full" onClick={handlePrint} type="button">
                    <Printer className="w-4 h-4" />
                    <span>{t("expense.printSavePdf")}</span>
                  </Button>
                )}
                <ToolActionButton action="download" onClick={handleExportCSV} type="button">
                  <span>{t("expense.exportCsv")}</span>
                </ToolActionButton>
              </div>
            </Card>
          )}
          {/* Simulated Printed Letter Sheet Page */}
          {!hasAdvancedTemplate && (
            <div className="relative group transition-all duration-200 border border-slate-200 shadow-2xl rounded-2xl">
              <div
                className="p-8 bg-white min-h-0 print:min-h-[750px] font-sans text-slate-800"
                id="receipt-print-area"
                dir="ltr"
              >
                <div className="flex justify-between items-start border-b border-slate-200 pb-4 mb-6">
                  <div>
                    <span className="text-[10px] font-black text-blue-600 block uppercase tracking-wider">
                      EXPENSE RECONCILIATION STATEMENT
                    </span>
                    <h1 className="text-xl font-black text-slate-950 uppercase mt-0.5">
                      {data.title || "EXPENSE REPORT"}
                    </h1>
                    <span className="text-[10px] text-slate-500 font-bold block font-mono mt-1">
                      Report Period: {data.startDate} to {data.endDate}
                    </span>
                  </div>

                  <div className="text-right font-mono">
                    <div className="inline-block px-2.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-sans font-bold text-[10px] text-slate-900 uppercase">
                      {data.reportNumber}
                    </div>
                    <span className="block text-[10px] text-slate-400 mt-2 font-bold">
                      Issue Date: {data.reportDate}
                    </span>
                  </div>
                </div>

                {/* Submitter & Client columns */}
                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div className="bg-slate-50/60 p-3 rounded-lg border border-slate-100 text-xs">
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 font-extrabold block mb-0.5">
                      {t("expense.legalName")}
                    </span>
                    <span className="font-extrabold text-slate-900 block">
                      {data.submitter.name || "------------------"}
                    </span>
                    {data.department && (
                      <span className="text-[10px] text-slate-500 font-bold block">
                        {t("expense.corporateDepartmentTeam")}: {data.department}
                      </span>
                    )}
                    {data.submitter.email && (
                      <span className="block font-mono text-slate-400 text-[10px] pt-1">{data.submitter.email}</span>
                    )}
                  </div>

                  <div className="bg-slate-50/60 p-3 rounded-lg border border-slate-100 text-xs">
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 font-extrabold block mb-0.5">
                      {t("expense.companyClientName")}
                    </span>
                    <span className="font-extrabold text-slate-900 block">
                      {data.client.name || "------------------"}
                    </span>
                    {data.client.contact && (
                      <span className="text-[10px] text-slate-500 font-bold block">
                        {t("expense.pointOfContact")}: {data.client.contact}
                      </span>
                    )}
                    {data.projectName && (
                      <span className="text-[10px] text-blue-700 font-bold block pt-1 font-mono">
                        {t("expense.reportTitlePurpose")}: {data.projectName}
                      </span>
                    )}
                  </div>
                </div>

                {/* Purchases table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden mb-6 text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-400">
                      <tr>
                        <th className="py-2 px-3">{t("expense.date2")}</th>
                        <th className="py-2 px-3">{t("expense.merchantVendor")}</th>
                        <th className="py-2 px-3">{t("expense.expenseCategory")}</th>
                        <th className="py-2 px-3 text-right">{t("expense.lineTotal")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.expenses.map((row, idx) => (
                        <tr key={row.id || idx} className="border-b last:border-0 border-slate-100">
                          <td className="py-3 px-3 font-mono font-medium text-slate-500">{row.date}</td>
                          <td className="py-3 px-3 font-bold text-slate-900">
                            {row.merchant || "Vendor Purchase"}
                            {row.receiptAttached && (
                              <span className="block text-[11px] text-emerald-600 font-mono font-bold pt-0.5 uppercase tracking-wide">
                                ✓ Receipt Attached
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 font-bold">
                              {row.category}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                            {money(getExpenseLineTotal(row))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mileage Table (if entries present) */}
                {data.mileageRows.length > 0 && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden mb-6 text-xs">
                    <div className="bg-slate-100/50 px-3 py-2 border-b border-slate-200 text-[10px] font-black text-slate-900 tracking-wider uppercase">
                      Driven Log Mileage write-offs
                    </div>
                    <table className="w-full text-left">
                      <thead className="bg-slate-50/70 text-[11px] font-black text-slate-400 uppercase">
                        <tr className="border-b border-slate-200">
                          <th className="py-1.5 px-3">{t("expense.date2")}</th>
                          <th className="py-1.5 px-3">{t("expense.tripPurpose")}</th>
                          <th className="py-1.5 px-3 text-center">{t("expense.drivenMiles")}</th>
                          <th className="py-1.5 px-3 text-right">{t("expense.reimbursementDue")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.mileageRows.map((mRow, idx) => (
                          <tr key={mRow.id || idx} className="border-b last:border-b-0 border-slate-100">
                            <td className="py-2 px-3 font-mono text-slate-500">{mRow.date}</td>
                            <td className="py-2 px-3 font-semibold text-slate-800 leading-snug">{mRow.purpose}</td>
                            <td className="py-2 px-3 text-center font-bold text-slate-500 font-mono">
                              {mRow.miles} mi
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                              {money(getExpenseMileageTotal(mRow))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Summary Totals reconciliations */}
                <div className="grid grid-cols-12 gap-4 pt-2">
                  {/* Category breakdown summaries block */}
                  <div className="col-span-6 space-y-1">
                    <span className="text-[11px] uppercase tracking-widest text-slate-400 font-extrabold block mb-1">
                      {t("expense.expenseCategory")}
                    </span>
                    {Object.entries(totals.categoryTotals).map(([cat, val]) => (
                      <div key={cat} className="flex justify-between text-[10px] font-bold text-slate-500 max-w-xs">
                        <span>{cat}:</span>
                        <span className="font-mono">{money(val)}</span>
                      </div>
                    ))}
                    {totals.totalMiles > 0 && (
                      <div className="flex justify-between text-[10px] font-bold text-emerald-600 max-w-xs pt-1 border-t border-dashed">
                        <span>{t("expense.label5DrivenMileageRows")}</span>
                        <span className="font-mono">{money(totals.mileageTotal)}</span>
                      </div>
                    )}
                  </div>

                  {/* Subtotals Block */}
                  <div className="col-span-6 text-right space-y-2 text-xs font-semibold">
                    <div className="flex justify-between font-mono">
                      <span className="text-slate-500">{t("expense.baseAmount")}:</span>
                      <span className="text-slate-800">{money(totals.baseAmount)}</span>
                    </div>
                    <div className="flex justify-between font-mono">
                      <span className="text-slate-500">{t("expense.tax")}:</span>
                      <span className="text-slate-800">{money(totals.taxAmount)}</span>
                    </div>
                    <div className="flex justify-between font-mono">
                      <span className="text-slate-500">{t("expense.tip")}:</span>
                      <span className="text-slate-800">{money(totals.tipAmount)}</span>
                    </div>
                    <div className="flex justify-between font-mono">
                      <span className="text-slate-500">{t("expense.expenseTotal")}:</span>
                      <span className="text-slate-800">{money(totals.expenseTotal)}</span>
                    </div>
                    {totals.totalMiles > 0 && (
                      <div className="flex justify-between font-mono">
                        <span className="text-slate-500">{t("expense.label5DrivenMileageRows")}</span>
                        <span className="text-slate-800">{money(totals.mileageTotal)}</span>
                      </div>
                    )}
                    {data.advanceReceived > 0 && (
                      <div className="flex justify-between font-mono text-rose-600">
                        <span>{t("expense.prePaidAdvance")}</span>
                        <span>-{money(Number(data.advanceReceived))}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center border-t border-slate-200 pt-2.5 mt-2">
                      <span className="text-xs uppercase font-black text-slate-900">
                        {totals.amountDue < 0 ? t("expense.advanceToReturn") : t("expense.reimbursementDue")}
                      </span>
                      <span className="text-lg font-black text-slate-950 font-mono">
                        {money(Math.abs(totals.amountDue))}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Approval / Auditor Signature lines */}
                <div className="grid grid-cols-2 gap-8 mt-12 pt-8 border-t border-slate-100 text-center leading-normal">
                  <div className="space-y-4">
                    <div className="border-b border-slate-300 h-8" />
                    <span className="block text-[11px] uppercase font-bold text-slate-400">
                      {t("expense.legalName")}
                    </span>
                  </div>
                  <div className="space-y-4">
                    <div className="border-b border-slate-300 h-8" />
                    <span className="block text-[11px] uppercase font-bold text-slate-400">
                      {t("expense.approver")}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </WorkbenchPanes>

      <div className="print:hidden" aria-live="polite">
        {Object.entries(errors)
          .filter(([, reason]) => reason)
          .map(([field, reason]) => (
            <FieldError key={field}>
              {field}: {reason}
            </FieldError>
          ))}
      </div>
      {/* SEO Faq block */}
      {!embedded && (
        <div
          className="mt-16 border-t border-slate-200/80 pt-12 max-w-4xl mx-auto space-y-6 print:hidden"
          id="expense-seo-faq"
        >
          <H3 className="text-slate-900 text-center">{t("expense.frequentlyAnsweredCorporateQuestions")}</H3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-slate-600">
            <div className="space-y-1">
              <H4 className="text-slate-900">{t("expense.howDoIExportMyExpensesSummaryFor")}</H4>
              <P>{t("expense.simplyClickTheExportCsvOptionToSerialize")}</P>
            </div>
            <div className="space-y-1">
              <H4 className="text-slate-900">{t("expense.howDoesPrePaidAdvanceCalculationBehave")}</H4>
              <P>{t("expense.ifYourCorporateOfficeAlreadyWiredCashFor")}</P>
            </div>
            <div className="space-y-1">
              <H4 className="text-slate-900">{t("expense.areReceiptsFilesUploadedOntoAnyCloudDatabase")}</H4>
              <P>{t("expense.noAbsolutelyNoneYourAssetsRemainLocalUnder")}</P>
            </div>
            <div className="space-y-1">
              <H4 className="text-slate-900">{t("expense.isThisSoftwareCompliantWithIrsPublicationGuidelines")}</H4>
              <P>{t("expense.itHelpsContractorsItemizeOperationalMetricsClearlySince")}</P>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
