/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AdvancedTemplateConfig,
  DocumentType,
  PageFormat,
  PdfmeBlankBase,
  PdfmeSchema,
} from "./templateTypes.ts";
import { getDocumentDefinition, isPageFormatAllowed } from "./documentDefinitions.ts";

type PageSpec = PdfmeBlankBase;

const PAGE_SPECS: Record<PageFormat, PageSpec> = {
  A4: {
    width: 210,
    height: 297,
    padding: [15, 15, 15, 15],
  },
  LETTER: {
    width: 215.9,
    height: 279.4,
    padding: [15, 15, 15, 15],
  },
  RECEIPT_80MM: {
    width: 80,
    height: 200,
    padding: [5, 5, 5, 5],
  },
  RECEIPT_58MM: {
    width: 58,
    height: 180,
    padding: [5, 5, 5, 5],
  },
};

function cellStyle(backgroundColor: string, fontColor: string) {
  return {
    alignment: "left",
    verticalAlignment: "middle",
    fontSize: 9,
    lineHeight: 1.2,
    characterSpacing: 0,
    fontColor,
    backgroundColor,
    borderColor: "#CBD5E1",
    borderWidth: { top: 0.2, right: 0.2, bottom: 0.2, left: 0.2 },
    padding: { top: 2, right: 2, bottom: 2, left: 2 },
  };
}

function withPdfmeDefaults(schema: PdfmeSchema): PdfmeSchema {
  if (schema.type === "table") {
    return {
      showHead: true,
      repeatHead: true,
      tableStyles: {
        borderColor: "#CBD5E1",
        borderWidth: 0.2,
      },
      headStyles: cellStyle("#2563EB", "#FFFFFF"),
      bodyStyles: {
        ...cellStyle("#FFFFFF", "#111827"),
        alternateBackgroundColor: "#F8FAFC",
      },
      columnStyles: {},
      ...schema,
    };
  }

  if (schema.type === "text") {
    return {
      alignment: "left",
      verticalAlignment: "top",
      fontSize: 10,
      lineHeight: 1.2,
      characterSpacing: 0,
      fontColor: "#111827",
      backgroundColor: "",
      ...schema,
    };
  }

  return schema;
}

export function isSupportedPageFormat(documentType: DocumentType, pageFormat: PageFormat): boolean {
  return Boolean(PAGE_SPECS[pageFormat]) && isPageFormatAllowed(documentType, pageFormat);
}

function scaleEdges(value: unknown, scaleX: number, scaleY: number, scale: number) {
  if (typeof value === "number") return value * scale;
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([side, size]) => [
      side,
      typeof size !== "number"
        ? size
        : size * (side === "left" || side === "right" ? scaleX : scaleY),
    ]),
  );
}

function scaleSchema(schema: PdfmeSchema, scaleX: number, scaleY: number): PdfmeSchema {
  const scale = Math.min(scaleX, scaleY);
  const next = structuredClone(schema);
  next.position = {
    x: next.position.x * scaleX,
    y: next.position.y * scaleY,
  };
  next.width *= scaleX;
  next.height *= scaleY;

  function scaleStyles(value: unknown, key?: string): unknown {
    if (key === "padding" || key === "borderWidth") {
      return scaleEdges(value, scaleX, scaleY, scale);
    }
    if (
      typeof value === "number" &&
      (key === "fontSize" || key === "characterSpacing" || key === "borderRadius")
    ) {
      return value * scale;
    }
    if (Array.isArray(value)) return value.map((item) => scaleStyles(item));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value).map(([nestedKey, nested]) => [
        nestedKey,
        scaleStyles(nested, nestedKey),
      ]),
    );
  }

  for (const [key, value] of Object.entries(next)) {
    if (key !== "position" && key !== "width" && key !== "height") {
      next[key] = scaleStyles(value, key);
    }
  }
  return next;
}

export function resizeAdvancedTemplateConfig(
  config: AdvancedTemplateConfig,
  documentType: DocumentType,
  pageFormat: PageFormat,
): AdvancedTemplateConfig {
  const pageSpec = PAGE_SPECS[pageFormat];
  if (!pageSpec || !isSupportedPageFormat(documentType, pageFormat)) {
    throw new RangeError(`${pageFormat} is not supported for ${documentType} templates.`);
  }

  const currentBase = config.template.basePdf;
  if (currentBase.width <= 0 || currentBase.height <= 0) {
    throw new RangeError("The current page size must be greater than zero.");
  }

  const scaleX = pageSpec.width / currentBase.width;
  const scaleY = pageSpec.height / currentBase.height;
  const resized = structuredClone(config);
  resized.pageFormat = pageFormat;
  resized.template.schemas = resized.template.schemas.map((page) =>
    page.map((schema) => scaleSchema(schema, scaleX, scaleY)),
  );
  resized.template.basePdf = {
    ...resized.template.basePdf,
    width: pageSpec.width,
    height: pageSpec.height,
    padding: [...pageSpec.padding],
    ...(resized.template.basePdf.staticSchema
      ? {
          staticSchema: resized.template.basePdf.staticSchema.map((schema) =>
            scaleSchema(schema, scaleX, scaleY),
          ),
        }
      : {}),
  };
  return resized;
}

