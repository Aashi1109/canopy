"use client";

import { PaperworkToolHeader, PaperworkMobileTabs } from "../PaperworkWorkspace";

import { useLocale, useTranslations } from "next-intl";

import { WorkbenchPanes } from "@/components/tool-workbench/WorkbenchPanes";

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from "react";
import type { AdvancedDocumentTemplate, DocumentTemplate } from "@/lib/invoice-templates/index.ts";
import {
  FieldError,
  H3,
  H4,
  Overline,
  P,
  Text,
  AlertBanner,
  Button,
  ToolActionButton,
  Card,
  CheckboxControl,
  IconTile,
  Input,
  Label,
  Select,
  StatusBadge,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@/components/ui/index.tsx";
import {
  FileText,
  Clock,
  Printer,
  RefreshCw,
  Plus,
  Trash2,
  Check,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  Download,
  Percent,
  CheckCircle,
  HelpCircle,
  Info,
  ChevronRight,
} from "lucide-react";
import AdvancedTemplateWorkspace from "../AdvancedTemplateWorkspace";
import { receiptAdapter } from "@/lib/paperwork/documentAdapters";
import {
  calculateReceiptTotals,
  validateReceiptData,
  receiptFromInvoice,
  normalizeReceiptDraft,
  DEFAULT_RECEIPT_DATA,
  SAMPLE_RECEIPT_DATA,
  type ReceiptData,
  type ReceiptItem,
} from "@/lib/paperwork/receiptDocument";
import { formatCurrency } from "@/lib/paperwork/utils/calculations";
import { usePaperworkFeedback } from "../PaperworkFeedback";
import { DataBridge, DataBridgeKeys, type ReceiptSummary } from "@/lib/paperwork/shared/dataBridge";

export { calculateReceiptTotals, DEFAULT_RECEIPT_DATA, SAMPLE_RECEIPT_DATA };
export type { ReceiptData, ReceiptItem };

export default function ReceiptGeneratorPage({
  onTrackClick,
  templates = [],
  embedded = false,
}: {
  onTrackClick: (item: string) => void;
  templates?: readonly DocumentTemplate[];
  embedded?: boolean;
}) {
  const t = useTranslations("Tool.runtime");
  const locale = useLocale();
  const { notify, confirm: confirmAction } = usePaperworkFeedback();
  const money = (value: number) => formatCurrency(value, data.currency || "USD", locale);
  const advancedTemplates = templates.filter(
    (template): template is AdvancedDocumentTemplate =>
      template.documentType === "receipt" && template.layoutFamily === "advanced",
  );
  const [data, setData] = useState<ReceiptData>(() => {
    return normalizeReceiptDraft(
      DataBridge.get<Partial<ReceiptData>>(DataBridgeKeys.RECEIPT_DRAFT, DEFAULT_RECEIPT_DATA),
    );
  });

  const [selectedTheme, setSelectedTheme] = useState<"classic" | "modern" | "compact" | "rent" | "contractor">(
    "classic",
  );
  const [selectedAdvancedTemplateId, setSelectedAdvancedTemplateId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const [importAvailable, setImportAvailable] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);

  // Auto-save draft
  useEffect(() => {
    DataBridge.set(DataBridgeKeys.RECEIPT_DRAFT, data);
  }, [data]);

  useEffect(() => {
    if (!advancedTemplates.length) return;
    const stored = localStorage.getItem("paperworkkit.advanced-template.receipt.selected");
    const selected =
      advancedTemplates.find((template) => template.id === stored) ??
      advancedTemplates.find((template) => template.isDefault) ??
      advancedTemplates[0];
    setSelectedAdvancedTemplateId(selected.id);
  }, [templates]);

  useEffect(() => {
    if (!selectedAdvancedTemplateId) return;
    localStorage.setItem("paperworkkit.advanced-template.receipt.selected", selectedAdvancedTemplateId);
  }, [selectedAdvancedTemplateId]);

  // Check if Invoice Draft is present
  useEffect(() => {
    const inv = DataBridge.getInvoiceDraft();
    if (inv && inv.business && inv.business.name) {
      setImportAvailable(true);
    }
  }, []);

  const handleImportInvoice = () => {
    const inv = DataBridge.getInvoiceDraft();
    if (!inv) return;

    const mapped = receiptFromInvoice(inv);

    setData(mapped);
    setShowImportConfirm(false);
    onTrackClick("import_invoice_completed");
    notify(t("receipt.draftInvoiceValuesImportedSuccessfully"), "success");
  };

  const handleLoadSample = () => {
    setData(SAMPLE_RECEIPT_DATA);
    setErrors({});
    onTrackClick("receipt_sample_loaded");
  };

  const handleClearDraft = async () => {
    if (await confirmAction(t("receipt.areYouSureYouWantToClearCurrent"))) {
      setData(DEFAULT_RECEIPT_DATA);
      setErrors({});
      onTrackClick("receipt_draft_cleared");
    }
  };

  // Add Item line
  const handleAddItem = () => {
    const newItem: ReceiptItem = {
      id: `item-${Date.now()}`,
      description: "",
      quantity: 1,
      unitPrice: 0,
      taxable: false,
    };
    setData({
      ...data,
      lineItems: [...data.lineItems, newItem],
    });
    onTrackClick("receipt_item_added");
  };

  // Remove Item line
  const handleRemoveItem = (id: string) => {
    setData({
      ...data,
      lineItems: data.lineItems.filter((item) => item.id !== id),
    });
    onTrackClick("receipt_item_removed");
  };

  // Safe item updates
  const handleItemChange = (id: string, field: keyof ReceiptItem, val: any) => {
    const updated = data.lineItems.map((item) => {
      if (item.id === id) {
        return {
          ...item,
          [field]: field === "quantity" || field === "unitPrice" ? (val === "" ? 0 : Number(val)) : val,
        };
      }
      return item;
    });
    setData({ ...data, lineItems: updated });
  };

  const totals = calculateReceiptTotals(data);
  const selectedAdvancedTemplate = advancedTemplates.find((template) => template.id === selectedAdvancedTemplateId);
  const validateReceipt = (): boolean => {
    const newErrors = validateReceiptData(data);
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Custom template exports are owned by AdvancedTemplateWorkspace.
  const handlePrint = () => {
    onTrackClick?.("receipt_print_clicked");
    if (validateReceipt()) {
      window.print();
    } else {
      const el = document.getElementById("receipt-mobile-tabs") || document.getElementById("receipt-generator-wrapper");
      el?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleCopySummary = async () => {
    if (!validateReceipt()) return;
    const summary = `${t("receipt.receiptGenerator")} ${data.receiptNumber} · ${data.business.name} · ${data.customer.name} · ${data.receiptDate}\n${t("receipt.total")}: ${money(totals.total)}\n${t("receipt.amountReceived")}: ${money(totals.amountReceived)}\n${t("receipt.amountRefunded")}: ${money(totals.amountRefunded)}\n${t("receipt.netReceived")}: ${money(totals.netReceived)}\n${t("receipt.customerCredit")}: ${money(totals.customerCredit)}\n${t("receipt.balanceDue")}: ${money(totals.balanceDue)}\n${t("receipt.paymentMethod")}: ${data.paymentMethod}`;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      onTrackClick?.("receipt_copy_summary_clicked");
    } catch {
      notify(t("receipt.clipboardFailed"), "error");
    }
  };

  const initialDraft = useRef(JSON.stringify(data));
  const hasEdits = JSON.stringify(data) !== initialDraft.current;

  return (
    <div
      className={embedded ? "min-w-0 w-full p-4 sm:p-5" : "grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"}
      id="receipt-generator-wrapper"
      data-language-switch-state={hasEdits ? "dirty" : "clean"}
    >
      {/* 1. Header Banner */}
      <PaperworkToolHeader
        embedded={embedded}
        actions={
          <>
            <Select
              aria-label={t("receipt.receiptVisualLayout")}
              className="w-44 max-w-full"
              id="receipt-visual-layout"
              onChange={(event) => {
                const value = event.target.value;
                const theme = (["classic", "modern", "compact", "rent", "contractor"] as const).find(
                  (key) => value === `built-in:${key}`,
                );
                if (theme) {
                  setSelectedTheme(theme);
                  setSelectedAdvancedTemplateId("");
                } else {
                  setSelectedAdvancedTemplateId(value.slice("published:".length));
                }
              }}
              value={
                selectedAdvancedTemplate ? `published:${selectedAdvancedTemplate.id}` : `built-in:${selectedTheme}`
              }
            >
              <optgroup label={t("receipt.builtInLayout")}>
                {(["classic", "modern", "compact", "rent", "contractor"] as const).map((theme) => (
                  <option key={theme} value={`built-in:${theme}`}>
                    {t("shared.templates.layoutLabel", { layout: t(`receipt.themes.${theme}`) })}
                  </option>
                ))}
              </optgroup>
              {advancedTemplates.length > 0 && (
                <optgroup label={t("receipt.publishedCustomTemplate")}>
                  {advancedTemplates.map((template) => (
                    <option key={template.id} value={`published:${template.id}`}>
                      {t("shared.templates.layoutLabel", { layout: template.name })}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
            {importAvailable && (
              <Button onClick={() => setShowImportConfirm(true)} size="sm" type="button" variant="outline">
                <RefreshCw className="size-3.5" />
                <span>{t("receipt.importInvoiceDraft")}</span>
              </Button>
            )}
            <Button onClick={handleLoadSample} size="sm" type="button" variant="secondary">
              <RefreshCw className="size-3.5" />
              <span>{t("receipt.sampleDemo")}</span>
            </Button>
            <Button
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleClearDraft}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("receipt.clearFields")}
            </Button>
            <div className="flex flex-wrap gap-2">
              {!selectedAdvancedTemplate && (
                <ToolActionButton action="download" icon={<Printer />} onClick={() => void handlePrint()} type="button">
                  <span>{t("receipt.printSavePdf")}</span>
                </ToolActionButton>
              )}
              <ToolActionButton
                action="copy"
                icon={copied ? <Check /> : undefined}
                onClick={handleCopySummary}
                type="button"
              >
                <span>{copied ? t("receipt.copied") : t("receipt.copySummary")}</span>
              </ToolActionButton>
            </div>
          </>
        }
        className="print:hidden"
        description={t("receipt.formulatePaymentRecordsForYourSmallBusinessZero")}
        eyebrow={<StatusBadge variant="success">{t("receipt.legitimateRecordsTool")}</StatusBadge>}
        title={t("receipt.receiptGenerator")}
      />

      {/* 2. Notification Overlay if Importing Invoice */}
      {showImportConfirm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md gap-4 rounded-2xl shadow-xl">
            <div className="flex items-center gap-3">
              <IconTile className="rounded-full border border-blue-100 bg-blue-50 text-blue-600" size="sm">
                <RefreshCw className="w-5 h-5 animate-spin-reverse" />
              </IconTile>
              <H4 className="text-slate-900">{t("receipt.importActiveInvoiceDraft")}</H4>
            </div>
            <P className="text-slate-600">{t("receipt.thisActionTransfersYourBusinessDetailsClientDetails")}</P>
            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={() => setShowImportConfirm(false)} size="sm" type="button" variant="secondary">
                {t("receipt.keepBlank")}
              </Button>
              <Button onClick={handleImportInvoice} size="sm" type="button">
                {t("receipt.yesPopulateFromInvoice")}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* 3. Mobile tab switcher */}
      <PaperworkMobileTabs
        className="mb-4 lg:hidden print:hidden"
        id="receipt-mobile-tabs"
        onValueChange={(value) => setActiveTab(value as "edit" | "preview")}
        value={activeTab}
      >
        <TabsList className="grid w-full grid-cols-2 border border-slate-200/50" variant="segmented">
          <TabsTrigger className="whitespace-normal py-2" value="edit">
            {t("receipt.label1EditFields")}
          </TabsTrigger>
          <TabsTrigger className="whitespace-normal py-2" value="preview">
            {t("receipt.label2LiveDesignPreview")}
          </TabsTrigger>
        </TabsList>
      </PaperworkMobileTabs>

      {/* 4. Split Screen Editor & Live Rendered Frame */}
      <WorkbenchPanes
        singlePaneDisplay="block"
        className={
          embedded
            ? "grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-12"
            : "grid grid-cols-1 items-start gap-8 lg:grid-cols-12"
        }
      >
        {/* Editor Fields Column */}
        <div
          className={`min-w-0 lg:col-span-7 space-y-4 ${activeTab === "edit" ? "block" : "hidden lg:block"} print:hidden`}
        >
          <Card className={embedded ? "gap-4 p-4 shadow-sm" : "gap-6 rounded-2xl p-6 shadow-sm"}>
            {/* Business (Seller) Segment */}
            <div>
              <H3 className="text-slate-500 border-b border-slate-100 pb-2 mb-4">
                {t("receipt.label1SellerProviderInfo")}
              </H3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="receipt-seller-name">
                    {t("receipt.companySellerName")}
                  </Label>
                  <Input
                    aria-errormessage={errors["business.name"] ? "receipt-seller-name-error" : undefined}
                    type="text"
                    required
                    placeholder={t("receipt.eGBlueRidgeWebStudio")}
                    aria-invalid={Boolean(errors["business.name"])}
                    className={` ${errors["business.name"] ? "bg-destructive/5" : ""}`}
                    id="receipt-seller-name"
                    value={data.business.name}
                    onChange={(e) => {
                      setData({ ...data, business: { ...data.business, name: e.target.value } });
                      if (errors["business.name"]) setErrors((prev) => ({ ...prev, "business.name": "" }));
                    }}
                  />
                  {errors["business.name"] && (
                    <FieldError className="mt-1 text-destructive" id="receipt-seller-name-error" role="alert">
                      {errors["business.name"]}
                    </FieldError>
                  )}
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="receipt-seller-tax-id">
                    {t("receipt.taxIdEinOptional")}
                  </Label>
                  <Input
                    type="text"
                    placeholder={t("receipt.eG123456789")}
                    id="receipt-seller-tax-id"
                    value={data.business.taxId || ""}
                    onChange={(e) => setData({ ...data, business: { ...data.business, taxId: e.target.value } })}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="block text-slate-400 mb-1" htmlFor="receipt-seller-address">
                    {t("receipt.addressLocation")}
                  </Label>
                  <Input
                    type="text"
                    placeholder={t("receipt.eG404RidgePointLane")}
                    className="mb-2"
                    id="receipt-seller-address"
                    value={data.business.addressLine1}
                    onChange={(e) =>
                      setData({
                        ...data,
                        business: { ...data.business, addressLine1: e.target.value },
                      })
                    }
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      aria-label={t("receipt.sellerCity")}
                      type="text"
                      placeholder={t("receipt.city")}
                      value={data.business.city}
                      onChange={(e) => setData({ ...data, business: { ...data.business, city: e.target.value } })}
                    />
                    <Input
                      aria-label={t("receipt.sellerState")}
                      type="text"
                      placeholder={t("receipt.state")}
                      value={data.business.state}
                      onChange={(e) => setData({ ...data, business: { ...data.business, state: e.target.value } })}
                    />
                    <Input
                      aria-label={t("receipt.sellerZipCode")}
                      type="text"
                      placeholder={t("receipt.zipCode")}
                      value={data.business.zipCode}
                      onChange={(e) =>
                        setData({
                          ...data,
                          business: { ...data.business, zipCode: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="receipt-seller-email">
                    {t("receipt.senderEmail")}
                  </Label>
                  <Input
                    type="email"
                    placeholder={t("receipt.eGInfoDomainCom")}
                    id="receipt-seller-email"
                    value={data.business.email}
                    onChange={(e) => setData({ ...data, business: { ...data.business, email: e.target.value } })}
                  />
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="receipt-seller-phone">
                    {t("receipt.supportPhone")}
                  </Label>
                  <Input
                    type="text"
                    placeholder="+1 (555) 000-0000"
                    id="receipt-seller-phone"
                    value={data.business.phone}
                    onChange={(e) => setData({ ...data, business: { ...data.business, phone: e.target.value } })}
                  />
                </div>
              </div>
            </div>

            {/* Customer (Payer) Segment */}
            <div>
              <H3 className="text-slate-500 border-b border-slate-100 pb-2 mb-4">
                {t("receipt.label2PayerClientInfo")}
              </H3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="receipt-client-name">
                    {t("receipt.clientName")}
                  </Label>
                  <Input
                    aria-errormessage={errors["customer.name"] ? "receipt-client-name-error" : undefined}
                    type="text"
                    required
                    placeholder={t("receipt.eGSarahJenkins")}
                    aria-invalid={Boolean(errors["customer.name"])}
                    className={` ${errors["customer.name"] ? "bg-destructive/5" : ""}`}
                    id="receipt-client-name"
                    value={data.customer.name}
                    onChange={(e) => {
                      setData({ ...data, customer: { ...data.customer, name: e.target.value } });
                      if (errors["customer.name"]) setErrors((prev) => ({ ...prev, "customer.name": "" }));
                    }}
                  />
                  {errors["customer.name"] && (
                    <FieldError className="mt-1 text-destructive" id="receipt-client-name-error" role="alert">
                      {errors["customer.name"]}
                    </FieldError>
                  )}
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="receipt-client-company">
                    {t("receipt.companyAssociation")}
                  </Label>
                  <Input
                    type="text"
                    placeholder={t("receipt.eGAcmeCorp")}
                    id="receipt-client-company"
                    value={data.customer.company}
                    onChange={(e) => setData({ ...data, customer: { ...data.customer, company: e.target.value } })}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="block text-slate-400 mb-1" htmlFor="receipt-client-address">
                    {t("receipt.billingStreetAddress")}
                  </Label>
                  <Input
                    type="text"
                    placeholder={t("receipt.label822BroadStreet")}
                    className="mb-2"
                    id="receipt-client-address"
                    value={data.customer.addressLine1}
                    onChange={(e) =>
                      setData({
                        ...data,
                        customer: { ...data.customer, addressLine1: e.target.value },
                      })
                    }
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      aria-label={t("receipt.clientCity")}
                      type="text"
                      placeholder={t("receipt.city")}
                      value={data.customer.city}
                      onChange={(e) => setData({ ...data, customer: { ...data.customer, city: e.target.value } })}
                    />
                    <Input
                      aria-label={t("receipt.clientState")}
                      type="text"
                      placeholder={t("receipt.state")}
                      value={data.customer.state}
                      onChange={(e) => setData({ ...data, customer: { ...data.customer, state: e.target.value } })}
                    />
                    <Input
                      aria-label={t("receipt.clientZipCode")}
                      type="text"
                      placeholder={t("receipt.zipCode")}
                      value={data.customer.zipCode}
                      onChange={(e) =>
                        setData({
                          ...data,
                          customer: { ...data.customer, zipCode: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Receipt Details Segment */}
            <div>
              <H3 className="text-slate-500 border-b border-slate-100 pb-2 mb-4">
                {t("receipt.label3ReceiptCoordinates")}
              </H3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="receipt-number">
                    {t("receipt.receiptNumber")}
                  </Label>
                  <Input
                    type="text"
                    id="receipt-number"
                    aria-invalid={Boolean(errors["receiptNumber"])}
                    aria-describedby={errors["receiptNumber"] ? "receipt-number-error" : undefined}
                    value={data.receiptNumber}
                    onChange={(e) => setData({ ...data, receiptNumber: e.target.value })}
                  />
                  {errors["receiptNumber"] && (
                    <FieldError id="receipt-number-error">{errors["receiptNumber"]}</FieldError>
                  )}
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="receipt-date">
                    {t("receipt.receiptDate")}
                  </Label>
                  <Input
                    type="date"
                    id="receipt-date"
                    aria-invalid={Boolean(errors["receiptDate"])}
                    aria-describedby={errors["receiptDate"] ? "receipt-date-error" : undefined}
                    value={data.receiptDate}
                    onChange={(e) => setData({ ...data, receiptDate: e.target.value })}
                  />
                  {errors["receiptDate"] && <FieldError id="receipt-date-error">{errors["receiptDate"]}</FieldError>}
                </div>
                <div>
                  <Label htmlFor="receipt-time">{t("receipt.receiptTime")}</Label>
                  <Input
                    id="receipt-time"
                    type="time"
                    value={data.receiptTime}
                    onChange={(e) => setData({ ...data, receiptTime: e.target.value })}
                    aria-invalid={Boolean(errors.receiptTime)}
                    aria-describedby={errors.receiptTime ? "receipt-time-error" : undefined}
                  />
                  {errors.receiptTime && <FieldError id="receipt-time-error">{errors.receiptTime}</FieldError>}
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="receipt-category">
                    {t("receipt.receiptCategory")}
                  </Label>
                  <Select
                    id="receipt-category"
                    value={data.receiptType}
                    onChange={(e) => setData({ ...data, receiptType: e.target.value as any })}
                  >
                    <option value="Service">{t("receipt.serviceReceipt")}</option>
                    <option value="Product">{t("receipt.productReceipt")}</option>
                    <option value="Rent">{t("receipt.rentStatement")}</option>
                    <option value="Contractor">{t("receipt.subcontractorReceipt")}</option>
                    <option value="Deposit">{t("receipt.depositConfirmed")}</option>
                    <option value="Refund">{t("receipt.refundStatement")}</option>
                  </Select>
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="receipt-related-invoice">
                    {t("receipt.relatedInvoice")}
                  </Label>
                  <Input
                    type="text"
                    placeholder={t("receipt.eGInv2026001")}
                    id="receipt-related-invoice"
                    value={data.relatedInvoiceNumber}
                    onChange={(e) => setData({ ...data, relatedInvoiceNumber: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="receipt-transaction-id">
                    {t("receipt.transactionRefId")}
                  </Label>
                  <Input
                    type="text"
                    placeholder={t("receipt.eGTxn99812a")}
                    id="receipt-transaction-id"
                    value={data.transactionId}
                    onChange={(e) => setData({ ...data, transactionId: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="receipt-payment-status">
                    {t("receipt.paymentStatus")}
                  </Label>
                  <Select
                    id="receipt-payment-status"
                    aria-invalid={Boolean(errors.paymentStatus)}
                    aria-describedby={errors.paymentStatus ? "receipt-status-error" : undefined}
                    value={data.paymentStatus}
                    onChange={(e) => setData({ ...data, paymentStatus: e.target.value as any })}
                  >
                    <option value="Paid">{t("receipt.fullyPaid")}</option>
                    <option value="Unpaid">{t("receipt.unpaid")}</option>
                    <option value="Partially Paid">{t("receipt.partiallyPaid")}</option>
                    <option value="Refunded">{t("receipt.fullyRefunded")}</option>
                  </Select>
                  {errors.paymentStatus && <FieldError id="receipt-status-error">{errors.paymentStatus}</FieldError>}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="receipt-currency">{t("receipt.currency")}</Label>
                <Input
                  id="receipt-currency"
                  aria-invalid={Boolean(errors["currency"])}
                  aria-describedby={errors["currency"] ? "receipt-currency-error" : undefined}
                  value={data.currency || "USD"}
                  maxLength={3}
                  onChange={(e) => setData({ ...data, currency: e.target.value.toUpperCase() })}
                />
                {errors["currency"] && <FieldError id="receipt-currency-error">{errors["currency"]}</FieldError>}
                <P className="text-muted-foreground">{t("receipt.currencyScope")}</P>
              </div>
              <div>
                <Label htmlFor="receipt-amount-received">{t("receipt.amountReceived")}</Label>
                <Input
                  id="receipt-amount-received"
                  aria-invalid={Boolean(errors["amountReceived"])}
                  aria-describedby={errors["amountReceived"] ? "receipt-amount-received-error" : undefined}
                  type="number"
                  min={0}
                  step="0.01"
                  value={data.amountReceived ?? totals.amountReceived}
                  onChange={(e) => setData({ ...data, amountReceived: Number(e.target.value) })}
                />
                {errors["amountReceived"] && (
                  <FieldError id="receipt-amount-received-error">{errors["amountReceived"]}</FieldError>
                )}
              </div>
              <div>
                <Label htmlFor="receipt-amount-refunded">{t("receipt.amountRefunded")}</Label>
                <Input
                  id="receipt-amount-refunded"
                  aria-invalid={Boolean(errors["amountRefunded"])}
                  aria-describedby={errors["amountRefunded"] ? "receipt-amount-refunded-error" : undefined}
                  type="number"
                  min={0}
                  step="0.01"
                  value={data.amountRefunded}
                  onChange={(e) => setData({ ...data, amountRefunded: Number(e.target.value) })}
                />
                {errors["amountRefunded"] && (
                  <FieldError id="receipt-amount-refunded-error">{errors["amountRefunded"]}</FieldError>
                )}
              </div>
            </div>
            {errors.lineItems && <FieldError role="alert">{errors.lineItems}</FieldError>}

            {/* Line Items Grid Rows */}
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-4">
                <H3 className="text-slate-500">{t("receipt.label4ItemsServicesPaid")}</H3>
                <Button onClick={handleAddItem} size="sm" type="button">
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t("receipt.addLine")}</span>
                </Button>
              </div>

              <div className="space-y-3">
                {data.lineItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className="flex flex-col md:flex-row gap-3 p-3 bg-slate-50 border border-slate-200/60 rounded-xl relative"
                  >
                    <div className="grow">
                      <Label className="block text-slate-400 mb-0.5" htmlFor={`receipt-item-${item.id}-description`}>
                        {t("receipt.description")}
                      </Label>
                      <Input
                        type="text"
                        placeholder={t("receipt.eGStrategicDevelopmentConsultation")}
                        id={`receipt-item-${item.id}-description`}
                        aria-invalid={Boolean(errors[`lineItems[${idx}].description`])}
                        aria-describedby={
                          errors[`lineItems[${idx}].description`]
                            ? `receipt-item-${item.id}-description-error`
                            : undefined
                        }
                        value={item.description}
                        onChange={(e) => handleItemChange(item.id, "description", e.target.value)}
                      />
                      {errors[`lineItems[${idx}].description`] && (
                        <FieldError id={`receipt-item-${item.id}-description-error`}>
                          {errors[`lineItems[${idx}].description`]}
                        </FieldError>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 w-full md:w-auto shrink-0 md:max-w-xs">
                      <div>
                        <Label className="block text-slate-400 mb-0.5" htmlFor={`receipt-item-${item.id}-quantity`}>
                          {t("receipt.qty")}
                        </Label>
                        <Input
                          type="number"
                          min="1"
                          className="text-center"
                          id={`receipt-item-${item.id}-quantity`}
                          aria-invalid={Boolean(errors[`lineItems[${idx}].quantity`])}
                          aria-describedby={
                            errors[`lineItems[${idx}].quantity`] ? `receipt-item-${item.id}-quantity-error` : undefined
                          }
                          value={item.quantity}
                          onChange={(e) => handleItemChange(item.id, "quantity", e.target.value)}
                        />
                        {errors[`lineItems[${idx}].quantity`] && (
                          <FieldError id={`receipt-item-${item.id}-quantity-error`}>
                            {errors[`lineItems[${idx}].quantity`]}
                          </FieldError>
                        )}
                      </div>
                      <div>
                        <Label className="block text-slate-400 mb-0.5" htmlFor={`receipt-item-${item.id}-rate`}>
                          {t("receipt.rate")}
                        </Label>
                        <Input
                          type="number"
                          placeholder="0.00"
                          id={`receipt-item-${item.id}-rate`}
                          aria-invalid={Boolean(errors[`lineItems[${idx}].unitPrice`])}
                          aria-describedby={
                            errors[`lineItems[${idx}].unitPrice`] ? `receipt-item-${item.id}-rate-error` : undefined
                          }
                          value={item.unitPrice}
                          onChange={(e) => handleItemChange(item.id, "unitPrice", e.target.value)}
                        />
                        {errors[`lineItems[${idx}].unitPrice`] && (
                          <FieldError id={`receipt-item-${item.id}-rate-error`}>
                            {errors[`lineItems[${idx}].unitPrice`]}
                          </FieldError>
                        )}
                      </div>
                      <div className="flex flex-col items-center justify-center pt-2">
                        <Overline className="text-slate-400 mb-0.5">{t("receipt.tax")}</Overline>
                        <CheckboxControl
                          aria-label={t("receipt.taxableReceiptItemValue", { value1: idx + 1 })}
                          className="size-4 rounded border-input accent-primary"
                          checked={item.taxable}
                          onCheckedChange={(checked) => handleItemChange(item.id, "taxable", checked === true)}
                        />
                      </div>
                    </div>
                    {data.lineItems.length > 1 && (
                      <Button
                        aria-label={t("receipt.removeReceiptItemValue", { value1: idx + 1 })}
                        className="absolute right-2 top-2 text-slate-400 hover:text-red-600 md:relative md:top-auto md:right-auto md:self-end"
                        onClick={() => handleRemoveItem(item.id)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Calculations & payment settings */}
            <div>
              <H3 className="text-slate-500 border-b border-slate-100 pb-2 mb-4">
                {t("receipt.label5TotalAdjustmentsPaidRoute")}
              </H3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="receipt-discount-type">
                    {t("receipt.discountType")}
                  </Label>
                  <Select
                    id="receipt-discount-type"
                    value={data.discountType}
                    onChange={(e) => setData({ ...data, discountType: e.target.value as any, discountValue: 0 })}
                  >
                    <option value="none">{t("receipt.noDiscount")}</option>
                    <option value="percent">{t("receipt.percentage")}</option>
                    <option value="fixed">{t("receipt.fixedAmount")}</option>
                  </Select>
                </div>
                {data.discountType !== "none" && (
                  <div>
                    <Label className="block text-slate-400 mb-1" htmlFor="receipt-discount-value">
                      {data.discountType === "percent" ? t("receipt.percentageOff") : t("receipt.amountDeducted")}
                    </Label>
                    <Input
                      type="number"
                      id="receipt-discount-value"
                      aria-invalid={Boolean(errors["discountValue"])}
                      aria-describedby={errors["discountValue"] ? "receipt-discount-value-error" : undefined}
                      value={data.discountValue}
                      onChange={(e) => setData({ ...data, discountValue: Math.max(0, Number(e.target.value)) })}
                    />
                    {errors["discountValue"] && (
                      <FieldError id="receipt-discount-value-error">{errors["discountValue"]}</FieldError>
                    )}
                  </div>
                )}
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="receipt-tax-rate">
                    {t("receipt.salesTaxRate")}
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    id="receipt-tax-rate"
                    aria-invalid={Boolean(errors["salesTaxRate"])}
                    aria-describedby={errors["salesTaxRate"] ? "receipt-tax-rate-error" : undefined}
                    value={data.salesTaxRate}
                    onChange={(e) => setData({ ...data, salesTaxRate: Math.max(0, Number(e.target.value)) })}
                  />
                  {errors["salesTaxRate"] && (
                    <FieldError id="receipt-tax-rate-error">{errors["salesTaxRate"]}</FieldError>
                  )}
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="receipt-tax-label">
                    {t("receipt.salesTaxLabel")}
                  </Label>
                  <Input
                    type="text"
                    id="receipt-tax-label"
                    value={data.salesTaxLabel}
                    onChange={(e) => setData({ ...data, salesTaxLabel: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="receipt-tip">
                    {t("receipt.tipGratuity")}
                  </Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    id="receipt-tip"
                    aria-invalid={Boolean(errors["tip"])}
                    aria-describedby={errors["tip"] ? "receipt-tip-error" : undefined}
                    value={data.tip}
                    onChange={(e) => setData({ ...data, tip: Math.max(0, Number(e.target.value)) })}
                  />
                  {errors["tip"] && <FieldError id="receipt-tip-error">{errors["tip"]}</FieldError>}
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="receipt-additional-fee">
                    {t("receipt.additionalFee")}
                  </Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    id="receipt-additional-fee"
                    aria-invalid={Boolean(errors["additionalFee"])}
                    aria-describedby={errors["additionalFee"] ? "receipt-additional-fee-error" : undefined}
                    value={data.additionalFee}
                    onChange={(e) => setData({ ...data, additionalFee: Math.max(0, Number(e.target.value)) })}
                  />
                  {errors["additionalFee"] && (
                    <FieldError id="receipt-additional-fee-error">{errors["additionalFee"]}</FieldError>
                  )}
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="receipt-payment-method">
                    {t("receipt.paymentMethod")}
                  </Label>
                  <Select
                    id="receipt-payment-method"
                    value={data.paymentMethod}
                    onChange={(e) => setData({ ...data, paymentMethod: e.target.value })}
                  >
                    <option value="Card">{t("receipt.creditDebitCard")}</option>
                    <option value="Cash">{t("receipt.cashHandover")}</option>
                    <option value="Check">{t("receipt.businessCheck")}</option>
                    <option value="Zelle">{t("receipt.zelleTransfer")}</option>
                    <option value="Venmo">{t("receipt.venmoApp")}</option>
                    <option value="PayPal">{t("receipt.paypalBalance")}</option>
                    <option value="Bank Transfer">{t("receipt.bankWireAch")}</option>
                    <option value="Other">{t("receipt.otherMode")}</option>
                  </Select>
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="receipt-received-by">
                    {t("receipt.receivedBy")}
                  </Label>
                  <Input
                    type="text"
                    placeholder={t("receipt.staffAgentName")}
                    id="receipt-received-by"
                    value={data.receivedBy}
                    onChange={(e) => setData({ ...data, receivedBy: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Custom Notes terms */}
            <div>
              <H3 className="text-slate-500 border-b border-slate-100 pb-2 mb-4">
                {t("receipt.label6CustomFootnotes")}
              </H3>
              <div className="space-y-4">
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="receipt-notes">
                    {t("receipt.memoInternalNotes")}
                  </Label>
                  <Textarea
                    rows={2}
                    className="min-h-20"
                    id="receipt-notes"
                    placeholder={t("receipt.detailsAboutProjectSignOffsMilestonesComplianceOr")}
                    value={data.notes}
                    onChange={(e) => setData({ ...data, notes: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="receipt-thank-you">
                    {t("receipt.thankYouSignOffMessage")}
                  </Label>
                  <Input
                    type="text"
                    id="receipt-thank-you"
                    value={data.thankYouMessage}
                    onChange={(e) => setData({ ...data, thankYouMessage: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Core Safe usage and policy disclaimer to satisfy policy constraint */}
          <AlertBanner title={t("receipt.officialLegalComplianceNote")} variant="success">
            {t("receipt.thisReceiptGeneratorIsExplicitlyDesignedForDocumented")}
          </AlertBanner>
        </div>

        {/* Live document preview */}
        <div
          className={`min-w-0 lg:col-span-5 space-y-4 lg:sticky print:static print:block ${embedded ? "lg:top-0" : "lg:top-20"} ${activeTab === "preview" ? "block" : "hidden lg:block"}`}
        >
          {/* The advanced workspace owns both custom inputs and its PDF preview. */}
          {selectedAdvancedTemplate ? (
            <AdvancedTemplateWorkspace
              mode="export"
              alwaysShowPreview
              adapter={receiptAdapter}
              draft={data}
              onDraftChange={setData}
              onTrackClick={onTrackClick}
              templates={[selectedAdvancedTemplate]}
            />
          ) : null}

          {!selectedAdvancedTemplate && (
            <div className="relative group transition-all duration-200 shadow-2xl rounded-2xl border border-slate-200">
              <div
                className={`p-8 bg-white min-h-0 print:min-h-[750px] font-sans text-slate-800 ${selectedTheme === "compact" ? "max-w-md mx-auto" : ""}`}
                id="receipt-print-area"
                dir={locale === "ar" ? "rtl" : "ltr"}
              >
                {/* Receipt Header Style layout matching selected theme */}
                <div className="flex justify-between items-start border-b border-slate-200 pb-5 mb-6">
                  <div>
                    <span className="text-[10px] uppercase font-black tracking-widest text-[#0066cc]">
                      {t("receipt.receiptGenerator")}
                    </span>
                    <h1 className="text-xl font-black text-slate-950 uppercase tracking-tight leading-none mt-1">
                      {data.business.name || t("receipt.companySellerName")}
                    </h1>
                    {data.business.taxId && (
                      <span className="block text-[11px] font-mono font-bold text-slate-400 mt-1">
                        EIN/TAX ID: {data.business.taxId}
                      </span>
                    )}
                    {data.business.addressLine1 && (
                      <p className="text-[10px] text-slate-500 font-semibold leading-relaxed mt-2 max-w-sm">
                        {data.business.addressLine1}, {data.business.city}, {data.business.state}{" "}
                        {data.business.zipCode}
                      </p>
                    )}
                    {data.business.email && (
                      <span className="block text-[10px] text-slate-500 font-mono font-medium">
                        {data.business.email}
                      </span>
                    )}
                  </div>

                  <div className="text-right">
                    <div className="inline-block px-3 py-1 rounded bg-slate-100 text-[10px] font-black text-slate-900 border border-slate-200">
                      {t(
                        data.paymentStatus === "Paid"
                          ? "receipt.fullyPaid"
                          : data.paymentStatus === "Refunded"
                            ? "receipt.fullyRefunded"
                            : data.paymentStatus === "Partially Paid"
                              ? "receipt.partiallyPaid"
                              : "receipt.unpaid",
                      )}
                    </div>
                    <div className="text-[11px] font-black text-slate-900 mt-3 font-mono">{data.receiptNumber}</div>
                    <div className="text-[10px] text-slate-500 font-bold font-mono mt-1">
                      {data.receiptDate} {data.receiptTime}
                    </div>
                  </div>
                </div>

                {/* Sender / Payer billing mapping layout boxes */}
                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div className="bg-slate-50/60 p-3 rounded-lg border border-slate-100">
                    <span className="text-[11px] uppercase font-black tracking-widest text-slate-400 block mb-1">
                      {t("receipt.clientName")}
                    </span>
                    <span className="font-extrabold text-slate-900 block text-xs">
                      {data.customer.name || "------------------"}
                    </span>
                    {data.customer.company && (
                      <span className="text-[10px] text-slate-500 block font-bold">{data.customer.company}</span>
                    )}
                    {data.customer.addressLine1 && (
                      <p className="text-[10px] text-slate-500 mt-1.5 leading-snug">
                        {data.customer.addressLine1}, {data.customer.city}, {data.customer.state}{" "}
                        {data.customer.zipCode}
                      </p>
                    )}
                  </div>

                  <div className="bg-slate-50/60 p-3 rounded-lg border border-slate-100 space-y-1 text-xs">
                    <span className="text-[11px] uppercase font-black tracking-widest text-slate-400 block pb-0.5">
                      {t("receipt.paymentStatus")}
                    </span>
                    <div className="flex justify-between text-[10px] font-bold">
                      <span className="text-slate-500">{t("receipt.paymentMethod")}</span>
                      <span className="text-slate-950 font-black">{data.paymentMethod}</span>
                    </div>
                    {data.transactionId && (
                      <div className="flex justify-between text-[10px] font-mono">
                        <span className="text-slate-500">{t("receipt.transactionRefId")}</span>
                        <span className="font-extrabold text-[#0066cc]">{data.transactionId}</span>
                      </div>
                    )}
                    {data.relatedInvoiceNumber && (
                      <div className="flex justify-between text-[10px] font-mono">
                        <span className="text-slate-500">{t("receipt.relatedInvoice")}</span>
                        <span className="text-slate-800 font-extrabold">{data.relatedInvoiceNumber}</span>
                      </div>
                    )}
                    {data.receivedBy && (
                      <div className="flex justify-between text-[10px] font-semibold pt-1">
                        <span className="text-slate-400 block text-[11px] uppercase font-bold">
                          {t("receipt.receivedBy")}
                        </span>
                        <span className="text-slate-700 block">{data.receivedBy}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Items Render Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden mb-6">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 border-b border-slate-200">
                        <th className="py-2.5 px-3">{t("receipt.description")}</th>
                        <th className="py-2.5 px-3 text-center w-16">{t("receipt.qty")}</th>
                        <th className="py-2.5 px-3 text-right w-24">{t("receipt.rate")}</th>
                        <th className="py-2.5 px-3 text-right w-28">{t("receipt.amountReceived")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lineItems.map((item, idx) => (
                        <tr key={item.id || idx} className="border-b border-slate-100 last:border-b-0">
                          <td className="py-3 px-3 font-semibold text-slate-900 leading-snug">
                            {item.description || "Uncategorized Item Description"}
                            {item.taxable && (
                              <span className="text-[11px] bg-sky-50 text-sky-700 border border-sky-200 px-1.5 py-0.2 rounded-full font-bold ml-1">
                                {t("receipt.tax")}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center font-mono font-bold text-slate-500">{item.quantity}</td>
                          <td className="py-3 px-3 text-right font-mono font-semibold">
                            {money(Number(item.unitPrice || 0))}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                            {money(Number(item.quantity || 0) * Number(item.unitPrice || 0))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Receipt Totals Summary Box */}
                <div className="grid grid-cols-12 gap-4 items-start pt-2">
                  <div className="col-span-6 space-y-3">
                    {data.notes && (
                      <div className="bg-slate-50/60 p-2.5 rounded-lg border border-slate-100">
                        <span className="text-[11px] uppercase tracking-wider text-slate-400 font-extrabold block mb-0.5">
                          {t("receipt.memoInternalNotes")}
                        </span>
                        <p className="text-[10px] text-slate-600 leading-normal font-medium">{data.notes}</p>
                      </div>
                    )}
                    {data.paymentNote && (
                      <span className="block text-[11px] font-mono text-slate-400 italic">
                        {t("receipt.paymentMethod")}: {data.paymentNote}
                      </span>
                    )}
                  </div>

                  <div className="col-span-6 space-y-1.5 text-xs text-right font-semibold">
                    <div className="flex justify-between font-mono">
                      <span className="text-slate-500">{t("receipt.subtotal")}</span>
                      <span className="text-slate-800">{money(totals.subtotal)}</span>
                    </div>

                    {data.discountType !== "none" && (
                      <div className="flex justify-between text-rose-600 font-mono">
                        <span>
                          {t("receipt.discountType")} (
                          {data.discountType === "percent" ? `${data.discountValue}%` : t("receipt.fixedAmount")}):
                        </span>
                        <span>-{money(totals.discountAmount)}</span>
                      </div>
                    )}

                    {data.salesTaxRate > 0 && (
                      <div className="flex justify-between font-mono">
                        <span className="text-slate-500">
                          {data.salesTaxLabel} ({data.salesTaxRate}%):
                        </span>
                        <span className="text-slate-800">{money(totals.taxAmount)}</span>
                      </div>
                    )}

                    {data.tip > 0 && (
                      <div className="flex justify-between font-mono">
                        <span className="text-slate-500">{t("receipt.tipGratuity")}</span>
                        <span className="text-slate-800">{money(Number(data.tip))}</span>
                      </div>
                    )}

                    {data.additionalFee > 0 && (
                      <div className="flex justify-between font-mono">
                        <span className="text-slate-500">{t("receipt.additionalFee")}</span>
                        <span className="text-slate-800">{money(Number(data.additionalFee))}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-2.5 border-t border-slate-200 mt-2">
                      <span className="text-xs uppercase font-black text-slate-900">{t("receipt.total")}</span>
                      <span className="text-lg font-black text-slate-950 font-mono">{money(totals.total)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span>{t("receipt.amountReceived")}:</span>
                      <span>{money(totals.amountReceived)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t("receipt.netReceived")}:</span>
                      <span>{money(totals.netReceived)}</span>
                    </div>
                    {totals.customerCredit > 0 && (
                      <div className="flex justify-between">
                        <span>{t("receipt.customerCredit")}:</span>
                        <span>{money(totals.customerCredit)}</span>
                      </div>
                    )}
                    {data.amountRefunded > 0 && (
                      <div className="flex justify-between text-yellow-700 font-mono text-[11px] pt-1">
                        <span>{t("receipt.amountRefunded")}</span>
                        <span>-{money(Number(data.amountRefunded))}</span>
                      </div>
                    )}

                    {totals.balanceDue > 0 && (
                      <div className="flex justify-between text-slate-700 font-mono text-[11px]">
                        <span>{t("receipt.balanceDue")}:</span>
                        <span>{money(totals.balanceDue)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Thank you sign-off footer */}
                <div className="text-center pt-12 mt-12 border-t border-slate-100">
                  <p className="text-xs font-black text-slate-950 tracking-tight uppercase">{data.thankYouMessage}</p>
                  <span className="block text-[11px] text-slate-400/80 font-mono uppercase tracking-widest mt-1">
                    Receipt generated by SmartTools Paperwork Security Engine. Shared under offline-first protocols.
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </WorkbenchPanes>

      {/* 5. Frequently Asked Questions (FAQ) Section - SEO Content */}
      {!embedded && (
        <div
          className="mt-16 border-t border-slate-200/80 pt-12 space-y-6 max-w-4xl mx-auto print:hidden"
          id="receipt-seo-section"
        >
          <H3 className="text-slate-900 text-center">{t("receipt.frequentlyAnsweredInquiriesFaq")}</H3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-slate-600">
            <div className="space-y-1">
              <H4 className="text-slate-900">{t("receipt.areStandardReceiptsCreatedHereTotallyFree")}</H4>
              <P>{t("receipt.yesAbsolutelyUnlikeCloudSuitesSmarttoolsPaperworkDoes")}</P>
            </div>
            <div className="space-y-1">
              <H4 className="text-slate-900">{t("receipt.canIConvertAPaidInvoiceDirectlyInto")}</H4>
              <P>{t("receipt.certainlyUsingOurSmartLocalDataBridgeClick")}</P>
            </div>
            <div className="space-y-1">
              <H4 className="text-slate-900">{t("receipt.isMyCustomerSPrivacyPreservedSecurely")}</H4>
              <P>{t("receipt.label100YesYourInputsNeverFloatToBackup")}</P>
            </div>
            <div className="space-y-1">
              <H4 className="text-slate-900">{t("receipt.underWhatConditionsShouldIUseThisReceipt")}</H4>
              <P>{t("receipt.onlyForGenuineSettledTransactionsFromYourOwn")}</P>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
