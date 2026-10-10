"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import { localizeHref, type Locale } from "@/lib/i18n/config";
import {
  CheckCircle2,
  CircleX,
  Clock,
  Eye,
  Grid,
  PenLine,
  Printer,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  Caption,
  H2,
  H3,
  Muted,
  P,
  Text,
  AccountNavigation,
  AccountNavigationProps,
  AlertBanner,
  AppContainer,
  Button,
  ToolActionButton,
  Card,
  Field,
  Input,
  PageHero,
  ProductHeader,
  StatusBadge,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/index.tsx";
import { CanopyFooter } from "@/components/canopy/CanopyFooter";
import { seedTemplates, type DocumentTemplate } from "@/lib/invoice-templates/index.ts";
import type { ResolvedTool } from "@/lib/tool-catalog/index.ts";
import AdvancedTemplateWorkspace from "./AdvancedTemplateWorkspace";
import { PaperworkWorkspace } from "./PaperworkWorkspace";
import { WorkbenchPanes } from "@/components/tool-workbench/WorkbenchPanes";
import ExpenseReportPage from "./expense/ExpenseReportPage";
import FAQSection from "./FAQSection";
import InvoiceForm from "./InvoiceForm";
import InvoicePreviewRenderer from "./InvoicePreviewRenderer";
import MileageLogPage from "./mileage/MileageLogPage";
import NecTrackerPage from "./nec1099/NecTrackerPage";
import QuarterlyTaxEstimatorPage from "./tax/QuarterlyTaxEstimatorPage";
import ReceiptGeneratorPage from "./receipt/ReceiptGeneratorPage";
import RelatedTools from "./RelatedTools";
import SEOContent from "./SEOContent";
import TemplateSelector from "./TemplateSelector";
import W9RequestPage from "./w9/W9RequestPage";
import { invoiceAdapter } from "@/lib/paperwork/documentAdapters";
import type { InvoiceData } from "@/lib/paperwork/types";
import { validateInvoiceData } from "@/lib/paperwork/utils/invoiceValidation";
import { getInitialBlankInvoice, getSampleInvoice } from "@/lib/paperwork/utils/sampleData";

function trackEvent(eventName: string, payload: Record<string, unknown> = {}) {
  console.log(`[Analytics Event] "${eventName}" tracked:`, payload);
}

const TOOL_COMPONENTS: Record<
  string,
  ComponentType<{
    onTrackClick: (itemName: string) => void;
    templates?: readonly DocumentTemplate[];
  }>
> = {
  "expense-report": ExpenseReportPage,
  "mileage-log": MileageLogPage,
  "quarterly-tax-estimator": QuarterlyTaxEstimatorPage,
  "w9-request": W9RequestPage,
  "1099-nec-tracker": NecTrackerPage,
};

type DialogName = "clear" | "sample" | "upgrade";
type ToastMessage = { message: string; tone: "error" | "success" };

function AppDialog({
  children,
  labelledBy,
  onClose,
  open,
}: {
  children: ReactNode;
  labelledBy: string;
  onClose: () => void;
  open: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      aria-labelledby={labelledBy}
      className="m-auto w-[calc(100%_-_2rem)] max-w-lg rounded-3xl border border-border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-foreground/55 backdrop:backdrop-blur-xs"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      ref={dialogRef}
    >
      {children}
    </dialog>
  );
}

function defaultTemplate(templates: readonly DocumentTemplate[]) {
  const published = templates.filter(
    (template) => template.status === "published" && template.documentType === "invoice",
  );
  const fallback = seedTemplates.filter((template) => template.status === "published");
  const template =
    published.find((candidate) => candidate.isDefault) ??
    published[0] ??
    fallback.find((candidate) => candidate.isDefault) ??
    fallback[0];
  if (!template) throw new Error("A published invoice template is required.");
  return template;
}

export default function App({
  availableLocales = ["en"],
  account,
  componentKey,
  templates,
  tools,
}: {
  availableLocales?: readonly Locale[];
  account: AccountNavigationProps;
  componentKey: string;
  templates: readonly DocumentTemplate[];
  tools: readonly (ResolvedTool & { href?: string })[];
}) {
  const t = useTranslations("Tool.runtime");
  const locale = useLocale() as Locale;
  const currentTool = tools.find((tool) => tool.componentKey === componentKey);
  const [edited, setEdited] = useState(false);
  const isInvoice = componentKey === "invoice-generator";
  const isReceipt = componentKey === "receipt-generator";
  const ToolComponent = TOOL_COMPONENTS[componentKey];
  const formSectionRef = useRef<HTMLDivElement>(null);
  const [invoiceData, setInvoiceData] = useState<InvoiceData>(getInitialBlankInvoice());
  const [selectedTemplate, setSelectedTemplate] = useState(() => defaultTemplate(templates));
  const [templateSelectionReady, setTemplateSelectionReady] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pdfAction, setPdfAction] = useState<"download" | "print" | null>(null);
  const [pdfError, setPdfError] = useState("");
  const [activeDialog, setActiveDialog] = useState<DialogName | null>(null);
  const [activeMobileTab, setActiveMobileTab] = useState<"edit" | "preview">("edit");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistError, setWaitlistError] = useState("");
  const toastTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const storedTemplateId = localStorage.getItem("paperworkkit.advanced-template.invoice.selected");
    const storedTemplate = templates.find(
      (template) => template.id === storedTemplateId && template.status === "published",
    );
    if (storedTemplate) setSelectedTemplate(storedTemplate);
    setTemplateSelectionReady(true);
  }, [templates]);

  useEffect(() => {
    if (!templateSelectionReady) return;
    localStorage.setItem("paperworkkit.advanced-template.invoice.selected", selectedTemplate.id);
  }, [selectedTemplate.id, templateSelectionReady]);

  function showToast(message: string, tone: ToastMessage["tone"] = "success") {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ message, tone });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3500);
  }

  useEffect(
    () => () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isInvoice) return;
    try {
      const saved = localStorage.getItem("paperwork_kit_invoice_draft");
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (
          parsed &&
          typeof parsed === "object" &&
          "business" in parsed &&
          "client" in parsed &&
          "invoice" in parsed &&
          "lineItems" in parsed &&
          Array.isArray(parsed.lineItems)
        ) {
          setInvoiceData(parsed as InvoiceData);
          showToast(t("shared.app.draftRestored"));
        }
      }
    } catch (error) {
      console.error("Failed to restore the local invoice draft", error);
      showToast(t("shared.app.restoreFailed"), "error");
    }
  }, [isInvoice]);

  useEffect(() => {
    if (!isInvoice) return;
    setSaveStatus("saving");
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem("paperwork_kit_invoice_draft", JSON.stringify(invoiceData));
        setSaveStatus("saved");
      } catch (error) {
        console.error("Failed to save the local invoice draft", error);
        setSaveStatus("saved");
        showToast(t("shared.app.saveFailed"), "error");
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [invoiceData, isInvoice]);

  function validateInvoice() {
    const nextErrors = validateInvoiceData(invoiceData, (key) => t(`invoice.validation.${key}`));
    setErrors(nextErrors);
    const errorCount = Object.keys(nextErrors).length;
    if (errorCount) {
      setActiveMobileTab("edit");
      showToast(t("shared.app.reviewFields", { count: errorCount }), "error");
      window.requestAnimationFrame(() => {
        formSectionRef.current?.scrollIntoView({ behavior: "smooth" });
      });
      return false;
    }
    return true;
  }

  async function generateInvoicePdf(action: "download" | "print") {
    if (selectedTemplate.layoutFamily === "advanced") return;
    if (!validateInvoice()) return;

    const printWindow = action === "print" ? window.open("about:blank", "_blank") : null;
    if (action === "print" && !printWindow) {
      setPdfError(t("shared.app.allowPrintablePopups"));
      showToast(t("shared.app.printBlocked"), "error");
      return;
    }
    if (printWindow) printWindow.opener = null;

    setPdfAction(action);
    setPdfError("");
    const invoiceNumber = invoiceData.invoice.invoiceNumber.trim().replace(/[^a-z0-9_-]+/gi, "-");
    const fileName = `invoice-${invoiceNumber || "draft"}.pdf`;

    try {
      const [{ pdf }, { default: InvoicePdfDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./InvoicePdfDocument"),
      ]);
      const blob = await pdf(<InvoicePdfDocument data={invoiceData} template={selectedTemplate} />).toBlob();
      const url = URL.createObjectURL(blob);

      if (action === "print" && printWindow) {
        printWindow.location.href = url;
        trackEvent("invoice_print_clicked");
        showToast(t("shared.app.printOpened"));
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.append(link);
        link.click();
        link.remove();
        trackEvent("invoice_pdf_downloaded");
        showToast(t("shared.app.downloaded"));
      }

      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      printWindow?.close();
      console.error("Failed to generate the invoice PDF", error);
      setPdfError(t("shared.app.pdfFailed"));
      showToast(t("shared.app.pdfFailed"), "error");
    } finally {
      setPdfAction(null);
    }
  }

  function loadSampleInvoice() {
    setEdited(true);
    setInvoiceData(getSampleInvoice());
    setErrors({});
    setPdfError("");
    setActiveDialog(null);
    setActiveMobileTab("edit");
    trackEvent("sample_invoice_loaded");
    showToast(t("shared.app.sampleLoaded"));
  }

  function clearInvoice() {
    setEdited(true);
    try {
      localStorage.removeItem("paperwork_kit_invoice_draft");
    } catch (error) {
      console.error("Failed to remove the local invoice draft", error);
    }
    setInvoiceData(getInitialBlankInvoice());
    setErrors({});
    setPdfError("");
    setShowTemplates(true);
    setActiveDialog(null);
    setActiveMobileTab("edit");
    trackEvent("invoice_draft_cleared");
    showToast(t("shared.app.draftCleared"));
  }

  function handleTrackClick(eventName: string) {
    if (eventName === "upgrade_pro_clicked" || eventName.includes("pro_only")) {
      setWaitlistError("");
      setActiveDialog("upgrade");
      trackEvent("upgrade_prompt_clicked", { item: eventName });
      return;
    }
    trackEvent(eventName);
  }

  function joinWaitlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWaitlistError("");

    try {
      localStorage.setItem(
        "paperwork_pro_waitlist_interest",
        JSON.stringify({ email: waitlistEmail.trim(), savedAt: new Date().toISOString() }),
      );
    } catch (error) {
      console.error("Failed to save Paperwork Pro interest", error);
      setWaitlistError(t("shared.app.waitlistSaveFailed"));
      return;
    }

    setActiveDialog(null);
    setWaitlistEmail("");
    trackEvent("upgrade_waitlist_interest_saved");
    showToast(t("shared.app.interestSaved"));
  }

  function showMobileTab(tab: "edit" | "preview") {
    setActiveMobileTab(tab);
    window.requestAnimationFrame(() => {
      formSectionRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }

  return (
    <div
      className="flex min-h-screen flex-col bg-background text-foreground selection:bg-foreground selection:text-primary-foreground"
      id="app-root"
      data-tool-locales={JSON.stringify(availableLocales)}
      data-language-switch-state={pdfAction ? "running" : edited ? "dirty" : "clean"}
      onInputCapture={() => setEdited(true)}
    >
      <ProductHeader
        account={account}
        actions={
          <div className="flex items-center gap-2">
            {isInvoice ? (
              <>
                <Caption className="hidden items-center gap-1 text-muted-foreground 2xl:flex">
                  <Clock className="h-3.5 w-3.5" />
                  {saveStatus === "saving" ? t("shared.app.saving") : t("shared.app.draftSaved")}
                </Caption>
                <Button
                  aria-label={t("shared.app.clearInvoiceDraft")}
                  onClick={() => setActiveDialog("clear")}
                  size="sm"
                  variant="danger-subtle"
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                  <span className="hidden 2xl:inline">{t("shared.app.clear")}</span>
                </Button>
              </>
            ) : null}
            <AccountNavigation {...account} />
          </div>
        }
        compact
        href={localizeHref("/paperwork", locale)}
        name="Paperwork"
      />

      <main className={isInvoice ? "grow pb-20 lg:pb-0" : "grow"}>
        {isReceipt ? (
          <PaperworkWorkspace title={currentTool?.name ?? t("shared.app.receiptGenerator")}>
            <ReceiptGeneratorPage onTrackClick={handleTrackClick} templates={templates} />
          </PaperworkWorkspace>
        ) : ToolComponent ? (
          <PaperworkWorkspace title={currentTool?.name ?? t("shared.app.documentWorkspace")}>
            <ToolComponent onTrackClick={handleTrackClick} templates={templates} />
          </PaperworkWorkspace>
        ) : isInvoice ? (
          <>
            <PageHero
              actions={
                <>
                  <Button onClick={() => formSectionRef.current?.scrollIntoView({ behavior: "smooth" })} size="lg">
                    {t("shared.app.startInvoice")}
                  </Button>
                  <Button
                    className="compact:hidden"
                    onClick={() => setActiveDialog("clear")}
                    size="lg"
                    variant="danger-subtle"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    {t("shared.app.clearInvoiceDraft")}
                  </Button>
                  {selectedTemplate.layoutFamily !== "advanced" ? (
                    <Button onClick={() => setActiveDialog("sample")} size="lg" variant="secondary">
                      <RefreshCw className="mr-1 inline h-4 w-4" />
                      {t("shared.app.loadSample")}
                    </Button>
                  ) : null}
                </>
              }
              align="center"
              className="border-b border-border bg-card print:hidden"
              compact
              description={currentTool?.description ?? t("shared.app.createPreviewAndDownloadAProfessionalPdf")}
              eyebrow={t("shared.app.usFocusedSmallBusinessToolkit")}
              title={currentTool?.name ?? t("shared.app.freeInvoiceGeneratorForContractorsSmallBusinesses")}
            />

            <PaperworkWorkspace title={currentTool?.name ?? t("shared.app.invoiceGenerator")}>
              <div id="invoice-generator" ref={formSectionRef}>
                <H2 className="sr-only">{t("shared.app.invoiceWorkspace")}</H2>
                <AppContainer className="py-8">
                  {Object.keys(errors).length ? (
                    <AlertBanner
                      className="mb-6 print:hidden"
                      title={t("shared.app.fieldAttention", { count: Object.keys(errors).length })}
                      variant="warning"
                    >
                      {t("shared.app.reviewTheHighlightedSellerClientInvoiceLine")}
                    </AlertBanner>
                  ) : null}

                  {selectedTemplate.layoutFamily !== "advanced" ? (
                    <Tabs
                      id="mobile-view-tabs"
                      className="mb-6 print:hidden lg:hidden"
                      onValueChange={(value) => showMobileTab(value as "edit" | "preview")}
                      value={activeMobileTab}
                    >
                      <TabsList
                        aria-label={t("shared.app.invoiceWorkspaceView")}
                        className="grid w-full grid-cols-2 border border-border"
                        variant="segmented"
                      >
                        <TabsTrigger
                          aria-controls="editor-panel"
                          className="min-h-11"
                          id="mobile-edit-tab"
                          value="edit"
                        >
                          <PenLine aria-hidden="true" className="size-4" />
                          {t("shared.app.editDetails")}
                        </TabsTrigger>
                        <TabsTrigger
                          aria-controls="preview-panel"
                          className="min-h-11"
                          id="mobile-preview-tab"
                          value="preview"
                        >
                          <Eye aria-hidden="true" className="size-4" />
                          {t("shared.app.livePreview")}
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  ) : null}

                  {selectedTemplate.layoutFamily === "advanced" ? (
                    <div className="grid gap-6">
                      <Card className="p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex min-w-0 items-center gap-3">
                            <Grid aria-hidden="true" className="size-5 shrink-0 text-primary" />
                            <div className="min-w-0">
                              <H3>{t("shared.app.selectedTheme", { name: selectedTemplate.name })}</H3>
                              <Muted className="text-muted-foreground">
                                {t("shared.app.publishedTemplatesAreManagedCentrally")}
                              </Muted>
                            </div>
                          </div>
                          <Button onClick={() => setShowTemplates((shown) => !shown)} size="sm">
                            {showTemplates ? t("shared.app.hideThemes") : t("shared.app.changeTheme")}
                          </Button>
                        </div>
                        {showTemplates ? (
                          <div className="mt-4">
                            <TemplateSelector
                              documentLabel={t("shared.app.invoice")}
                              onSelect={(nextTemplate) => {
                                setEdited(true);
                                setSelectedTemplate(nextTemplate);
                                setInvoiceData((current) => ({
                                  ...current,
                                  template: nextTemplate.slug,
                                }));
                                showToast(t("shared.app.themeChanged", { name: nextTemplate.name }));
                              }}
                              selectedTemplateId={selectedTemplate.id}
                              templates={templates}
                            />
                          </div>
                        ) : null}
                      </Card>
                      <AdvancedTemplateWorkspace
                        adapter={invoiceAdapter}
                        draft={invoiceData}
                        onDraftChange={(nextDraft) => {
                          setEdited(true);
                          setInvoiceData(nextDraft);
                        }}
                        onTrackClick={handleTrackClick}
                        templates={[selectedTemplate]}
                      />
                    </div>
                  ) : (
                    <WorkbenchPanes className="grid items-start gap-8 lg:grid-cols-12">
                      <div
                        aria-labelledby="mobile-edit-tab"
                        className={`space-y-6 print:hidden lg:col-span-7 lg:block ${
                          activeMobileTab === "edit" ? "block" : "hidden"
                        }`}
                        id="editor-panel"
                        role="tabpanel"
                      >
                        <Card className="p-4">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex min-w-0 items-center gap-3">
                              <Grid aria-hidden="true" className="size-5 shrink-0 text-primary" />
                              <div className="min-w-0">
                                <H3>{t("shared.app.selectedTheme", { name: selectedTemplate.name })}</H3>
                                <Muted className="text-muted-foreground">
                                  {t("shared.app.publishedTemplatesAreManagedCentrally")}
                                </Muted>
                              </div>
                            </div>
                            <Button onClick={() => setShowTemplates((shown) => !shown)} size="sm">
                              {showTemplates ? t("shared.app.hideThemes") : t("shared.app.changeTheme")}
                            </Button>
                          </div>
                          {showTemplates ? (
                            <div className="mt-4">
                              <TemplateSelector
                                onSelect={(template) => {
                                  setEdited(true);
                                  setSelectedTemplate(template);
                                  setInvoiceData((current) => ({
                                    ...current,
                                    template: template.slug,
                                  }));
                                  showToast(t("shared.app.themeChanged", { name: template.name }));
                                }}
                                selectedTemplateId={selectedTemplate.id}
                                templates={templates}
                              />
                            </div>
                          ) : null}
                        </Card>
                        <InvoiceForm
                          data={invoiceData}
                          errors={errors}
                          onChange={(nextDraft) => {
                            setEdited(true);
                            setInvoiceData(nextDraft);
                          }}
                        />
                      </div>
                      <div
                        aria-labelledby="mobile-preview-tab"
                        className={`space-y-4 lg:sticky lg:top-20 lg:col-span-5 lg:block ${
                          activeMobileTab === "preview" ? "block" : "hidden"
                        }`}
                        id="preview-panel"
                        role="tabpanel"
                      >
                        <Card className="space-y-3 p-4 print:hidden">
                          <div className="flex items-center justify-between border-b border-border pb-2 text-muted-foreground">
                            <Text>{t("shared.app.pdfActions")}</Text>
                            <StatusBadge variant="success">{t("shared.app.readyToExport")}</StatusBadge>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <ToolActionButton
                              action="download"
                              disabled={pdfAction !== null}
                              onClick={() => void generateInvoicePdf("download")}
                            >
                              {pdfAction === "download" ? t("shared.app.generating") : t("shared.app.downloadPdf")}
                            </ToolActionButton>
                            <Button
                              disabled={pdfAction !== null}
                              onClick={() => void generateInvoicePdf("print")}
                              variant="secondary"
                            >
                              <Printer className="mr-1 inline h-4 w-4" />
                              {pdfAction === "print" ? t("shared.app.opening") : t("shared.app.printPdf")}
                            </Button>
                          </div>
                          {pdfError ? (
                            <P className="text-destructive" role="alert">
                              {pdfError}
                            </P>
                          ) : null}
                          <Muted className="text-center text-muted-foreground">
                            {t("shared.app.downloadSavesAPdfPrintOpensThe")}
                          </Muted>
                        </Card>
                        <Card className="overflow-hidden p-0 shadow-xl">
                          <InvoicePreviewRenderer data={invoiceData} template={selectedTemplate} />
                        </Card>
                      </div>
                    </WorkbenchPanes>
                  )}
                </AppContainer>
              </div>
            </PaperworkWorkspace>
          </>
        ) : null}
      </main>

      <div className="mt-auto print:hidden">
        {isInvoice ? (
          <>
            <SEOContent />
            <FAQSection />
          </>
        ) : null}
        <RelatedTools currentComponentKey={componentKey} onTrackClick={handleTrackClick} tools={tools} />
        <CanopyFooter />
      </div>

      {isInvoice && selectedTemplate.layoutFamily !== "advanced" ? (
        <div
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 gap-2 border-t border-border bg-card/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg backdrop-blur-sm print:hidden lg:hidden"
          id="mobile-invoice-actions"
        >
          <Button
            className="min-h-11"
            onClick={() => showMobileTab(activeMobileTab === "edit" ? "preview" : "edit")}
            variant="secondary"
          >
            {activeMobileTab === "edit" ? (
              <Eye aria-hidden="true" className="size-4" />
            ) : (
              <PenLine aria-hidden="true" className="size-4" />
            )}
            {activeMobileTab === "edit" ? t("shared.app.previewInvoice") : t("shared.app.editInvoice")}
          </Button>
          <ToolActionButton
            action="download"
            disabled={pdfAction !== null}
            onClick={() => void generateInvoicePdf("download")}
          >
            {pdfAction === "download" ? t("shared.app.generating") : t("shared.app.downloadPdf")}
          </ToolActionButton>
        </div>
      ) : null}

      {toast ? (
        <div
          aria-atomic="true"
          aria-live={toast.tone === "error" ? "assertive" : "polite"}
          className="fixed right-4 bottom-24 z-50 flex max-w-sm items-center gap-2.5 rounded-lg bg-surface-ink px-4 py-[13px] text-on-ink shadow-[0_8px_24px_#00000026] lg:bottom-6"
          role={toast.tone === "error" ? "alert" : "status"}
        >
          {toast.tone === "error" ? (
            <CircleX aria-hidden="true" className="size-5 shrink-0 text-status-danger" />
          ) : (
            <Text className="grid size-5 shrink-0 place-items-center rounded-full bg-success text-on-ink">
              <CheckCircle2 aria-hidden="true" className="size-[13px]" />
            </Text>
          )}
          <Text>{toast.message}</Text>
        </div>
      ) : null}

      <AppDialog
        labelledBy="sample-dialog-title"
        onClose={() => setActiveDialog(null)}
        open={activeDialog === "sample"}
      >
        <div className="space-y-5 p-6">
          <div className="flex items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-full border border-primary/20 bg-primary/10 text-primary">
              <RefreshCw aria-hidden="true" className="size-5" />
            </div>
            <H2 id="sample-dialog-title">{t("shared.app.loadSampleInvoice")}</H2>
          </div>
          <Muted className="text-muted-foreground">{t("shared.app.thisReplacesEveryCurrentInvoiceFieldWith")}</Muted>
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => setActiveDialog(null)} variant="secondary">
              {t("shared.app.keepEditing")}
            </Button>
            <Button onClick={loadSampleInvoice} variant="strong">
              {t("shared.app.loadSampleInvoice2")}
            </Button>
          </div>
        </div>
      </AppDialog>

      <AppDialog labelledBy="clear-dialog-title" onClose={() => setActiveDialog(null)} open={activeDialog === "clear"}>
        <div className="space-y-5 p-6">
          <div className="flex items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-full border border-destructive/20 bg-destructive/10 text-destructive">
              <Trash2 aria-hidden="true" className="size-5" />
            </div>
            <H2 id="clear-dialog-title">{t("shared.app.clearThisInvoiceDraft")}</H2>
          </div>
          <Muted className="text-muted-foreground">{t("shared.app.thisPermanentlyRemovesTheCurrentInvoiceFrom")}</Muted>
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => setActiveDialog(null)} variant="secondary">
              {t("shared.app.keepInvoice")}
            </Button>
            <Button onClick={clearInvoice} variant="destructive">
              {t("shared.app.clearInvoiceDraft")}
            </Button>
          </div>
        </div>
      </AppDialog>

      <AppDialog
        labelledBy="upgrade-dialog-title"
        onClose={() => setActiveDialog(null)}
        open={activeDialog === "upgrade"}
      >
        <div className="relative space-y-6 p-6 sm:p-8">
          <Button
            aria-label={t("shared.app.closeWaitlistDialog")}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            onClick={() => setActiveDialog(null)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" className="size-5" />
          </Button>
          <div className="space-y-3 pr-10">
            <div className="grid size-11 place-items-center rounded-xl bg-foreground text-background shadow-sm">
              <Sparkles aria-hidden="true" className="size-5" />
            </div>
            <P className="text-primary">{t("shared.app.paperworkProEarlyAccess")}</P>
            <H2 id="upgrade-dialog-title">{t("shared.app.joinThePaperworkProWaitlist")}</H2>
            <Muted className="text-muted-foreground">{t("shared.app.saveYourInterestLocallyForUpcomingCloud")}</Muted>
          </div>
          <form className="space-y-4" onSubmit={joinWaitlist}>
            <Field
              description={t("shared.app.storedOnlyInThisBrowserUntilRemote")}
              error={waitlistError || undefined}
              htmlFor="waitlist-email"
              label={t("shared.app.emailAddress")}
              required
            >
              <Input
                autoComplete="email"
                id="waitlist-email"
                onChange={(event) => setWaitlistEmail(event.target.value)}
                placeholder="you@example.com"
                required
                type="email"
                value={waitlistEmail}
              />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={() => setActiveDialog(null)} variant="secondary">
                {t("shared.app.notNow")}
              </Button>
              <Button type="submit" variant="strong">
                {t("shared.app.joinWaitingList")}
              </Button>
            </div>
          </form>
        </div>
      </AppDialog>
    </div>
  );
}