function definitionSampleData(documentType: DocumentType): Record<string, string> {
  return Object.fromEntries(
    getDocumentDefinition(documentType).fields.map((field) => [field.key, field.sampleValue]),
  );
}

function invoiceDefaults(
  pageFormat: Extract<PageFormat, "A4" | "LETTER">,
  basePdf: PdfmeBlankBase,
): AdvancedTemplateConfig {
  const x = basePdf.padding[3];
  const width = basePdf.width - x - basePdf.padding[1];
  const sampleData = {
    ...definitionSampleData("invoice"),
    businessName: "Northstar Studio",
    businessAddress: "42 Market Street, Bengaluru, Karnataka 560001",
    documentTitle: "INVOICE",
    documentNumber: "INV-2026-0421",
    invoiceNumber: "INV-2026-0421",
    issueDate: "July 23, 2026",
    invoiceDate: "July 23, 2026",
    dueDate: "August 22, 2026",
    customerLabel: "BILL TO",
    customerName: "Avery Morgan",
    customerAddress: "Brightside Labs\n18 Residency Road\nBengaluru, Karnataka 560025",
    lineItems: JSON.stringify([
      ["Brand strategy workshop", "1", "$1,200.00", "$1,200.00"],
      ["Website design", "24", "$75.00", "$1,800.00"],
    ]),
    subtotal: "$3,000.00",
    tax: "$540.00",
    total: "$3,540.00",
    balanceDue: "$3,540.00",
    notes: "Thank you for your business. Payment is due within 30 days.",
  };

  return {
    editor: "pdfme",
    schemaVersion: 2,
    pageFormat,
    template: {
      basePdf,
      schemas: [
        [
          {
            name: "businessName",
            type: "text",
            content: sampleData.businessName,
            position: { x, y: 15 },
            width: width * 0.58,
            height: 10,
            fontSize: 20,
            fontColor: "#111827",
          },
          {
            name: "businessAddress",
            type: "text",
            content: sampleData.businessAddress,
            position: { x, y: 27 },
            width: width * 0.58,
            height: 12,
            fontSize: 9,
            fontColor: "#64748B",
          },
          {
            name: "documentTitle",
            type: "text",
            content: sampleData.documentTitle,
            position: { x: x + width * 0.68, y: 15 },
            width: width * 0.32,
            height: 10,
            fontSize: 18,
            fontColor: "#2563EB",
            alignment: "right",
          },
          {
            name: "invoiceNumber",
            type: "text",
            content: sampleData.documentNumber,
            position: { x: x + width * 0.68, y: 28 },
            width: width * 0.32,
            height: 6,
            fontSize: 9,
            fontColor: "#334155",
            alignment: "right",
          },
          {
            name: "issueDate",
            type: "text",
            content: sampleData.issueDate,
            position: { x: x + width * 0.68, y: 35 },
            width: width * 0.32,
            height: 6,
            fontSize: 9,
            fontColor: "#334155",
            alignment: "right",
          },
          {
            name: "dueDate",
            type: "text",
            content: `Due ${sampleData.dueDate}`,
            position: { x: x + width * 0.68, y: 42 },
            width: width * 0.32,
            height: 6,
            fontSize: 9,
            fontColor: "#334155",
            alignment: "right",
          },
          {
            name: "customerLabel",
            type: "text",
            content: sampleData.customerLabel,
            position: { x, y: 55 },
            width: width * 0.45,
            height: 6,
            fontSize: 8,
            fontColor: "#2563EB",
          },
          {
            name: "customerName",
            type: "text",
            content: sampleData.customerName,
            position: { x, y: 63 },
            width: width * 0.45,
            height: 7,
            fontSize: 11,
            fontColor: "#111827",
          },
          {
            name: "customerAddress",
            type: "text",
            content: sampleData.customerAddress,
            position: { x, y: 71 },
            width: width * 0.45,
            height: 18,
            fontSize: 9,
            fontColor: "#475569",
          },
          {
            name: "lineItems",
            type: "table",
            content: sampleData.lineItems,
            position: { x, y: 98 },
            width,
            height: 58,
            showHead: true,
            head: ["Description", "Qty", "Rate", "Amount"],
            headWidthPercentages: [52, 10, 18, 20],
          },
          {
            name: "subtotal",
            type: "text",
            content: `Subtotal  ${sampleData.subtotal}`,
            position: { x: x + width * 0.62, y: 166 },
            width: width * 0.38,
            height: 7,
            fontSize: 9,
            fontColor: "#334155",
            alignment: "right",
          },
          {
            name: "tax",
            type: "text",
            content: `Tax  ${sampleData.tax}`,
            position: { x: x + width * 0.62, y: 175 },
            width: width * 0.38,
            height: 7,
            fontSize: 9,
            fontColor: "#334155",
            alignment: "right",
          },
          {
            name: "total",
            type: "text",
            content: `Total  ${sampleData.total}`,
            position: { x: x + width * 0.58, y: 186 },
            width: width * 0.42,
            height: 10,
            fontSize: 14,
            fontColor: "#2563EB",
            alignment: "right",
          },
          {
            name: "balanceDue",
            type: "text",
            content: `Balance due  ${sampleData.balanceDue}`,
            position: { x: x + width * 0.58, y: 198 },
            width: width * 0.42,
            height: 8,
            fontSize: 11,
            fontColor: "#111827",
            alignment: "right",
          },
          {
            name: "notes",
            type: "text",
            content: sampleData.notes,
            position: { x, y: 218 },
            width,
            height: 14,
            fontSize: 9,
            fontColor: "#64748B",
          },
        ].map(withPdfmeDefaults),
      ],
    },
    sampleData,
    form: structuredClone(getDocumentDefinition("invoice").defaultForm),
  };
}

