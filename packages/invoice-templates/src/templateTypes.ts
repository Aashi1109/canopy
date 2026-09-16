/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type TemplateCategory =
  "simple" | "professional" | "creative" | "service" | "modern" | "classic";
export type TemplateStatus = "draft" | "published" | "archived";
export type LayoutFamily = "classic" | "modern" | "compact" | "bold" | "minimal" | "service";
export type TemplateLayoutFamily = LayoutFamily | "advanced";
export type DocumentType =
  | "invoice"
  | "receipt"
  | "expense-report"
  | "mileage-log"
  | "quarterly-tax-estimator"
  | "w9-request"
  | "1099-nec-tracker";
export type PageFormat = "A4" | "LETTER" | "RECEIPT_80MM" | "RECEIPT_58MM";
export type TemplateDocumentType = DocumentType;
export type TemplatePageFormat = PageFormat;
export type TemplateScalarControl =
  | "text"
  | "textarea"
  | "email"
  | "phone"
  | "number"
  | "currency"
  | "percent"
  | "date"
  | "time"
  | "select"
  | "checkbox";
export type DocumentFieldValueType =
  "text" | "number" | "boolean" | "date" | "time" | "table" | "image";
export type DocumentFieldSource = "user" | "computed" | "system" | "reference";
export type PdfmeBindingType = "text" | "table" | "image";
export type SensitiveDataClassification =
  "none" | "contact" | "financial" | "tax" | "masked-tax-id";

export interface PdfmeSchema {
  name: string;
  type: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  [key: string]: unknown;
}

export interface PdfmeBlankBase {
  width: number;
  height: number;
  padding: [number, number, number, number];
  staticSchema?: PdfmeSchema[];
}

export interface PdfmeTemplate {
  basePdf: PdfmeBlankBase;
  schemas: PdfmeSchema[][];
  pdfmeVersion?: string;
  [key: string]: unknown;
}

export interface TemplateFormEntryBase {
  key: string;
  label: string;
  helpText?: string;
  required: boolean;
  enabled: boolean;
}

export interface BuiltInTemplateFormEntry extends TemplateFormEntryBase {
  kind: "builtin";
}

export interface CustomScalarTemplateFormEntry extends TemplateFormEntryBase {
  kind: "custom";
  control: TemplateScalarControl;
  options?: string[];
}

export interface CustomRepeaterColumn {
  key: string;
  label: string;
  control: TemplateScalarControl;
  required: boolean;
  options?: string[];
}

export interface CustomRepeaterTemplateFormEntry extends TemplateFormEntryBase {
  kind: "repeater";
  columns: CustomRepeaterColumn[];
  minRows?: number;
}

export type TemplateFormEntry =
  BuiltInTemplateFormEntry | CustomScalarTemplateFormEntry | CustomRepeaterTemplateFormEntry;

export interface TemplateFormSection {
  id: string;
  label: string;
  entries: TemplateFormEntry[];
}

export interface TemplateFormConfig {
  sections: TemplateFormSection[];
}

export interface DocumentRepeaterColumnDefinition {
  key: string;
  label: string;
  valueType: Exclude<DocumentFieldValueType, "table" | "image">;
  control: TemplateScalarControl;
  required: boolean;
  sampleValue: string;
  sensitiveData: SensitiveDataClassification;
}

export interface DocumentFieldDefinition {
  key: string;
  label: string;
  description: string;
  section: string;
  valueType: DocumentFieldValueType;
  control: TemplateScalarControl | "repeater" | "hidden";
  source: DocumentFieldSource;
  required: boolean;
  computationRequired: boolean;
  sampleValue: string;
  allowedBindingTypes: readonly PdfmeBindingType[];
  repeaterColumns?: readonly DocumentRepeaterColumnDefinition[];
  sensitiveData: SensitiveDataClassification;
}

export interface DocumentDefinition {
  documentType: DocumentType;
  label: string;
  toolComponentKey: string;
  defaultPageFormat: PageFormat;
  allowedPageFormats: readonly PageFormat[];
  fields: readonly DocumentFieldDefinition[];
  defaultForm: TemplateFormConfig;
  requiredBindings: readonly string[];
  complianceMode: "normal" | "internal-tax-report" | "tax-request";
}

export interface AdvancedTemplateConfigV2 {
  editor: "pdfme";
  schemaVersion: 2;
  pageFormat: PageFormat;
  template: PdfmeTemplate;
  sampleData: Record<string, string>;
  form: TemplateFormConfig;
}

export type AdvancedTemplateConfig = AdvancedTemplateConfigV2;

export interface LegacyAdvancedTemplateConfig {
  editor: "pdfme";
  schemaVersion?: undefined;
  pageFormat: PageFormat;
  template: PdfmeTemplate;
  sampleData: Record<string, string>;
  form?: undefined;
}

export interface AdvancedTemplateValidationIssue {
  code: string;
  message: string;
  path: string;
}

