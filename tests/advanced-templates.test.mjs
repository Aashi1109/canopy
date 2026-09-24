import { expect, test } from "vitest";
import {
  AdvancedDocumentTemplateSchema,
  AdvancedTemplateConfigSchema,
  DocumentTemplateSchema,
  InvoiceTemplateSchema,
  createAdvancedTemplateConfig,
  resizeAdvancedTemplateConfig,
  seedTemplates,
} from "../lib/invoice-templates/index.ts";

const supportedFormats = [
  ["invoice", "A4", 210, 297],
  ["invoice", "LETTER", 215.9, 279.4],
  ["receipt", "RECEIPT_80MM", 80, 200],
  ["receipt", "RECEIPT_58MM", 58, 180],
];

function createAdvancedTemplate(documentType, pageFormat) {
  const pageSlug = pageFormat.toLowerCase().replaceAll("_", "-");
  return {
    ...structuredClone(seedTemplates[0]),
    id: `advanced-${documentType}-${pageSlug}`,
    name: `Advanced ${documentType}`,
    slug: `advanced-${documentType}-${pageSlug}`,
    documentType,
    layoutFamily: "advanced",
    config: createAdvancedTemplateConfig(documentType, pageFormat),
  };
}

test("advanced defaults are valid blank-base pdfme templates with realistic sample data", () => {
  for (const [documentType, pageFormat, width, height] of supportedFormats) {
    const config = createAdvancedTemplateConfig(documentType, pageFormat);

    expect(AdvancedTemplateConfigSchema.safeParse(config).success).toBe(true);
    expect(config.editor).toBe("pdfme");
    expect(config.pageFormat).toBe(pageFormat);
    expect(config.template.basePdf).toEqual({
      width,
      height,
      padding: documentType === "invoice" ? [15, 15, 15, 15] : [5, 5, 5, 5],
    });
    expect(config.template.schemas.length).toBe(1);
    expect(config.template.schemas[0].length > 0).toBeTruthy();
    const textSchema = config.template.schemas[0].find((schema) => schema.type === "text");
    const tableSchema = config.template.schemas[0].find((schema) => schema.type === "table");
    expect(textSchema.verticalAlignment).toBe("top");
    expect(typeof textSchema.backgroundColor).toBe("string");
    expect(tableSchema.repeatHead).toBe(true);
    expect(typeof tableSchema.tableStyles.borderWidth).toBe("number");
    expect(typeof tableSchema.headStyles.padding.left).toBe("number");
    expect(typeof tableSchema.bodyStyles.alternateBackgroundColor).toBe("string");
    expect(tableSchema.columnStyles).toEqual({});
    expect(typeof config.sampleData.documentNumber).toBe("string");
    expect(typeof config.sampleData.lineItems).toBe("string");
    expect(typeof config.sampleData.total).toBe("string");
  }
});

