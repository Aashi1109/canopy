/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from "zod";
import { isSupportedPageFormat } from "./advancedTemplateDefaults.ts";
import { getDocumentDefinition } from "./documentDefinitions.ts";
import {
  ADVANCED_TEMPLATE_LIMITS,
  inferLegacyDocumentType,
  normalizeAdvancedTemplateConfig,
} from "./advancedTemplateModel.ts";

const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
const hexColorSchema = z.string().regex(hexColorRegex, "Must be a valid hex color starting with #");

export const InvoiceTemplateConfigSchema = z.object({
  theme: z.object({
    primaryColor: hexColorSchema,
    accentColor: hexColorSchema,
    textColor: hexColorSchema,
    mutedTextColor: hexColorSchema,
    borderColor: hexColorSchema,
    backgroundColor: hexColorSchema,
    surfaceColor: hexColorSchema,
  }),

  typography: z.object({
    fontFamily: z.enum([
      "Inter",
      "Helvetica",
      "Times-Roman",
      "Courier",
      "Georgia",
      "JetBrains Mono",
      "Space Grotesk",
      "Outfit",
    ]),
    headingSize: z.enum(["sm", "md", "lg", "xl"]),
    bodySize: z.enum(["xs", "sm", "md"]),
    lineHeight: z.enum(["tight", "normal", "relaxed"]),
  }),

  page: z.object({
    size: z.enum(["LETTER", "A4"]),
    margin: z.enum(["compact", "normal", "spacious"]),
    showPageBorder: z.boolean(),
  }),

  header: z.object({
    style: z.enum(["left-logo", "centered", "right-meta", "split", "minimal"]),
    logoPosition: z.enum(["left", "center", "right"]),
    logoSize: z.enum(["xs", "sm", "md", "lg"]),
    showInvoiceTitle: z.boolean(),
    invoiceTitleText: z.string().min(1, "Invoice title is required"),
    showStatusBadge: z.boolean(),
  }),

  businessBlock: z.object({
    position: z.enum(["header", "left-column", "right-column"]),
    showBusinessName: z.boolean(),
    showContactName: z.boolean(),
    showEmail: z.boolean(),
    showPhone: z.boolean(),
    showWebsite: z.boolean(),
    showAddress: z.boolean(),
    showTaxId: z.boolean(),
  }),

  clientBlock: z.object({
    title: z.string().min(1, "Client section label is required"),
    position: z.enum(["left-column", "right-column", "full-width"]),
    showClientName: z.boolean(),
    showCompany: z.boolean(),
    showEmail: z.boolean(),
    showPhone: z.boolean(),
    showAddress: z.boolean(),
  }),

  metaBlock: z.object({
    position: z.enum(["right-column", "below-header", "table"]),
    showInvoiceNumber: z.boolean(),
    showInvoiceDate: z.boolean(),
    showDueDate: z.boolean(),
    showPaymentTerms: z.boolean(),
    showPoNumber: z.boolean(),
    showProjectName: z.boolean(),
  }),

  lineItemsTable: z.object({
    style: z.enum(["simple", "striped", "bordered", "minimal"]),
    headerBackground: z.boolean(),
    showItemNumbers: z.boolean(),
    showTaxableColumn: z.boolean(),
    descriptionLabel: z.string().min(1, "Description column label is required"),
    quantityLabel: z.string().min(1, "Quantity column label is required"),
    rateLabel: z.string().min(1, "Rate column label is required"),
    amountLabel: z.string().min(1, "Amount column label is required"),
  }),

  totalsBlock: z.object({
    position: z.enum(["right", "full-width"]),
    style: z.enum(["simple", "boxed", "highlight-total"]),
    showSubtotal: z.boolean(),
    showDiscount: z.boolean(),
    showTax: z.boolean(),
    showShipping: z.boolean(),
    showAmountPaid: z.boolean(),
    showBalanceDue: z.boolean(),
    emphasizeBalanceDue: z.boolean(),
  }),

  paymentBlock: z.object({
    title: z.string().min(1, "Payment section title is required"),
    style: z.enum(["plain", "boxed", "muted"]),
    showPaymentMethods: z.boolean(),
    showInstructions: z.boolean(),
    showLateFeeNote: z.boolean(),
  }),

  notesBlock: z.object({
    title: z.string().min(1, "Notes section title is required"),
    style: z.enum(["plain", "boxed", "muted"]),
    showNotes: z.boolean(),
    showTerms: z.boolean(),
    showThankYouNote: z.boolean(),
  }),

  footer: z.object({
    showFooter: z.boolean(),
    text: z.string(),
    showGeneratedWith: z.boolean(),
    alignment: z.enum(["left", "center", "right"]),
  }),

  watermark: z.object({
    enabled: z.boolean(),
    text: z.string(),
    opacity: z.number().min(0).max(1),
    position: z.enum(["center", "bottom-right"]),
  }),

  sectionOrder: z.array(z.string()).refine((items) => {
    const hasDuplicates = new Set(items).size !== items.length;
    return !hasDuplicates;
  }, "Section order list must not contain duplicate elements"),

  labels: z.record(z.string(), z.string()),

  visibility: z.object({
    showLogo: z.boolean(),
    showBusinessBlock: z.boolean(),
    showClientBlock: z.boolean(),
    showMetaBlock: z.boolean(),
    showLineItems: z.boolean(),
    showTotals: z.boolean(),
    showPaymentInstructions: z.boolean(),
    showNotes: z.boolean(),
    showTerms: z.boolean(),
    showFooter: z.boolean(),
  }),

  pdf: z.object({
    pageSize: z.enum(["LETTER", "A4"]),
    orientation: z.enum(["portrait"]),
    repeatTableHeader: z.boolean(),
    avoidRowSplit: z.boolean(),
    showPageNumbers: z.boolean(),
  }),
});

