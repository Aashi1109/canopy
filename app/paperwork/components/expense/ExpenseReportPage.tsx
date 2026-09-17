"use client";

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import type { DocumentTemplate } from "@canopy/invoice-templates";
import {
  FieldError,
  Strong,
  H3,
  H4,
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
  Select,
  StatusBadge,
  Tabs,
  TabsList,
  TabsTrigger,
  ToolPageHeader,
} from "@canopy/ui";
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
import { calculateExpenseTotals, getExpenseLineTotal, normalizeExpenseRows } from "@/lib/paperwork/expenseReportRules";
import { expenseReportAdapter } from "@/lib/paperwork/documentAdapters";
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
  title: "Monthly Operating Expenses",
  reportDate: new Date().toISOString().substring(0, 10),
  startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
  endDate: new Date().toISOString().substring(0, 10),
  purpose: "General Business Supplies",
  projectName: "",
  department: "Product Marketing",
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
  expenses: [
    {
      id: "row-1",
      date: new Date().toISOString().substring(0, 10),
      merchant: "Amazon Business",
      category: "Office supplies",
      description: "Heavy duty USB hubs & desk adapters",
      paymentMethod: "Card",
      amount: 89.9,
      tax: 6.2,
      tip: 0,
      reimbursable: true,
      billable: false,
      receiptAttached: true,
      receiptName: "amazon_usb_invoice_cover.png",
    },
  ],
  mileageRows: [],
  advanceReceived: 0,
  evidenceSummary: "",
  certification: false,
  approverName: "",
};

export const SAMPLE_EXPENSE_REPORT_DRAFT: ExpenseReportDraft = {
  reportNumber: `EXP-2026-039`,
  title: "Seattle Client Pitch Sprint",
  reportDate: new Date().toISOString().substring(0, 10),
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
  evidenceSummary: "Three receipts attached",
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
    expenses: normalizeExpenseRows(draft.expenses || DEFAULT_EXPENSE_REPORT_DRAFT.expenses) as ExpenseRow[],
    mileageRows: draft.mileageRows || [],
    advanceReceived: Number(draft.advanceReceived || 0),
    evidenceSummary: String(draft.evidenceSummary || ""),
    certification: Boolean(draft.certification),
    approverName: String(draft.approverName || ""),
  };
}