test("advanced template canvases resize proportionally between compatible page formats", () => {
  const original = createAdvancedTemplateConfig("receipt", "RECEIPT_80MM");
  original.template.basePdf.staticSchema = [
    {
      name: "footer",
      type: "text",
      position: { x: 5, y: 180 },
      width: 70,
      height: 8,
      fontSize: 10,
    },
  ];
  original.template.schemas.push([
    {
      ...structuredClone(original.template.schemas[0][0]),
      position: { x: 10, y: 20 },
    },
  ]);
  const firstSchema = structuredClone(original.template.schemas[0][0]);
  const originalTable = structuredClone(original.template.schemas[0].find((schema) => schema.type === "table"));

  const resized = resizeAdvancedTemplateConfig(original, "receipt", "RECEIPT_58MM");

  expect(resized.pageFormat).toBe("RECEIPT_58MM");
  expect(resized.template.basePdf).toEqual({
    width: 58,
    height: 180,
    padding: [5, 5, 5, 5],
    staticSchema: [
      {
        name: "footer",
        type: "text",
        position: { x: 3.625, y: 162 },
        width: 50.75,
        height: 7.2,
        fontSize: 7.25,
      },
    ],
  });
  expect(resized.template.schemas[0][0].position.x).toBe(firstSchema.position.x * (58 / 80));
  expect(resized.template.schemas[0][0].position.y).toBe(firstSchema.position.y * (180 / 200));
  expect(resized.template.schemas[0][0].width).toBe(firstSchema.width * (58 / 80));
  expect(resized.template.schemas[0][0].height).toBe(firstSchema.height * (180 / 200));
  expect(resized.template.schemas[1][0].position).toEqual({
    x: 10 * (58 / 80),
    y: 20 * (180 / 200),
  });
  expect(resized.template.schemas[0][0].fontSize).toBe(firstSchema.fontSize * (58 / 80));
  const resizedTable = resized.template.schemas[0].find((schema) => schema.type === "table");
  expect(resizedTable.headStyles.fontSize).toBe(originalTable.headStyles.fontSize * (58 / 80));
  expect(resizedTable.headStyles.padding.left).toBe(originalTable.headStyles.padding.left * (58 / 80));
  expect(resizedTable.headStyles.padding.top).toBe(originalTable.headStyles.padding.top * (180 / 200));
  expect(resized.sampleData).toEqual(original.sampleData);
  expect(AdvancedTemplateConfigSchema.safeParse(resized).success).toBe(true);
  expect(original.pageFormat).toBe("RECEIPT_80MM");
  expect(original.template.basePdf.width).toBe(80);

  const resizedInvoice = resizeAdvancedTemplateConfig(
    createAdvancedTemplateConfig("invoice", "A4"),
    "invoice",
    "LETTER",
  );
  expect(resizedInvoice.pageFormat).toBe("LETTER");
  expect(resizedInvoice.template.basePdf.width).toBe(215.9);
  expect(resizedInvoice.template.basePdf.height).toBe(279.4);
  expect(AdvancedTemplateConfigSchema.safeParse(resizedInvoice).success).toBe(true);
});

test("document template validation accepts standard and advanced templates without widening the standard schema", () => {
  const standard = seedTemplates[0];
  const advancedInvoice = createAdvancedTemplate("invoice", "A4");
  const advancedReceipt = createAdvancedTemplate("receipt", "RECEIPT_80MM");

  expect(InvoiceTemplateSchema.safeParse(standard).success).toBe(true);
  expect(DocumentTemplateSchema.safeParse(standard).success).toBe(true);

  expect(AdvancedDocumentTemplateSchema.safeParse(advancedInvoice).success).toBe(true);
  expect(AdvancedDocumentTemplateSchema.safeParse(advancedReceipt).success).toBe(true);
  expect(DocumentTemplateSchema.safeParse(advancedInvoice).success).toBe(true);
  expect(DocumentTemplateSchema.safeParse(advancedReceipt).success).toBe(true);

  expect(InvoiceTemplateSchema.safeParse(advancedInvoice).success).toBe(false);
  expect(InvoiceTemplateSchema.safeParse(advancedReceipt).success).toBe(false);
});

test("advanced template validation rejects incompatible document and page formats", () => {
  expect(() => createAdvancedTemplateConfig("invoice", "RECEIPT_80MM")).toThrow(/not supported for invoice templates/);
  expect(() => createAdvancedTemplateConfig("receipt", "A4")).toThrow(/not supported for receipt templates/);
  expect(() =>
    resizeAdvancedTemplateConfig(createAdvancedTemplateConfig("invoice", "A4"), "invoice", "RECEIPT_80MM"),
  ).toThrow(/not supported for invoice templates/);

  const invoiceOnReceiptPaper = createAdvancedTemplate("receipt", "RECEIPT_58MM");
  invoiceOnReceiptPaper.documentType = "invoice";

  const receiptOnLetterPaper = createAdvancedTemplate("invoice", "LETTER");
  receiptOnLetterPaper.documentType = "receipt";

  expect(AdvancedDocumentTemplateSchema.safeParse(invoiceOnReceiptPaper).success).toBe(false);
  expect(DocumentTemplateSchema.safeParse(receiptOnLetterPaper).success).toBe(false);
});

test("advanced config validation rejects malformed pdfme blank bases", () => {
  const config = createAdvancedTemplateConfig("invoice", "A4");
  config.template.basePdf.width = 0;
  config.template.schemas = [{}];

  const result = AdvancedTemplateConfigSchema.safeParse(config);

  expect(result.success).toBe(false);
  expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual([
    "template.basePdf.width",
    "template.schemas.0",
  ]);
});
