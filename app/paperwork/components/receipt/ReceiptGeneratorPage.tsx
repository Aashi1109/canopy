"use client";

import { useTranslations } from "next-intl";

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
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
  ToolPageHeader,
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
import { AdvancedDocumentPreview, downloadAdvancedDocumentPdf } from "../AdvancedDocumentPreview";
import AdvancedTemplateWorkspace from "../AdvancedTemplateWorkspace";
import { getReceiptTemplateInputs } from "@/lib/paperwork/advancedTemplateData";
import { receiptAdapter } from "@/lib/paperwork/documentAdapters";
import {
  calculateReceiptTotals,
  DEFAULT_RECEIPT_DATA,
  SAMPLE_RECEIPT_DATA,
  type ReceiptData,
  type ReceiptItem,
} from "@/lib/paperwork/receiptDocument";
import { DataBridge, DataBridgeKeys, type ReceiptSummary } from "@/lib/paperwork/shared/dataBridge";

export { calculateReceiptTotals, DEFAULT_RECEIPT_DATA, SAMPLE_RECEIPT_DATA };
export type { ReceiptData, ReceiptItem };

export default function ReceiptGeneratorPage({
  onTrackClick,
  templates = [],
}: {
  onTrackClick: (item: string) => void;
  templates?: readonly DocumentTemplate[];
}) {
  const t = useTranslations("Tool.runtime");
  const advancedTemplates = templates.filter(
    (template): template is AdvancedDocumentTemplate =>
      template.documentType === "receipt" && template.layoutFamily === "advanced",
  );
  const [data, setData] = useState<ReceiptData>(() => {
    return DataBridge.get<ReceiptData>(DataBridgeKeys.RECEIPT_DRAFT, DEFAULT_RECEIPT_DATA);
  });

  const [selectedTheme, setSelectedTheme] = useState<"classic" | "modern" | "compact" | "rent" | "contractor">(
    "classic",
  );
  const [selectedAdvancedTemplateId, setSelectedAdvancedTemplateId] = useState("");
  const [pdfAction, setPdfAction] = useState(false);
  const [pdfError, setPdfError] = useState("");
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

    // Map InvoiceData to ReceiptData
    const mapped: ReceiptData = {
      ...DEFAULT_RECEIPT_DATA,
      business: { ...inv.business },
      customer: {
        name: inv.client.name,
        company: inv.client.company,
        email: inv.client.email,
        phone: inv.client.phone,
        addressLine1: inv.client.addressLine1,
        addressLine2: inv.client.addressLine2,
        city: inv.client.city,
        state: inv.client.state,
        zipCode: inv.client.zipCode,
        country: inv.client.country,
      },
      relatedInvoiceNumber: inv.invoice.invoiceNumber,
      lineItems: inv.lineItems.map((item, idx) => ({
        id: item.id || `item-${idx}`,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxable: item.taxable || false,
      })),
      discountType:
        inv.totalsConfig.discountType === "percent"
          ? "percent"
          : inv.totalsConfig.discountType === "fixed"
            ? "fixed"
            : "none",
      discountValue: inv.totalsConfig.discountValue,
      salesTaxRate: inv.totalsConfig.taxRate,
      salesTaxLabel: inv.totalsConfig.taxLabel || "State Sales Tax",
      additionalFee: inv.totalsConfig.shippingFee || 0,
      paymentMethod: inv.payment.methods?.[0]
        ? inv.payment.methods[0].substring(0, 1).toUpperCase() + inv.payment.methods[0].substring(1)
        : "Bank Transfer",
      thankYouNote: "Thank you for your prompt payment of invoice " + inv.invoice.invoiceNumber,
    } as any;

    setData(mapped);
    setShowImportConfirm(false);
    onTrackClick("import_invoice_completed");
    alert(t("receipt.draftInvoiceValuesImportedSuccessfully"));
  };

  const handleLoadSample = () => {
    setData(SAMPLE_RECEIPT_DATA);
    setErrors({});
    onTrackClick("receipt_sample_loaded");
  };

  const handleClearDraft = () => {
    if (confirm(t("receipt.areYouSureYouWantToClearCurrent"))) {
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
          [field]: field === "quantity" || field === "unitPrice" ? (val === "" ? "" : Number(val)) : val,
        };
      }
      return item;
    });
    setData({ ...data, lineItems: updated });
  };

  const totals = calculateReceiptTotals(data);
  const selectedAdvancedTemplate = advancedTemplates.find((template) => template.id === selectedAdvancedTemplateId);
  const advancedTemplateInputs = selectedAdvancedTemplate
    ? getReceiptTemplateInputs(data, totals, selectedAdvancedTemplate.config.sampleData)
    : null;

  const validateReceipt = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!data.business.name.trim()) {
      newErrors["business.name"] = t("receipt.sellerProviderNameIsRequiredToGenerateReceipts");
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Validate fields prior to print or download
  const handlePrint = async () => {
    onTrackClick?.(selectedAdvancedTemplate ? "receipt_pdf_downloaded" : "receipt_print_clicked");
    if (validateReceipt()) {
      if (!selectedAdvancedTemplate || !advancedTemplateInputs) {
        window.print();
        return;
      }

      setPdfAction(true);
      setPdfError("");
      try {
        const receiptNumber = data.receiptNumber.trim().replace(/[^a-z0-9_-]+/gi, "-");
        await downloadAdvancedDocumentPdf({
          template: selectedAdvancedTemplate,
          data: advancedTemplateInputs,
          fileName: `receipt-${receiptNumber || "draft"}.pdf`,
        });
      } catch (error) {
        console.error("Failed to generate the receipt PDF", error);
        setPdfError(t("receipt.thePdfCouldNotBeGeneratedPleaseTry"));
      } finally {
        setPdfAction(false);
      }
    } else {
      const el = document.getElementById("receipt-mobile-tabs") || document.getElementById("receipt-seo-section");
      el?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleCopySummary = () => {
    const formattedAmt = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(totals.total);
    const summary = `Receipt ${data.receiptNumber} confirms payment of ${formattedAmt} from ${data.customer.name || "Customer"} to ${data.business.name || "Seller"} on ${data.receiptDate}. Payment Method: ${data.paymentMethod}.`;
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    onTrackClick?.("receipt_copy_summary_clicked");
  };

  const initialDraft = useRef(JSON.stringify(data));
  const hasEdits = JSON.stringify(data) !== initialDraft.current;

  return (
    <div
      className="grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
      id="receipt-generator-wrapper"
      data-language-switch-state={pdfAction ? "running" : hasEdits ? "dirty" : "clean"}
    >
      {/* 1. Header Banner */}
      <ToolPageHeader
        actions={
          <>
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
          </>
        }
        className="print:hidden"
        description={t("receipt.formulatePaymentRecordsForYourSmallBusinessZero")}
        eyebrow={<StatusBadge variant="success">{t("receipt.legitimateRecordsTool")}</StatusBadge>}
        title={t("receipt.receiptGenerator")}
      />

      {advancedTemplates.length ? (
        <Card className="mb-6 grid gap-2 p-4 print:hidden">
          <Label className="text-muted-foreground" htmlFor="receipt-template-mode">
            {t("receipt.receiptTemplate")}
          </Label>
          <Select
            id="receipt-template-mode"
            onChange={(event) => {
              setSelectedAdvancedTemplateId(event.target.value);
              setPdfError("");
            }}
            value={selectedAdvancedTemplateId}
          >
            <option value="">{t("receipt.useABuiltInReceiptLayout")}</option>
            {advancedTemplates.map((advancedTemplate) => (
              <option key={advancedTemplate.id} value={advancedTemplate.id}>
                {advancedTemplate.name}
              </option>
            ))}
          </Select>
        </Card>
      ) : null}

      {selectedAdvancedTemplate ? (
        <AdvancedTemplateWorkspace
          adapter={receiptAdapter}
          draft={data}
          onDraftChange={setData}
          onTrackClick={onTrackClick}
          templates={[selectedAdvancedTemplate]}
        />
      ) : null}

      {/* 2. Notification Overlay if Importing Invoice */}
      {showImportConfirm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md space-y-4 rounded-2xl shadow-xl">
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
      <Tabs
        className={`${selectedAdvancedTemplate ? "hidden" : ""} mb-6 md:hidden print:hidden`}
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
      </Tabs>

      {/* 4. Split Screen Editor & Live Rendered Frame */}
      <WorkbenchPanes
        active={!selectedAdvancedTemplate}
        className={`${selectedAdvancedTemplate ? "hidden" : "grid"} grid-cols-1 lg:grid-cols-12 gap-8 items-start`}
      >
        {/* Editor Fields Column */}
        <div className={`lg:col-span-7 space-y-6 ${activeTab === "edit" ? "block" : "hidden md:block"} print:hidden`}>
          <Card className="space-y-6 rounded-2xl p-6 shadow-sm">
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
                    value={data.receiptNumber}
                    onChange={(e) => setData({ ...data, receiptNumber: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="receipt-date">
                    {t("receipt.receiptDate")}
                  </Label>
                  <Input
                    type="date"
                    id="receipt-date"
                    value={data.receiptDate}
                    onChange={(e) => setData({ ...data, receiptDate: e.target.value })}
                  />
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
                    value={data.paymentStatus}
                    onChange={(e) => setData({ ...data, paymentStatus: e.target.value as any })}
                  >
                    <option value="Paid">{t("receipt.fullyPaid")}</option>
                    <option value="Partially Paid">{t("receipt.partiallyRefunded")}</option>
                    <option value="Refunded">{t("receipt.fullyRefunded")}</option>
                  </Select>
                </div>
              </div>
            </div>

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
                        value={item.description}
                        onChange={(e) => handleItemChange(item.id, "description", e.target.value)}
                      />
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
                          value={item.quantity}
                          onChange={(e) => handleItemChange(item.id, "quantity", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="block text-slate-400 mb-0.5" htmlFor={`receipt-item-${item.id}-rate`}>
                          {t("receipt.rate")}
                        </Label>
                        <Input
                          type="number"
                          placeholder="0.00"
                          id={`receipt-item-${item.id}-rate`}
                          value={item.unitPrice}
                          onChange={(e) => handleItemChange(item.id, "unitPrice", e.target.value)}
                        />
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
                      value={data.discountValue}
                      onChange={(e) => setData({ ...data, discountValue: Math.max(0, Number(e.target.value)) })}
                    />
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
                    value={data.salesTaxRate}
                    onChange={(e) => setData({ ...data, salesTaxRate: Math.max(0, Number(e.target.value)) })}
                  />
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
                    value={data.tip}
                    onChange={(e) => setData({ ...data, tip: Math.max(0, Number(e.target.value)) })}
                  />
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="receipt-additional-fee">
                    {t("receipt.additionalFee")}
                  </Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    id="receipt-additional-fee"
                    value={data.additionalFee}
                    onChange={(e) => setData({ ...data, additionalFee: Math.max(0, Number(e.target.value)) })}
                  />
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

        {/* Live design theme selector + Visual render block */}
        <div
          className={`lg:col-span-5 space-y-6 lg:sticky lg:top-20 ${activeTab === "preview" ? "block" : "hidden md:block"}`}
        >
          <Card className="space-y-3 rounded-2xl p-4 shadow-sm print:hidden">
            <div className="flex items-center justify-between text-slate-500 border-b border-slate-100 pb-2">
              <Text>{t("receipt.receiptVisualLayout")}</Text>
              <StatusBadge variant="success">
                {selectedAdvancedTemplate?.name ?? t("receipt.builtInLayout")}
              </StatusBadge>
            </div>

            {/* Design preset layout options */}
            <div className="grid grid-cols-5 gap-1 pt-1">
              {[
                { key: "classic", label: t("receipt.themes.classic") },
                { key: "modern", label: t("receipt.themes.modern") },
                { key: "compact", label: t("receipt.themes.compact") },
                { key: "rent", label: t("receipt.themes.rent") },
                { key: "contractor", label: t("receipt.themes.contractor") },
              ].map((themeOpt) => (
                <Button
                  key={themeOpt.key}
                  onClick={() => {
                    setSelectedTheme(themeOpt.key as typeof selectedTheme);
                    setSelectedAdvancedTemplateId("");
                    setPdfError("");
                  }}
                  className="h-auto rounded-lg py-1.5"
                  size="sm"
                  type="button"
                  variant={selectedTheme === themeOpt.key ? "strong" : "secondary"}
                >
                  {themeOpt.label}
                </Button>
              ))}
            </div>

            {advancedTemplates.length ? (
              <div>
                <Label className="mb-1 block text-slate-500" htmlFor="receipt-published-template">
                  {t("receipt.publishedCustomTemplate")}
                </Label>
                <Select
                  id="receipt-published-template"
                  onChange={(event) => {
                    setSelectedAdvancedTemplateId(event.target.value);
                    setPdfError("");
                  }}
                  value={selectedAdvancedTemplateId}
                >
                  <option value="">{t("receipt.useABuiltInLayout")}</option>
                  {advancedTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2 pt-2">
              <ToolActionButton
                action="download"
                disabled={pdfAction}
                icon={selectedAdvancedTemplate ? undefined : <Printer />}
                onClick={() => void handlePrint()}
                type="button"
              >
                <span>
                  {pdfAction
                    ? t("receipt.generating")
                    : selectedAdvancedTemplate
                      ? t("receipt.downloadPdf")
                      : t("receipt.printSavePdf")}
                </span>
              </ToolActionButton>
              <ToolActionButton
                action="copy"
                icon={copied ? <Check /> : undefined}
                onClick={handleCopySummary}
                type="button"
              >
                <span>{copied ? t("receipt.copied") : t("receipt.copySummary")}</span>
              </ToolActionButton>
            </div>
            {pdfError ? (
              <P className="text-destructive" role="alert">
                {pdfError}
              </P>
            ) : null}
            <P className="text-slate-500 text-center">
              {selectedAdvancedTemplate
                ? t("receipt.theDownloadedPdfUsesYourPublishedCustomLayout")
                : t("receipt.printOutputsGenerateVectorScalableStandardLetterSize")}
            </P>
          </Card>

          {/* Letter layout block preview */}
          {selectedAdvancedTemplate && advancedTemplateInputs ? (
            <AdvancedDocumentPreview
              className="shadow-2xl"
              data={advancedTemplateInputs}
              onError={setPdfError}
              template={selectedAdvancedTemplate}
            />
          ) : (
            <div className="relative group transition-all duration-200 shadow-2xl rounded-2xl border border-slate-200">
              <div
                className={`p-8 bg-white min-h-[750px] font-sans text-slate-800 ${selectedTheme === "compact" ? "max-w-md mx-auto" : ""}`}
                id="receipt-print-area"
                dir="ltr"
              >
                {/* Receipt Header Style layout matching selected theme */}
                <div className="flex justify-between items-start border-b border-slate-200 pb-5 mb-6">
                  <div>
                    <span className="text-[10px] uppercase font-black tracking-widest text-[#0066cc]">
                      {data.receiptType} RECEIPT
                    </span>
                    <h1 className="text-xl font-black text-slate-950 uppercase tracking-tight leading-none mt-1">
                      {data.business.name || "YOUR BUSINESS NAME"}
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
                      {data.paymentStatus.toUpperCase()}
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
                      Received From
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
                      Payment Parameters
                    </span>
                    <div className="flex justify-between text-[10px] font-bold">
                      <span className="text-slate-500">Method:</span>
                      <span className="text-slate-950 font-black">{data.paymentMethod}</span>
                    </div>
                    {data.transactionId && (
                      <div className="flex justify-between text-[10px] font-mono">
                        <span className="text-slate-500">Ref ID:</span>
                        <span className="font-extrabold text-[#0066cc]">{data.transactionId}</span>
                      </div>
                    )}
                    {data.relatedInvoiceNumber && (
                      <div className="flex justify-between text-[10px] font-mono">
                        <span className="text-slate-500">Invoice:</span>
                        <span className="text-slate-800 font-extrabold">{data.relatedInvoiceNumber}</span>
                      </div>
                    )}
                    {data.receivedBy && (
                      <div className="flex justify-between text-[10px] font-semibold pt-1">
                        <span className="text-slate-400 block text-[11px] uppercase font-bold">Processed By</span>
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
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3 text-center w-16">Qty</th>
                        <th className="py-2.5 px-3 text-right w-24">Rate</th>
                        <th className="py-2.5 px-3 text-right w-28">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lineItems.map((item, idx) => (
                        <tr key={item.id || idx} className="border-b border-slate-100 last:border-b-0">
                          <td className="py-3 px-3 font-semibold text-slate-900 leading-snug">
                            {item.description || "Uncategorized Item Description"}
                            {item.taxable && (
                              <span className="text-[11px] bg-sky-50 text-sky-700 border border-sky-200 px-1.5 py-0.2 rounded-full font-bold ml-1">
                                TAXABLE
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center font-mono font-bold text-slate-500">{item.quantity}</td>
                          <td className="py-3 px-3 text-right font-mono font-semibold">
                            ${Number(item.unitPrice || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                            ${(Number(item.quantity || 0) * Number(item.unitPrice || 0)).toFixed(2)}
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
                          Note Memo
                        </span>
                        <p className="text-[10px] text-slate-600 leading-normal font-medium">{data.notes}</p>
                      </div>
                    )}
                    {data.paymentNote && (
                      <span className="block text-[11px] font-mono text-slate-400 italic">
                        Payment info: {data.paymentNote}
                      </span>
                    )}
                  </div>

                  <div className="col-span-6 space-y-1.5 text-xs text-right font-semibold">
                    <div className="flex justify-between font-mono">
                      <span className="text-slate-500">Subtotal:</span>
                      <span className="text-slate-800">${totals.subtotal.toFixed(2)}</span>
                    </div>

                    {data.discountType !== "none" && (
                      <div className="flex justify-between text-rose-600 font-mono">
                        <span>Discount ({data.discountType === "percent" ? `${data.discountValue}%` : "Fixed"}):</span>
                        <span>-${totals.discountAmount.toFixed(2)}</span>
                      </div>
                    )}

                    {data.salesTaxRate > 0 && (
                      <div className="flex justify-between font-mono">
                        <span className="text-slate-500">
                          {data.salesTaxLabel} ({data.salesTaxRate}%):
                        </span>
                        <span className="text-slate-800">${totals.taxAmount.toFixed(2)}</span>
                      </div>
                    )}

                    {data.tip > 0 && (
                      <div className="flex justify-between font-mono">
                        <span className="text-slate-500">Tip / Gratuity:</span>
                        <span className="text-slate-800">${Number(data.tip).toFixed(2)}</span>
                      </div>
                    )}

                    {data.additionalFee > 0 && (
                      <div className="flex justify-between font-mono">
                        <span className="text-slate-500">Additional Fee:</span>
                        <span className="text-slate-800">${Number(data.additionalFee).toFixed(2)}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-2.5 border-t border-slate-200 mt-2">
                      <span className="text-xs uppercase font-black text-slate-900">Total Paid:</span>
                      <span className="text-lg font-black text-slate-950 font-mono">${totals.total.toFixed(2)}</span>
                    </div>

                    {data.amountRefunded > 0 && (
                      <div className="flex justify-between text-yellow-700 font-mono text-[11px] pt-1">
                        <span>Refunded portion:</span>
                        <span>-${Number(data.amountRefunded).toFixed(2)}</span>
                      </div>
                    )}

                    {totals.balanceDue > 0 && (
                      <div className="flex justify-between text-slate-700 font-mono text-[11px]">
                        <span>Effective Settled:</span>
                        <span>${totals.balanceDue.toFixed(2)}</span>
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
    </div>
  );
}