function receiptDefaults(
  pageFormat: Extract<PageFormat, "RECEIPT_80MM" | "RECEIPT_58MM">,
  basePdf: PdfmeBlankBase,
): AdvancedTemplateConfig {
  const x = basePdf.padding[3];
  const width = basePdf.width - x - basePdf.padding[1];
  const sampleData = {
    ...definitionSampleData("receipt"),
    businessName: "Northstar Market",
    businessAddress: "42 Market Street, Bengaluru\n+91 80 4567 8900",
    documentTitle: "RECEIPT",
    documentNumber: "RCP-2026-0184",
    receiptNumber: "RCP-2026-0184",
    issueDate: "July 23, 2026 · 4:32 PM",
    customerName: "Avery Morgan",
    lineItems: JSON.stringify([
      ["Cold brew coffee", "2", "$12.00"],
      ["Almond croissant", "1", "$4.50"],
      ["Canvas tote bag", "1", "$18.00"],
    ]),
    subtotal: "$34.50",
    tax: "$2.76",
    total: "$37.26",
    balanceDue: "$0.00",
    paymentMethod: "Visa •••• 4242",
    notes: "Thank you for stopping by!",
  };

  return {
    editor: "pdfme",
    schemaVersion: 2,
    pageFormat,
    template: {
      basePdf,
      schemas: [
        [
          {
            name: "businessName",
            type: "text",
            content: sampleData.businessName,
            position: { x, y: 7 },
            width,
            height: 8,
            fontSize: pageFormat === "RECEIPT_58MM" ? 13 : 16,
            fontColor: "#111827",
            alignment: "center",
          },
          {
            name: "businessAddress",
            type: "text",
            content: sampleData.businessAddress,
            position: { x, y: 17 },
            width,
            height: 12,
            fontSize: 7,
            fontColor: "#64748B",
            alignment: "center",
          },
          {
            name: "documentTitle",
            type: "text",
            content: sampleData.documentTitle,
            position: { x, y: 32 },
            width,
            height: 7,
            fontSize: 9,
            fontColor: "#111827",
            alignment: "center",
          },
          {
            name: "receiptNumber",
            type: "text",
            content: sampleData.documentNumber,
            position: { x, y: 41 },
            width,
            height: 5,
            fontSize: 7,
            fontColor: "#475569",
            alignment: "center",
          },
          {
            name: "issueDate",
            type: "text",
            content: sampleData.issueDate,
            position: { x, y: 47 },
            width,
            height: 5,
            fontSize: 7,
            fontColor: "#475569",
            alignment: "center",
          },
          {
            name: "lineItems",
            type: "table",
            content: sampleData.lineItems,
            position: { x, y: 58 },
            width,
            height: 54,
            showHead: true,
            head: ["Item", "Qty", "Amount"],
            headWidthPercentages: [58, 12, 30],
          },
          {
            name: "subtotal",
            type: "text",
            content: `Subtotal  ${sampleData.subtotal}`,
            position: { x, y: 119 },
            width,
            height: 6,
            fontSize: 8,
            fontColor: "#334155",
            alignment: "right",
          },
          {
            name: "tax",
            type: "text",
            content: `Tax  ${sampleData.tax}`,
            position: { x, y: 126 },
            width,
            height: 6,
            fontSize: 8,
            fontColor: "#334155",
            alignment: "right",
          },
          {
            name: "total",
            type: "text",
            content: `TOTAL  ${sampleData.total}`,
            position: { x, y: 135 },
            width,
            height: 8,
            fontSize: 11,
            fontColor: "#111827",
            alignment: "right",
          },
          {
            name: "balanceDue",
            type: "text",
            content: `Balance  ${sampleData.balanceDue}`,
            position: { x, y: 144 },
            width,
            height: 6,
            fontSize: 8,
            fontColor: "#334155",
            alignment: "right",
          },
          {
            name: "paymentMethod",
            type: "text",
            content: sampleData.paymentMethod,
            position: { x, y: 153 },
            width,
            height: 6,
            fontSize: 7,
            fontColor: "#475569",
            alignment: "center",
          },
          {
            name: "notes",
            type: "text",
            content: sampleData.notes,
            position: { x, y: 166 },
            width,
            height: 8,
            fontSize: 8,
            fontColor: "#334155",
            alignment: "center",
          },
        ].map(withPdfmeDefaults),
      ],
    },
    sampleData,
    form: structuredClone(getDocumentDefinition("receipt").defaultForm),
  };
}