export interface AdvancedTemplateValidationResult {
  valid: boolean;
  errors: AdvancedTemplateValidationIssue[];
  warnings: AdvancedTemplateValidationIssue[];
}
export interface InvoiceTemplateConfig {
  theme: {
    primaryColor: string;
    accentColor: string;
    textColor: string;
    mutedTextColor: string;
    borderColor: string;
    backgroundColor: string;
    surfaceColor: string;
  };

  typography: {
    fontFamily:
      | "Inter"
      | "Helvetica"
      | "Times-Roman"
      | "Courier"
      | "Georgia"
      | "JetBrains Mono"
      | "Space Grotesk"
      | "Outfit";
    headingSize: "sm" | "md" | "lg" | "xl";
    bodySize: "xs" | "sm" | "md";
    lineHeight: "tight" | "normal" | "relaxed";
  };

  page: {
    size: "LETTER" | "A4";
    margin: "compact" | "normal" | "spacious";
    showPageBorder: boolean;
  };

  header: {
    style: "left-logo" | "centered" | "right-meta" | "split" | "minimal";
    logoPosition: "left" | "center" | "right";
    logoSize: "xs" | "sm" | "md" | "lg";
    showInvoiceTitle: boolean;
    invoiceTitleText: string;
    showStatusBadge: boolean;
  };

  businessBlock: {
    position: "header" | "left-column" | "right-column";
    showBusinessName: boolean;
    showContactName: boolean;
    showEmail: boolean;
    showPhone: boolean;
    showWebsite: boolean;
    showAddress: boolean;
    showTaxId: boolean;
  };

  clientBlock: {
    title: string;
    position: "left-column" | "right-column" | "full-width";
    showClientName: boolean;
    showCompany: boolean;
    showEmail: boolean;
    showPhone: boolean;
    showAddress: boolean;
  };

  metaBlock: {
    position: "right-column" | "below-header" | "table";
    showInvoiceNumber: boolean;
    showInvoiceDate: boolean;
    showDueDate: boolean;
    showPaymentTerms: boolean;
    showPoNumber: boolean;
    showProjectName: boolean;
  };

  lineItemsTable: {
    style: "simple" | "striped" | "bordered" | "minimal";
    headerBackground: boolean;
    showItemNumbers: boolean;
    showTaxableColumn: boolean;
    descriptionLabel: string;
    quantityLabel: string;
    rateLabel: string;
    amountLabel: string;
  };

  totalsBlock: {
    position: "right" | "full-width";
    style: "simple" | "boxed" | "highlight-total";
    showSubtotal: boolean;
    showDiscount: boolean;
    showTax: boolean;
    showShipping: boolean;
    showAmountPaid: boolean;
    showBalanceDue: boolean;
    emphasizeBalanceDue: boolean;
  };

  paymentBlock: {
    title: string;
    style: "plain" | "boxed" | "muted";
    showPaymentMethods: boolean;
    showInstructions: boolean;
    showLateFeeNote: boolean;
  };

  notesBlock: {
    title: string;
    style: "plain" | "boxed" | "muted";
    showNotes: boolean;
    showTerms: boolean;
    showThankYouNote: boolean;
  };

  footer: {
    showFooter: boolean;
    text: string;
    showGeneratedWith: boolean;
    alignment: "left" | "center" | "right";
  };

  watermark: {
    enabled: boolean;
    text: string;
    opacity: number;
    position: "center" | "bottom-right";
  };

  sectionOrder: string[];

  labels: {
    invoiceTitle: string;
    billTo: string;
    from: string;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    paymentTerms: string;
    poNumber: string;
    projectName: string;
    subtotal: string;
    discount: string;
    tax: string;
    shipping: string;
    amountPaid: string;
    total: string;
    balanceDue: string;
    paymentInstructions: string;
    notes: string;
    terms: string;
  };

  visibility: {
    showLogo: boolean;
    showBusinessBlock: boolean;
    showClientBlock: boolean;
    showMetaBlock: boolean;
    showLineItems: boolean;
    showTotals: boolean;
    showPaymentInstructions: boolean;
    showNotes: boolean;
    showTerms: boolean;
    showFooter: boolean;
  };

  pdf: {
    pageSize: "LETTER" | "A4";
    orientation: "portrait";
    repeatTableHeader: boolean;
    avoidRowSplit: boolean;
    showPageNumbers: boolean;
  };
}

export interface InvoiceTemplate {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: TemplateCategory;
  status: TemplateStatus;
  isDefault: boolean;
  version: number;
  documentType: "invoice";
  layoutFamily: LayoutFamily;
  config: InvoiceTemplateConfig;
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  createdBy?: string;
  updatedBy?: string;
  isPremium?: boolean;
  requiredPlan?: "free" | "pro" | "business";
}

export interface AdvancedDocumentTemplate extends Omit<
  InvoiceTemplate,
  "documentType" | "layoutFamily" | "config"
> {
  documentType: DocumentType;
  layoutFamily: "advanced";
  config: AdvancedTemplateConfig;
}

export type DocumentTemplate = InvoiceTemplate | AdvancedDocumentTemplate;
