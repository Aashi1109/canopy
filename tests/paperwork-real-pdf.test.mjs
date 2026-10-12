import { test, expect, vi } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import { generate } from "@pdfme/generator";
import * as schemas from "@pdfme/schemas";
import { PDFDocument } from "pdf-lib";
import { createAdvancedTemplateConfig, containsFullTin } from "../lib/invoice-templates/index.ts";
import { withPdfmeTextFormatting } from "../lib/invoice-templates/pdfmeTextFormatting.ts";
import { applyTemplateFormatting } from "../lib/paperwork/advancedTemplateData.ts";
import {
  invoiceAdapter,
  receiptAdapter,
  expenseReportAdapter,
  mileageLogAdapter,
  quarterlyTaxAdapter,
  w9RequestAdapter,
  nec1099Adapter,
} from "../lib/paperwork/documentAdapters.ts";
import { DataBridge } from "../lib/paperwork/shared/dataBridge.ts";
const plugins = {
  text: withPdfmeTextFormatting(schemas.text),
  multiVariableText: schemas.multiVariableText,
  list: schemas.list,
  image: schemas.image,
  signature: schemas.signature,
  svg: schemas.svg,
  table: schemas.table,
  line: schemas.line,
  rectangle: schemas.rectangle,
  ellipse: schemas.ellipse,
  dateTime: schemas.dateTime,
  date: schemas.date,
  time: schemas.time,
  select: schemas.select,
  radioGroup: schemas.radioGroup,
  checkbox: schemas.checkbox,
  circleMark: schemas.circleMark,
  ...schemas.barcodes,
};
test("production advanced defaults generate real readable PDFs for all seven document types", async () => {
  const results = [];
  await mkdir("/tmp/paperwork-real-pdfs", { recursive: true });
  const adapters = [
    invoiceAdapter,
    receiptAdapter,
    expenseReportAdapter,
    mileageLogAdapter,
    quarterlyTaxAdapter,
    w9RequestAdapter,
    nec1099Adapter,
  ];
  const vendors = w9RequestAdapter.getSampleDraft().vendors;
  const vendorSpy = vi.spyOn(DataBridge, "getW9Vendors").mockReturnValue(vendors);
  try {
    for (const adapter of adapters) {
      const type = adapter.documentType;
      const draft = adapter.getSampleDraft();
      if (type === "receipt") {
        draft.currency = "EUR";
      }
      if (type === "w9-request") {
        const selected = {
          ...draft.vendors[0],
          id: "selected-pdf",
          legalName: "Selected PDF Recipient",
          businessName: "Selected Example",
          email: "selected@example.test",
        };
        draft.vendors.push(selected);
        draft.selectedVendorId = selected.id;
      }
      const pageFormat = type === "receipt" ? "RECEIPT_80MM" : "LETTER";
      const template = {
        id: `verify-${type}`,
        documentType: type,
        layoutFamily: "advanced",
        status: "published",
        slug: `verify-${type}`,
        config: createAdvancedTemplateConfig(type, pageFormat),
      };
      const inputs = adapter.toPdfInputs(draft, template, {});
      if (type === "receipt") {
        expect(inputs.amountReceived).toContain("€");
        expect(inputs.currency).toBe("EUR");
      }
      if (type === "w9-request") {
        expect(inputs.contractorName).toBe("Selected PDF Recipient");
      }
      if (["w9-request", "1099-nec-tracker"].includes(type))
        expect(Object.values(inputs).filter(containsFullTin)).toEqual([]);
      await writeFile(`/tmp/paperwork-real-pdfs/${type}.inputs.json`, JSON.stringify(inputs, null, 2));
      const formatted = applyTemplateFormatting(template, inputs);
      if (type === "quarterly-tax-estimator") {
        expect(formatted.calculationAssumptions).toContain("QBI");
        expect(template.config.template.schemas.flat().some((schema) => schema.name === "calculationAssumptions")).toBe(
          true,
        );
      }
      await writeFile(
        `/tmp/paperwork-real-pdfs/${type}.generation.json`,
        JSON.stringify({ formatted, template: template.config.template }, null, 2),
      );
      const pdf = await generate({ template: template.config.template, inputs: [formatted], plugins });
      expect(pdf.length).toBeGreaterThan(1000);
      const document = await PDFDocument.load(pdf);
      expect(document.getPageCount()).toBeGreaterThan(0);
      const pages = document.getPages().map((page) => ({ width: page.getWidth(), height: page.getHeight() }));
      await writeFile(`/tmp/paperwork-real-pdfs/${type}.pdf`, pdf);
      results.push({
        type,
        provenance: "production default advanced config (published instances unavailable)",
        bytes: pdf.length,
        pageCount: document.getPageCount(),
        pages,
      });
    }
  } finally {
    vendorSpy.mockRestore();
  }
  await writeFile("/tmp/paperwork-real-pdfs/verification.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
}, 60000);