function tableSample(field: ReturnType<typeof getDocumentDefinition>["fields"][number]) {
  try {
    const rows = JSON.parse(field.sampleValue);
    if (!Array.isArray(rows)) return "[]";
    if (rows.every((row) => Array.isArray(row))) return JSON.stringify(rows);
    const columns = field.repeaterColumns?.map(({ key }) => key);
    return JSON.stringify(
      rows.map((row) => {
        if (!row || typeof row !== "object") return [String(row ?? "")];
        const record = row as Record<string, unknown>;
        return (columns ?? Object.keys(record).filter((key) => key !== "id")).map((key) =>
          String(record[key] ?? ""),
        );
      }),
    );
  } catch {
    return "[]";
  }
}

function genericDocumentDefaults(
  documentType: Exclude<DocumentType, "invoice" | "receipt">,
  pageFormat: Extract<PageFormat, "A4" | "LETTER">,
  basePdf: PdfmeBlankBase,
): AdvancedTemplateConfig {
  const definition = getDocumentDefinition(documentType);
  const sampleData = definitionSampleData(documentType);
  const x = basePdf.padding[3];
  const width = basePdf.width - x - basePdf.padding[1];
  let y = 32;
  const schemas: PdfmeSchema[] = [
    withPdfmeDefaults({
      name: "documentTitle",
      type: "text",
      content: definition.label.toUpperCase(),
      position: { x, y: 15 },
      width,
      height: 10,
      fontSize: 18,
      fontColor: "#2563EB",
    }),
  ];

  for (const binding of definition.requiredBindings) {
    const field = definition.fields.find(({ key }) => key === binding);
    if (!field) continue;
    const isTable = field.allowedBindingTypes.includes("table");
    const height = isTable ? 38 : 9;
    schemas.push(
      withPdfmeDefaults({
        name: field.key,
        type: isTable ? "table" : "text",
        content: isTable ? tableSample(field) : field.sampleValue,
        position: { x, y },
        width,
        height,
        ...(isTable
          ? {
              head: field.repeaterColumns?.map(({ label }) => label) ?? ["Item", "Value"],
              headWidthPercentages: field.repeaterColumns
                ? field.repeaterColumns.map(() => 100 / field.repeaterColumns!.length)
                : [50, 50],
            }
          : {}),
      }),
    );
    y += height + 4;
  }

  return {
    editor: "pdfme",
    schemaVersion: 2,
    pageFormat,
    template: {
      basePdf,
      schemas: [schemas],
    },
    sampleData,
    form: structuredClone(definition.defaultForm),
  };
}

export function createAdvancedTemplateConfig(
  documentType: DocumentType,
  pageFormat: PageFormat,
): AdvancedTemplateConfig {
  const pageSpec = PAGE_SPECS[pageFormat];
  if (!pageSpec || !isSupportedPageFormat(documentType, pageFormat)) {
    throw new RangeError(`${pageFormat} is not supported for ${documentType} templates.`);
  }

  const basePdf = {
    width: pageSpec.width,
    height: pageSpec.height,
    padding: [...pageSpec.padding],
  } as PdfmeBlankBase;
  if (documentType === "invoice") {
    return invoiceDefaults(pageFormat as Extract<PageFormat, "A4" | "LETTER">, basePdf);
  }
  if (documentType === "receipt") {
    return receiptDefaults(
      pageFormat as Extract<PageFormat, "RECEIPT_80MM" | "RECEIPT_58MM">,
      basePdf,
    );
  }
  return genericDocumentDefaults(
    documentType,
    pageFormat as Extract<PageFormat, "A4" | "LETTER">,
    basePdf,
  );
}