export const InvoiceTemplateSchema = z
  .object({
    id: z.string(),
    name: z.string().min(2, "Template name must be at least 2 characters"),
    slug: z.string().regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens"),
    description: z.string(),
    category: z.enum(["simple", "professional", "creative", "service", "modern", "classic"]),
    status: z.enum(["draft", "published", "archived"]),
    isDefault: z.boolean(),
    version: z.number(),
    documentType: z.literal("invoice"),
    layoutFamily: z.enum(["classic", "modern", "compact", "bold", "minimal", "service"]),
    config: InvoiceTemplateConfigSchema,
  })
  .superRefine((val, ctx) => {
    // Validate required visible sections
    const vis = val.config.visibility;
    if (!vis.showBusinessBlock && !vis.showClientBlock) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one address details section (Business or Client) must be set as visible",
        path: ["config", "visibility", "showBusinessBlock"],
      });
    }
    if (!vis.showLineItems) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The line items table must be set to visible",
        path: ["config", "visibility", "showLineItems"],
      });
    }
    if (!vis.showTotals) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The financial totals block must be set to visible",
        path: ["config", "visibility", "showTotals"],
      });
    }
  });

export const DocumentTypeSchema = z.enum([
  "invoice",
  "receipt",
  "expense-report",
  "mileage-log",
  "quarterly-tax-estimator",
  "w9-request",
  "1099-nec-tracker",
]);
export const PageFormatSchema = z.enum(["A4", "LETTER", "RECEIPT_80MM", "RECEIPT_58MM"]);

const nonNegativeNumberSchema = z.number().finite().nonnegative();

const PdfmeSchemaElementSchema = z
  .object({
    name: z.string().min(1),
    type: z.string().min(1),
    position: z.object({
      x: z.number().finite().nonnegative(),
      y: z.number().finite().nonnegative(),
    }),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
  })
  .passthrough();

