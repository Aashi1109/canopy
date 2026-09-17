"use client";

import { useEffect, useRef, useState, type ComponentType, type FormEvent, type ReactNode } from "react";
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
} from "@canopy/ui";
import { CanopyFooter } from "@/components/canopy/CanopyFooter";
import { seedTemplates, type DocumentTemplate } from "@canopy/invoice-templates";
import type { ResolvedTool } from "@canopy/tool-catalog";
import AdvancedTemplateWorkspace from "./AdvancedTemplateWorkspace";
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
  account,
  componentKey,
  templates,
  tools,
}: {
  account: AccountNavigationProps;
  componentKey: string;
  templates: readonly DocumentTemplate[];
  tools: readonly ResolvedTool[];
}) {
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
          showToast("Previous invoice draft restored from this browser.");
        }
      }
    } catch (error) {
      console.error("Failed to restore the local invoice draft", error);
      showToast("The saved draft could not be restored. Start with a new invoice.", "error");
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
        showToast("This draft could not be saved in your browser.", "error");
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [invoiceData, isInvoice]);

  function validateInvoice() {
    const nextErrors = validateInvoiceData(invoiceData);
    setErrors(nextErrors);
    const errorCount = Object.keys(nextErrors).length;
    if (errorCount) {
      setActiveMobileTab("edit");
      showToast(`Review ${errorCount} highlighted ${errorCount === 1 ? "field" : "fields"} before exporting.`, "error");
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
      setPdfError("Allow pop-ups to open the printable PDF.");
      showToast("Your browser blocked the printable PDF. Allow pop-ups and try again.", "error");
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
        showToast("Printable invoice opened in a new tab.");
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.append(link);
        link.click();
        link.remove();
        trackEvent("invoice_pdf_downloaded");
        showToast("Invoice PDF downloaded.");
      }

      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      printWindow?.close();
      console.error("Failed to generate the invoice PDF", error);
      setPdfError("The PDF could not be generated. Please try again.");
      showToast("The PDF could not be generated. Please try again.", "error");
    } finally {
      setPdfAction(null);
    }
  }

  function loadSampleInvoice() {
    setInvoiceData(getSampleInvoice());
    setErrors({});
    setPdfError("");
    setActiveDialog(null);
    setActiveMobileTab("edit");
    trackEvent("sample_invoice_loaded");
    showToast("Sample invoice loaded. Replace the example details with your own.");
  }

  function clearInvoice() {
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
    showToast("Invoice draft cleared from this browser.");
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
      setWaitlistError("Your browser could not save this email. Check storage permissions and try again.");
      return;
    }

    setActiveDialog(null);
    setWaitlistEmail("");
    trackEvent("upgrade_waitlist_interest_saved");
    showToast("Paperwork Pro interest saved in this browser.");
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
    >
      <ProductHeader
        account={account}
        actions={
          <div className="flex items-center gap-2">
            {isInvoice ? (
              <>
                <Caption className="hidden items-center gap-1 text-muted-foreground 2xl:flex">
                  <Clock className="h-3.5 w-3.5" />
                  {saveStatus === "saving" ? "Saving…" : "Draft saved in browser"}
                </Caption>
                <Button
                  aria-label="Clear invoice draft"
                  onClick={() => setActiveDialog("clear")}
                  size="sm"
                  variant="danger-subtle"
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                  <span className="hidden 2xl:inline">Clear</span>
                </Button>
              </>
            ) : null}
            <AccountNavigation {...account} />
          </div>
        }
        className="sticky top-2 z-40 mx-2 rounded-full border shadow-sm"
        href="/"
        name="SmartTools"
      />

      <main className={isInvoice ? "grow pb-20 lg:pb-0" : "grow"}>
        {isReceipt ? (
          <ReceiptGeneratorPage onTrackClick={handleTrackClick} templates={templates} />
        ) : ToolComponent ? (
          <ToolComponent onTrackClick={handleTrackClick} templates={templates} />
        ) : isInvoice ? (
          <>
            <PageHero
              actions={
                <>
                  <Button onClick={() => formSectionRef.current?.scrollIntoView({ behavior: "smooth" })} size="lg">
                    Start invoice
                  </Button>
                  <Button
                    className="md:hidden"
                    onClick={() => setActiveDialog("clear")}
                    size="lg"
                    variant="danger-subtle"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    Clear invoice draft
                  </Button>
                  {selectedTemplate.layoutFamily !== "advanced" ? (
                    <Button onClick={() => setActiveDialog("sample")} size="lg" variant="secondary">
                      <RefreshCw className="mr-1 inline h-4 w-4" />
                      Load sample
                    </Button>
                  ) : null}
                </>
              }
              align="center"
              className="border-b border-border bg-card print:hidden"
              compact
              description="Create, preview, and download a professional PDF invoice. No signup required; drafts stay in this browser."
              eyebrow="US-focused small business toolkit"
              title="Free Invoice Generator for Contractors & Small Businesses"
            />

            <div id="invoice-generator" ref={formSectionRef}>
              <H2 className="sr-only">Invoice workspace</H2>
              <AppContainer className="py-8">
                {Object.keys(errors).length ? (
                  <AlertBanner
                    className="mb-6 print:hidden"
                    title={`${Object.keys(errors).length} invoice ${Object.keys(errors).length === 1 ? "field needs" : "fields need"} attention`}
                    variant="warning"
                  >
                    Review the highlighted seller, client, invoice, line-item, and date details. Correct them before
                    downloading or printing the PDF.
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
                      aria-label="Invoice workspace view"
                      className="grid w-full grid-cols-2 border border-border"
                      variant="segmented"
                    >
                      <TabsTrigger aria-controls="editor-panel" className="min-h-11" id="mobile-edit-tab" value="edit">
                        <PenLine aria-hidden="true" className="size-4" />
                        Edit details
                      </TabsTrigger>
                      <TabsTrigger
                        aria-controls="preview-panel"
                        className="min-h-11"
                        id="mobile-preview-tab"
                        value="preview"
                      >
                        <Eye aria-hidden="true" className="size-4" />
                        Live preview
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
                            <H3>Invoice theme: {selectedTemplate.name}</H3>
                            <Muted className="text-muted-foreground">Published templates are managed centrally.</Muted>
                          </div>
                        </div>
                        <Button onClick={() => setShowTemplates((shown) => !shown)} size="sm">
                          {showTemplates ? "Hide themes" : "Change theme"}
                        </Button>
                      </div>
                      {showTemplates ? (
                        <div className="mt-4">
                          <TemplateSelector
                            documentLabel="invoice"
                            onSelect={(nextTemplate) => {
                              setSelectedTemplate(nextTemplate);
                              setInvoiceData((current) => ({
                                ...current,
                                template: nextTemplate.slug,
                              }));
                              showToast(`Invoice theme changed to ${nextTemplate.name}.`);
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
                      onDraftChange={setInvoiceData}
                      onTrackClick={handleTrackClick}
                      templates={[selectedTemplate]}
                    />
                  </div>
                ) : (
                  <div className="grid items-start gap-8 lg:grid-cols-12">
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
                              <H3>Invoice theme: {selectedTemplate.name}</H3>
                              <Muted className="text-muted-foreground">
                                Published templates are managed centrally.
                              </Muted>
                            </div>
                          </div>
                          <Button onClick={() => setShowTemplates((shown) => !shown)} size="sm">
                            {showTemplates ? "Hide themes" : "Change theme"}
                          </Button>
                        </div>
                        {showTemplates ? (
                          <div className="mt-4">
                            <TemplateSelector
                              onSelect={(template) => {
                                setSelectedTemplate(template);
                                setInvoiceData((current) => ({
                                  ...current,
                                  template: template.slug,
                                }));
                                showToast(`Invoice theme changed to ${template.name}.`);
                              }}
                              selectedTemplateId={selectedTemplate.id}
                              templates={templates}
                            />
                          </div>
                        ) : null}
                      </Card>
                      <InvoiceForm data={invoiceData} errors={errors} onChange={setInvoiceData} />
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
                          <Text>PDF ACTIONS</Text>
                          <StatusBadge variant="success">Ready to export</StatusBadge>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <ToolActionButton
                            action="download"
                            disabled={pdfAction !== null}
                            onClick={() => void generateInvoicePdf("download")}
                          >
                            {pdfAction === "download" ? "Generating…" : "Download PDF"}
                          </ToolActionButton>
                          <Button
                            disabled={pdfAction !== null}
                            onClick={() => void generateInvoicePdf("print")}
                            variant="secondary"
                          >
                            <Printer className="mr-1 inline h-4 w-4" />
                            {pdfAction === "print" ? "Opening…" : "Print PDF"}
                          </Button>
                        </div>
                        {pdfError ? (
                          <P className="text-destructive" role="alert">
                            {pdfError}
                          </P>
                        ) : null}
                        <Muted className="text-center text-muted-foreground">
                          Download saves a PDF. Print opens the same PDF in a new tab; allow pop-ups if prompted.
                        </Muted>
                      </Card>
                      <Card className="overflow-hidden p-0 shadow-xl">
                        <InvoicePreviewRenderer data={invoiceData} template={selectedTemplate} />
                      </Card>
                    </div>
                  </div>
                )}
              </AppContainer>
            </div>
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
            {activeMobileTab === "edit" ? "Preview invoice" : "Edit invoice"}
          </Button>
          <ToolActionButton
            action="download"
            disabled={pdfAction !== null}
            onClick={() => void generateInvoicePdf("download")}
          >
            {pdfAction === "download" ? "Generating…" : "Download PDF"}
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
            <H2 id="sample-dialog-title">Load sample invoice?</H2>
          </div>
          <Muted className="text-muted-foreground">
            This replaces every current invoice field with fictional example data. Download anything you need before
            continuing.
          </Muted>
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => setActiveDialog(null)} variant="secondary">
              Keep editing
            </Button>
            <Button onClick={loadSampleInvoice} variant="strong">
              Load sample invoice
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
            <H2 id="clear-dialog-title">Clear this invoice draft?</H2>
          </div>
          <Muted className="text-muted-foreground">
            This permanently removes the current invoice from this browser. There is no undo.
          </Muted>
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => setActiveDialog(null)} variant="secondary">
              Keep invoice
            </Button>
            <Button onClick={clearInvoice} variant="destructive">
              Clear invoice draft
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
            aria-label="Close waitlist dialog"
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
            <P className="text-primary">Paperwork Pro early access</P>
            <H2 id="upgrade-dialog-title">Join the Paperwork Pro waitlist</H2>
            <Muted className="text-muted-foreground">
              Save your interest locally for upcoming cloud backups, client delivery, and status tracking. No email is
              sent from this preview.
            </Muted>
          </div>
          <form className="space-y-4" onSubmit={joinWaitlist}>
            <Field
              description="Stored only in this browser until remote enrollment is available."
              error={waitlistError || undefined}
              htmlFor="waitlist-email"
              label="Email address"
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
                Not now
              </Button>
              <Button type="submit" variant="strong">
                Join waiting list
              </Button>
            </div>
          </form>
        </div>
      </AppDialog>
    </div>
  );
}