export default function ExpenseReportPage({
  onTrackClick,
  templates = [],
}: {
  onTrackClick: (item: string) => void;
  templates?: readonly DocumentTemplate[];
}) {
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
    const mileageData = DataBridge.get<any | null>(DataBridgeKeys.MILEAGE_DRAFT, null);
    if (mileageData && mileageData.trips && mileageData.trips.length > 0) {
      setImportAvailable(true);
    }
  }, []);

  const handleImportMileage = () => {
    const mileageData = DataBridge.get<any | null>(DataBridgeKeys.MILEAGE_DRAFT, null);
    if (!mileageData || !mileageData.trips) return;

    // Convert trips into Mileage entries suitable for the expense report
    const mapped: MileageEntry[] = mileageData.trips.map((trip: any, index: number) => ({
      id: trip.id || `mil-imported-${index}`,
      date: trip.date,
      purpose: trip.purpose,
      startLocation: trip.startLocation || "",
      destination: trip.destination || "",
      startOdometer: trip.startOdometer,
      endOdometer: trip.endOdometer,
      miles: Number(trip.miles || 0),
      rate: Number(trip.rate || 0),
      amount: Number(trip.amount || 0),
    }));

    setData({
      ...data,
      mileageRows: [...data.mileageRows, ...mapped],
    });
    setShowImportConfirm(false);
    onTrackClick("import_mileage_completed");
    alert(`Successfully imported ${mapped.length} trips from your active Mileage Log draft!`);
  };

  const handleLoadSample = () => {
    setData(SAMPLE_EXPENSE_REPORT_DRAFT);
    onTrackClick("expense_sample_loaded");
  };

  const handleClearDraft = () => {
    if (confirm("Are you sure you want to clear this expense board?")) {
      setData(DEFAULT_EXPENSE_REPORT_DRAFT);
      onTrackClick("expense_draft_cleared");
    }
  };

  const handleAddExpenseRow = () => {
    const newRow: ExpenseRow = {
      id: `row-${Date.now()}`,
      date: new Date().toISOString().substring(0, 10),
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
      date: new Date().toISOString().substring(0, 10),
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
          [field]: field === "amount" || field === "tax" || field === "tip" ? (val === "" ? "" : Number(val)) : val,
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
          [field]: field === "miles" || field === "rate" ? (val === "" ? "" : Number(val)) : val,
        };
        uItem.amount = Number(uItem.miles || 0) * Number(uItem.rate || 0);
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
    let content =
      "Date,Merchant,Category,Description,Payment Method,Base Amount,Tax,Tip,Line Total,Reimbursable,Billable,Receipt Attached\n";
    data.expenses.forEach((item) => {
      content += `"${item.date}","${item.merchant.replace(/"/g, '""')}","${item.category}","${item.description.replace(/"/g, '""')}","${item.paymentMethod}",${item.amount},${item.tax},${item.tip},${getExpenseLineTotal(item)},${item.reimbursable ? "Yes" : "No"},${item.billable ? "Yes" : "No"},${item.receiptAttached ? "Yes" : "No"}\n`;
    });

    if (data.mileageRows.length > 0) {
      content += "\nMILEAGE LOG ENTRIES\n";
      content += "Date,Purpose,Start Location,Destination,Miles,Rate,Amount\n";
      data.mileageRows.forEach((item) => {
        content += `"${item.date}","${item.purpose.replace(/"/g, '""')}","${item.startLocation.replace(/"/g, '""')}","${item.destination.replace(/"/g, '""')}",${item.miles},${item.rate},${item.amount}\n`;
      });
    }

    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `expense-report-${data.reportNumber}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const validateReport = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!data.submitter.name.trim()) {
      newErrors["submitter.name"] = "Submitter Legal Name is required before downloading reports.";
    }
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

  return (
    <div className="grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" id="expense-report-wrapper">
      {/* 1. Page Header banner */}
      <ToolPageHeader
        actions={
          <>
            {importAvailable && (
              <Button onClick={() => setShowImportConfirm(true)} size="sm" type="button" variant="outline">
                <Plus className="size-3.5" />
                <span>Import Mileage Logs</span>
              </Button>
            )}
            <Button onClick={handleLoadSample} size="sm" type="button" variant="secondary">
              <RefreshCw className="size-3.5" />
              <span>Load Sample</span>
            </Button>
            <Button
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleClearDraft}
              size="sm"
              type="button"
              variant="ghost"
            >
              Clear Board
            </Button>
          </>
        }
        className="print:hidden"
        description="Categorize corporate purchases, reconcile item logs, and formulate reimbursable parameters."
        eyebrow={<StatusBadge variant="info">Corporate Reimbursement Track</StatusBadge>}
        title="Expense Report Generator"
      />

      <AdvancedTemplateWorkspace
        adapter={expenseReportAdapter}
        draft={data}
        onDraftChange={setData}
        onTrackClick={onTrackClick}
        templates={templates}
      />

      {/* 2. Import Dialog Popup overlay */}
      {showImportConfirm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md space-y-4 rounded-2xl shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                <MapPin className="w-5 h-5" />
              </div>
              <H4 className="text-slate-900">Import Mileage Log Entries?</H4>
            </div>
            <P className="text-slate-600">
              This routine reads your active Mileage Log draft values and safely appends them as mileage item rows
              inside this expense report board. No data will be overwritten.
            </P>
            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={() => setShowImportConfirm(false)} size="sm" type="button" variant="secondary">
                Cancel
              </Button>
              <Button onClick={handleImportMileage} size="sm" type="button">
                Yes, Append Mileage Rows
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* 3. Mobile tabs mapping */}
      <Tabs
        className="mb-6 md:hidden print:hidden"
        id="expense-mobile-view-tabs"
        onValueChange={(value) => setActiveTab(value as "edit" | "preview")}
        value={activeTab}
      >
        <TabsList className="grid w-full grid-cols-2 border border-slate-200/50" variant="segmented">
          <TabsTrigger className="whitespace-normal py-1.5" value="edit">
            1. Edit items
          </TabsTrigger>
          <TabsTrigger className="whitespace-normal py-1.5" value="preview">
            2. PDF / Print View
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* 4. Split Screen layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: THE REPORT DATA INPUTS */}
        <div className={`lg:col-span-7 space-y-6 ${activeTab === "edit" ? "block" : "hidden md:block"} print:hidden`}>
          <Card className="space-y-6 rounded-2xl p-6 shadow-sm">
            {/* Report Metadata segment */}
            <div>
              <H3 className="text-slate-500 border-b border-slate-100 pb-2 mb-4">1. Report Configuration</H3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <Label className="block text-slate-400 mb-1" htmlFor="expense-report-title">
                    Report Title / Purpose *
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
                    Report Number *
                  </Label>
                  <Input
                    type="text"
                    id="expense-report-number"
                    value={data.reportNumber}
                    onChange={(e) => setData({ ...data, reportNumber: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="expense-report-date">
                    Report issue Date *
                  </Label>
                  <Input
                    type="date"
                    id="expense-report-date"
                    value={data.reportDate}
                    onChange={(e) => setData({ ...data, reportDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="expense-period-start">
                    Period Start
                  </Label>
                  <Input
                    type="date"
                    id="expense-period-start"
                    value={data.startDate}
                    onChange={(e) => setData({ ...data, startDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="expense-period-end">
                    Period End
                  </Label>
                  <Input
                    type="date"
                    id="expense-period-end"
                    value={data.endDate}
                    onChange={(e) => setData({ ...data, endDate: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Submitter Info Grid */}
            <div>
              <H3 className="text-slate-500 border-b border-slate-100 pb-2 mb-4">
                2. Submitter (Employee / Contractor)
              </H3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="expense-submitter-name">
                    Legal Name *
                  </Label>
                  <Input
                    aria-errormessage={errors["submitter.name"] ? "expense-submitter-name-error" : undefined}
                    type="text"
                    placeholder="e.g. Alex Mercer"
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
                    Email Coordinates
                  </Label>
                  <Input
                    type="email"
                    placeholder="alex@brand.com"
                    id="expense-submitter-email"
                    value={data.submitter.email}
                    onChange={(e) => setData({ ...data, submitter: { ...data.submitter, email: e.target.value } })}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="block text-slate-400 mb-1" htmlFor="expense-department">
                    Corporate Department / Team
                  </Label>
                  <Input
                    type="text"
                    placeholder="e.g. Client Solutions Group"
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
                3. Reimbursement entity (Company / Client)
              </H3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="expense-client-name">
                    Company / client Name *
                  </Label>
                  <Input
                    type="text"
                    placeholder="e.g. Acme Retail Corp"
                    id="expense-client-name"
                    value={data.client.name}
                    onChange={(e) => setData({ ...data, client: { ...data.client, name: e.target.value } })}
                  />
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="expense-client-contact">
                    Point of Contact
                  </Label>
                  <Input
                    type="text"
                    placeholder="Sarah Jenkins"
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
                <H3 className="text-slate-500">4. Purchase Itemization</H3>
                <Button onClick={handleAddExpenseRow} size="sm" type="button">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Purchase</span>
                </Button>
              </div>

              <div className="space-y-4">
                {data.expenses.map((row, index) => (
                  <div
                    key={row.id}
                    className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl space-y-3 relative"
                  >
                    <Button
                      aria-label={`Remove expense from ${row.merchant || `row ${index + 1}`}`}
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
                          Date *
                        </Label>
                        <Input
                          type="date"
                          id={`expense-row-${row.id}-date`}
                          value={row.date}
                          onChange={(e) => handleExpenseRowChange(row.id, "date", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="block text-slate-400 mb-0.5" htmlFor={`expense-row-${row.id}-merchant`}>
                          Merchant / Vendor *
                        </Label>
                        <Input
                          type="text"
                          placeholder="Amazon, Shell etc"
                          id={`expense-row-${row.id}-merchant`}
                          value={row.merchant}
                          onChange={(e) => handleExpenseRowChange(row.id, "merchant", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="block text-slate-400 mb-0.5" htmlFor={`expense-row-${row.id}-category`}>
                          expense Category
                        </Label>
                        <Select
                          id={`expense-row-${row.id}-category`}
                          value={row.category}
                          onChange={(e) => handleExpenseRowChange(row.id, "category", e.target.value)}
                        >
                          <option value="Meals">Meals / Dinner</option>
                          <option value="Travel">Flights / Travel</option>
                          <option value="Lodging">Lodging / Hotel</option>
                          <option value="Office supplies">office Supplies</option>
                          <option value="Software">software Subscription</option>
                          <option value="Equipment">Hardware &amp; Gear</option>
                          <option value="Phone/internet">Phone / Wifi</option>
                          <option value="Client materials">Client Materials</option>
                          <option value="Other">Other Expenses</option>
                        </Select>
                      </div>
                      <div>
                        <Label className="block text-slate-500 mb-0.5" htmlFor={`expense-row-${row.id}-amount`}>
                          Purchase Amount ($) *
                        </Label>
                        <Input
                          type="number"
                          placeholder="0.00"
                          id={`expense-row-${row.id}-amount`}
                          value={row.amount}
                          onChange={(e) => handleExpenseRowChange(row.id, "amount", e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label className="block text-slate-400 mb-0.5" htmlFor={`expense-row-${row.id}-tax`}>
                          Tax ($)
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          id={`expense-row-${row.id}-tax`}
                          value={row.tax}
                          onChange={(e) => handleExpenseRowChange(row.id, "tax", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="block text-slate-400 mb-0.5" htmlFor={`expense-row-${row.id}-tip`}>
                          Tip ($)
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          id={`expense-row-${row.id}-tip`}
                          value={row.tip}
                          onChange={(e) => handleExpenseRowChange(row.id, "tip", e.target.value)}
                        />
                      </div>
                      <div>
                        <Overline className="block text-slate-400 mb-0.5">Line total</Overline>
                        <output className="flex min-h-10 items-center text-slate-900">
                          <Strong>${getExpenseLineTotal(row).toFixed(2)}</Strong>
                        </output>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-1">
                      <div className="md:col-span-6">
                        <Input
                          aria-label={`Expense ${index + 1} notes`}
                          type="text"
                          placeholder="Additional detailed notes..."
                          value={row.description}
                          onChange={(e) => handleExpenseRowChange(row.id, "description", e.target.value)}
                        />
                      </div>
                      <div className="md:col-span-6 flex flex-wrap gap-4 items-center justify-end text-slate-600">
                        <Checkbox
                          checked={row.reimbursable}
                          className="min-h-0 items-center gap-1.5 [&_[data-slot=checkbox]]:size-3.5"
                          label="Reimbursable"
                          onCheckedChange={(checked) =>
                            handleExpenseRowChange(row.id, "reimbursable", checked === true)
                          }
                        />
                        <Checkbox
                          checked={row.billable}
                          className="min-h-0 items-center gap-1.5 [&_[data-slot=checkbox]]:size-3.5"
                          label="Bill Client"
                          onCheckedChange={(checked) => handleExpenseRowChange(row.id, "billable", checked === true)}
                        />
                        <Checkbox
                          checked={row.receiptAttached}
                          className="min-h-0 items-center gap-1.5 [&_[data-slot=checkbox]]:size-3.5"
                          label="Receipt File"
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
                          <Text>Receipt reference: {row.receiptName || "purchase_receipt_reference.jpg"}</Text>
                        </Text>
                        <Input
                          aria-label={`Receipt label for expense ${index + 1}`}
                          type="text"
                          required
                          placeholder="Edit label"
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

            {/* Mileage Block entries */}
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-4">
                <div className="flex items-center gap-1.5">
                  <H3 className="text-slate-500">5. Driven Mileage Rows</H3>
                  <StatusBadge variant="neutral">Per-row rate</StatusBadge>
                </div>
                <Button onClick={handleAddMileageRow} size="sm" type="button">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Mileage</span>
                </Button>
              </div>

              {data.mileageRows.length === 0 ? (
                <div className="text-center py-6 bg-slate-50 border border-dashed rounded-xl text-slate-400">
                  <Text>No mileage records registered. Reconcile trip logs using Phase 2 mileage sheet.</Text>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.mileageRows.map((mRow) => (
                    <div
                      key={mRow.id}
                      className="bg-slate-50/60 border rounded-lg p-3 relative flex flex-col md:flex-row gap-3"
                    >
                      <Button
                        aria-label="Remove mileage row"
                        className="absolute right-2 top-2 text-slate-400 hover:text-rose-600"
                        onClick={() => handleRemoveMileageRow(mRow.id)}
                        size="icon-xs"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>

                      <div className="grow grid grid-cols-2 md:grid-cols-5 gap-2">
                        <div>
                          <Label className="block text-slate-400" htmlFor={`expense-mileage-${mRow.id}-date`}>
                            Date
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
                            Trip Purpose
                          </Label>
                          <Input
                            type="text"
                            placeholder="e.g. Travel to CLT Airport terminal"
                            id={`expense-mileage-${mRow.id}-purpose`}
                            value={mRow.purpose}
                            onChange={(e) => handleMileageRowChange(mRow.id, "purpose", e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="block text-slate-400" htmlFor={`expense-mileage-${mRow.id}-miles`}>
                            Driven Miles
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
                            Rate / mile
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
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Float Adjustment advance */}
            <div>
              <H3 className="text-slate-500 border-b border-slate-100 pb-2 mb-4">6. Corporate Advance Received</H3>
              <div className="max-w-xs">
                <Label className="block text-slate-400 mb-1" htmlFor="expense-advance">
                  Pre-Paid Advance ($)
                </Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  id="expense-advance"
                  value={data.advanceReceived}
                  onChange={(e) => setData({ ...data, advanceReceived: Math.max(0, Number(e.target.value)) })}
                />
              </div>
            </div>
          </Card>

          {/* Compliance Info Banner */}
          <AlertBanner title="Reimbursement Policy Warning" variant="info">
            This document structures operating write-offs under IRS general business expense rules. Keep files of actual
            payment receipts secure in local storage directories.
          </AlertBanner>
        </div>

        {/* RIGHT COLUMN: PREVIEW ACTION TRIGGER BAR */}
        <div
          className={`lg:col-span-5 space-y-6 lg:sticky lg:top-20 ${activeTab === "preview" ? "block" : "hidden md:block"}`}
        >
          <Card className="space-y-3 rounded-2xl p-4 shadow-sm print:hidden">
            <div className="flex items-center justify-between text-slate-500 border-b border-slate-100 pb-2">
              <Text>REPORT ACTIONS PANEL</Text>
              <StatusBadge variant="info">Ready to Print</StatusBadge>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button className="w-full" onClick={handlePrint} type="button">
                <Printer className="w-4 h-4" />
                <span>Download PDF</span>
              </Button>
              <ToolActionButton action="download" onClick={handleExportCSV} type="button">
                <span>Export CSV</span>
              </ToolActionButton>
            </div>
          </Card>

          {/* Simulated Printed Letter Sheet Page */}
          <div className="relative group transition-all duration-200 border border-slate-200 shadow-2xl rounded-2xl">
            <div className="p-8 bg-white min-h-[750px] font-sans text-slate-800" id="receipt-print-area">
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
                  <span className="block text-[10px] text-slate-400 mt-2 font-bold">Issue Date: {data.reportDate}</span>
                </div>
              </div>

              {/* Submitter & Client columns */}
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div className="bg-slate-50/60 p-3 rounded-lg border border-slate-100 text-xs">
                  <span className="text-[11px] uppercase tracking-wider text-slate-400 font-extrabold block mb-0.5">
                    Submitted By
                  </span>
                  <span className="font-extrabold text-slate-900 block">
                    {data.submitter.name || "------------------"}
                  </span>
                  {data.department && (
                    <span className="text-[10px] text-slate-500 font-bold block">Dept: {data.department}</span>
                  )}
                  {data.submitter.email && (
                    <span className="block font-mono text-slate-400 text-[10px] pt-1">{data.submitter.email}</span>
                  )}
                </div>

                <div className="bg-slate-50/60 p-3 rounded-lg border border-slate-100 text-xs">
                  <span className="text-[11px] uppercase tracking-wider text-slate-400 font-extrabold block mb-0.5">
                    Assigned Entity
                  </span>
                  <span className="font-extrabold text-slate-900 block">
                    {data.client.name || "------------------"}
                  </span>
                  {data.client.contact && (
                    <span className="text-[10px] text-slate-500 font-bold block">Contact: {data.client.contact}</span>
                  )}
                  {data.projectName && (
                    <span className="text-[10px] text-blue-700 font-bold block pt-1 font-mono">
                      Project: {data.projectName}
                    </span>
                  )}
                </div>
              </div>

              {/* Purchases table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden mb-6 text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-400">
                    <tr>
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">Merchant</th>
                      <th className="py-2 px-3">Category</th>
                      <th className="py-2 px-3 text-right">Amount</th>
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
                          ${getExpenseLineTotal(row).toFixed(2)}
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
                        <th className="py-1.5 px-3">Date</th>
                        <th className="py-1.5 px-3">Purpose</th>
                        <th className="py-1.5 px-3 text-center">Miles</th>
                        <th className="py-1.5 px-3 text-right">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.mileageRows.map((mRow, idx) => (
                        <tr key={mRow.id || idx} className="border-b last:border-b-0 border-slate-100">
                          <td className="py-2 px-3 font-mono text-slate-500">{mRow.date}</td>
                          <td className="py-2 px-3 font-semibold text-slate-800 leading-snug">{mRow.purpose}</td>
                          <td className="py-2 px-3 text-center font-bold text-slate-500 font-mono">{mRow.miles} mi</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                            ${(Number(mRow.miles || 0) * Number(mRow.rate || 0)).toFixed(2)}
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
                    Expenses Sub-Category Groupings
                  </span>
                  {Object.entries(totals.categoryTotals).map(([cat, val]) => (
                    <div key={cat} className="flex justify-between text-[10px] font-bold text-slate-500 max-w-xs">
                      <span>{cat}:</span>
                      <span className="font-mono">${val.toFixed(2)}</span>
                    </div>
                  ))}
                  {totals.totalMiles > 0 && (
                    <div className="flex justify-between text-[10px] font-bold text-emerald-600 max-w-xs pt-1 border-t border-dashed">
                      <span>Mileage Log Credit:</span>
                      <span className="font-mono">${totals.mileageTotal.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* Subtotals Block */}
                <div className="col-span-6 text-right space-y-2 text-xs font-semibold">
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-500">Base amount:</span>
                    <span className="text-slate-800">${totals.baseAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-500">Tax:</span>
                    <span className="text-slate-800">${totals.taxAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-500">Tip:</span>
                    <span className="text-slate-800">${totals.tipAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-500">Expense total:</span>
                    <span className="text-slate-800">${totals.expenseTotal.toFixed(2)}</span>
                  </div>
                  {totals.totalMiles > 0 && (
                    <div className="flex justify-between font-mono">
                      <span className="text-slate-500">Mileage Reconciled:</span>
                      <span className="text-slate-800">${totals.mileageTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {data.advanceReceived > 0 && (
                    <div className="flex justify-between font-mono text-rose-600">
                      <span>Advance pre-paid:</span>
                      <span>-${Number(data.advanceReceived).toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center border-t border-slate-200 pt-2.5 mt-2">
                    <span className="text-xs uppercase font-black text-slate-900">Reimbursement Due</span>
                    <span className="text-lg font-black text-slate-950 font-mono">${totals.amountDue.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Approval / Auditor Signature lines */}
              <div className="grid grid-cols-2 gap-8 mt-12 pt-8 border-t border-slate-100 text-center leading-normal">
                <div className="space-y-4">
                  <div className="border-b border-slate-300 h-8" />
                  <span className="block text-[11px] uppercase font-bold text-slate-400">Submitted By (Signature)</span>
                </div>
                <div className="space-y-4">
                  <div className="border-b border-slate-300 h-8" />
                  <span className="block text-[11px] uppercase font-bold text-slate-400">
                    Approved &amp; Reviewed By
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SEO Faq block */}
      <div
        className="mt-16 border-t border-slate-200/80 pt-12 max-w-4xl mx-auto space-y-6 print:hidden"
        id="expense-seo-faq"
      >
        <H3 className="text-slate-900 text-center">Frequently Answered Corporate Questions</H3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-slate-600">
          <div className="space-y-1">
            <H4 className="text-slate-900">How do I export my expenses summary for tax write-offs later?</H4>
            <P>
              Simply click the "Export CSV" option to serialize all itemization metrics into standard xls sheets, or
              copy summaries into tax planner cards.
            </P>
          </div>
          <div className="space-y-1">
            <H4 className="text-slate-900">How does Pre-Paid Advance calculation behave?</H4>
            <P>
              If your corporate office already wired cash for travel flights, keying the advance will deduct it clearly
              from final balances due.
            </P>
          </div>
          <div className="space-y-1">
            <H4 className="text-slate-900">Are receipts files uploaded onto any cloud database?</H4>
            <P>No, absolutely none. Your assets remain local under immediate browser memory.</P>
          </div>
          <div className="space-y-1">
            <H4 className="text-slate-900">Is this software compliant with IRS publication guidelines?</H4>
            <P>
              It helps contractors itemize operational metrics clearly. Since it represents an organizer, always consult
              certified bookkeepers.
            </P>
          </div>
        </div>
      </div>
    </div>
  );
}