export const PdfmeBlankBaseSchema = z
  .object({
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
    padding: z.tuple([
      nonNegativeNumberSchema,
      nonNegativeNumberSchema,
      nonNegativeNumberSchema,
      nonNegativeNumberSchema,
    ]),
    staticSchema: z.array(PdfmeSchemaElementSchema).optional(),
  })
  .superRefine((basePdf, ctx) => {
    if (basePdf.width <= 0 || basePdf.height <= 0) return;

    const [top, right, bottom, left] = basePdf.padding;
    if (left + right >= basePdf.width) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Horizontal padding must leave printable page width",
        path: ["padding"],
      });
    }
    if (top + bottom >= basePdf.height) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vertical padding must leave printable page height",
        path: ["padding"],
      });
    }
  });

const TemplateScalarControlSchema = z.enum([
  "text",
  "textarea",
  "email",
  "phone",
  "number",
  "currency",
  "percent",
  "date",
  "time",
  "select",
  "checkbox",
]);

const FormEntryBaseSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  helpText: z.string().optional(),
  required: z.boolean(),
  enabled: z.boolean(),
});

const BuiltInFormEntrySchema = FormEntryBaseSchema.extend({
  kind: z.literal("builtin"),
});

const CustomScalarFormEntrySchema = FormEntryBaseSchema.extend({
  kind: z.literal("custom"),
  key: z.string().regex(/^custom\.[a-z0-9]+(?:-[a-z0-9]+)*$/),
  control: TemplateScalarControlSchema,
  options: z.array(z.string().min(1)).optional(),
}).superRefine((entry, ctx) => {
  if (entry.control === "select" && !entry.options?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select fields need at least one option",
      path: ["options"],
    });
  }
});

const CustomRepeaterColumnSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9-]*$/),
    label: z.string().min(1),
    control: TemplateScalarControlSchema,
    required: z.boolean(),
    options: z.array(z.string().min(1)).optional(),
  })
  .superRefine((column, ctx) => {
    if (column.control === "select" && !column.options?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select columns need at least one option",
        path: ["options"],
      });
    }
  });

const CustomRepeaterFormEntrySchema = FormEntryBaseSchema.extend({
  kind: z.literal("repeater"),
  key: z.string().regex(/^custom\.[a-z0-9]+(?:-[a-z0-9]+)*$/),
  columns: z.array(CustomRepeaterColumnSchema).min(1),
  minRows: z.number().int().min(0).max(ADVANCED_TEMPLATE_LIMITS.maxRepeaterRows).optional(),
}).superRefine((entry, ctx) => {
  const keys = new Set<string>();
  for (const [index, column] of entry.columns.entries()) {
    if (keys.has(column.key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Repeater column keys must be unique",
        path: ["columns", index, "key"],
      });
    }
    keys.add(column.key);
  }
});

const TemplateFormEntrySchema = z.union([
  BuiltInFormEntrySchema,
  CustomScalarFormEntrySchema,
  CustomRepeaterFormEntrySchema,
]);

const TemplateFormConfigSchema = z
  .object({
    sections: z.array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        entries: z.array(TemplateFormEntrySchema),
      }),
    ),
  })
  .superRefine((form, ctx) => {
    const sectionIds = new Set<string>();
    const fieldKeys = new Set<string>();
    let fieldCount = 0;
    let customFieldCount = 0;

    for (const [sectionIndex, section] of form.sections.entries()) {
      if (sectionIds.has(section.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Form section IDs must be unique",
          path: ["sections", sectionIndex, "id"],
        });
      }
      sectionIds.add(section.id);
      for (const [entryIndex, entry] of section.entries.entries()) {
        fieldCount += 1;
        if (entry.kind !== "builtin") customFieldCount += 1;
        if (fieldKeys.has(entry.key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Form field keys must be unique",
            path: ["sections", sectionIndex, "entries", entryIndex, "key"],
          });
        }
        fieldKeys.add(entry.key);
      }
    }

    if (fieldCount > ADVANCED_TEMPLATE_LIMITS.maxFormFields) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Forms are limited to ${ADVANCED_TEMPLATE_LIMITS.maxFormFields} fields`,
        path: ["sections"],
      });
    }
    if (customFieldCount > ADVANCED_TEMPLATE_LIMITS.maxCustomFields) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Forms are limited to ${ADVANCED_TEMPLATE_LIMITS.maxCustomFields} custom fields`,
        path: ["sections"],
      });
    }
  });

const AdvancedTemplateConfigV2Schema = z
  .object({
    editor: z.literal("pdfme"),
    schemaVersion: z.literal(2),
    pageFormat: PageFormatSchema,
    template: z
      .object({
        basePdf: PdfmeBlankBaseSchema,
        schemas: z.array(z.array(PdfmeSchemaElementSchema)).max(ADVANCED_TEMPLATE_LIMITS.maxPages),
      })
      .passthrough(),
    sampleData: z.record(z.string(), z.string()),
    form: TemplateFormConfigSchema,
  })
  .superRefine((config, ctx) => {
    const elementCount =
      config.template.schemas.reduce((count, page) => count + page.length, 0) +
      (config.template.basePdf.staticSchema?.length ?? 0);
    if (elementCount > ADVANCED_TEMPLATE_LIMITS.maxCanvasElements) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Templates are limited to ${ADVANCED_TEMPLATE_LIMITS.maxCanvasElements} canvas elements`,
        path: ["template", "schemas"],
      });
    }
    if (new TextEncoder().encode(JSON.stringify(config)).length > ADVANCED_TEMPLATE_LIMITS.maxBytes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Advanced template config exceeds the 5 MB limit",
        path: [],
      });
    }
  });

export const AdvancedTemplateConfigSchema = z.preprocess((value) => {
  const documentType = inferLegacyDocumentType(value);
  if (!documentType) return value;
  if (value && typeof value === "object" && "schemaVersion" in value && value.schemaVersion === 2) {
    return value;
  }
  try {
    return normalizeAdvancedTemplateConfig(value, documentType);
  } catch {
    return value;
  }
}, AdvancedTemplateConfigV2Schema);

const AdvancedDocumentTemplateV2Schema = z
  .object({
    id: z.string(),
    name: z.string().min(2, "Template name must be at least 2 characters"),
    slug: z.string().regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens"),
    description: z.string(),
    category: z.enum(["simple", "professional", "creative", "service", "modern", "classic"]),
    status: z.enum(["draft", "published", "archived"]),
    isDefault: z.boolean(),
    version: z.number(),
    documentType: DocumentTypeSchema,
    layoutFamily: z.literal("advanced"),
    config: AdvancedTemplateConfigV2Schema,
  })
  .superRefine((template, ctx) => {
    if (!isSupportedPageFormat(template.documentType, template.config.pageFormat)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${template.config.pageFormat} is not supported for ${template.documentType} templates`,
        path: ["config", "pageFormat"],
      });
    }
    const fields = new Map(getDocumentDefinition(template.documentType).fields.map((field) => [field.key, field]));
    for (const [sectionIndex, section] of template.config.form.sections.entries()) {
      for (const [entryIndex, entry] of section.entries.entries()) {
        if (entry.kind !== "builtin") continue;
        const field = fields.get(entry.key);
        if (!field || field.source !== "user") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: field ? `"${entry.key}" is not an editable form field` : `Unknown built-in field "${entry.key}"`,
            path: ["config", "form", "sections", sectionIndex, "entries", entryIndex, "key"],
          });
        }
      }
    }
  });

export const AdvancedDocumentTemplateSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || !("documentType" in value) || !("config" in value)) {
    return value;
  }
  const documentType = DocumentTypeSchema.safeParse(value.documentType);
  if (!documentType.success) return value;
  try {
    return {
      ...value,
      config: normalizeAdvancedTemplateConfig(value.config, documentType.data),
    };
  } catch {
    return value;
  }
}, AdvancedDocumentTemplateV2Schema);

export const DocumentTemplateSchema = z.union([InvoiceTemplateSchema, AdvancedDocumentTemplateSchema]);
