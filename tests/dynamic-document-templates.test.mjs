import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspacePath = "app/paperwork/components/AdvancedTemplateWorkspace.tsx";
const adaptersPath = "lib/paperwork/documentAdapters.ts";
const editorPath = "app/admin/(protected)/templates/[id]/advanced/components/AdvancedTemplateEditor.tsx";

test("Paperwork exposes one typed adapter and component mapping for every document kind", async () => {
  const source = await readFile(adaptersPath, "utf8");

  assert.match(source, /export interface DocumentAdapter<TDraft>/);
  for (const documentType of [
    "invoice",
    "receipt",
    "expense-report",
    "mileage-log",
    "quarterly-tax-estimator",
    "w9-request",
    "1099-nec-tracker",
  ]) {
    assert.match(source, new RegExp(`documentType:\\s*"${documentType}"`));
  }
  for (const method of [
    "getInitialDraft",
    "getSampleDraft",
    "readField",
    "writeField",
    "validate",
    "toPdfInputs",
    "fileName",
  ]) {
    assert.match(source, new RegExp(`${method}\\s*[:(]`));
  }
  assert.match(source, /sampleData[\s\S]*builtInValues[\s\S]*customValues/);
  assert.doesNotMatch(source, /\beval\s*\(|new Function\s*\(/);
});

test("the shared advanced workspace renders published form configuration and isolates custom values by template", async () => {
  const source = await readFile(workspacePath, "utf8");

  assert.match(source, /^"use client";/);
  assert.match(source, /config\.form\.sections/);
  assert.match(source, /AdvancedDocumentPreview/);
  assert.match(source, /downloadAdvancedDocumentPdf/);
  assert.match(source, /openAdvancedDocumentPdf/);
  assert.match(source, /OrderableList/);
  assert.match(source, /template\.id/);
  assert.match(source, /templateCustomSampleValues/);
  assert.match(source, /localStorage/);
  assert.match(source, /MAX_RUNTIME_REPEATER_ROWS\s*=\s*500/);
  assert.match(source, /slice\(0,\s*MAX_RUNTIME_REPEATER_ROWS\)/);
  assert.match(source, /incomplete required column/);
  assert.match(source, /containsFullTin/);
  assert.match(source, /control === "number"/);
  assert.match(source, /control === "date"/);
  assert.match(source, /<CheckboxControl\b/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
});

test("the admin fields panel is registry-driven and edits ordered form sections", async () => {
  const source = await readFile(editorPath, "utf8");

  assert.match(source, /getDocumentDefinition/);
  assert.match(source, /Fields & data/);
  assert.match(source, /form\.sections/);
  assert.match(source, /OrderableList/);
  assert.match(source, /custom\./);
  assert.match(source, /Add custom field/);
  assert.match(source, /Add repeatable table/);
  assert.match(source, /source/);
  assert.match(source, /validateAdvancedTemplateConfig/);
  assert.match(source, /non-blocking publish/);
  assert.doesNotMatch(source, /template\.documentType === "invoice"\s*\?/);
});

test("advanced invoices use only the shared pdfme workspace export path", async () => {
  const source = await readFile("app/paperwork/components/App.tsx", "utf8");

  assert.match(source, /<AdvancedTemplateWorkspace/);
  assert.match(source, /isInvoice\s*&&\s*selectedTemplate\.layoutFamily\s*!==\s*"advanced"/);
  assert.doesNotMatch(source, /advancedInvoiceInputs/);
});

test("every enabled Paperwork component key loads its matching templates", async () => {
  const source = await readFile("app/paperwork/[slug]/page.tsx", "utf8");

  for (const [componentKey, documentType] of [
    ["invoice-generator", "invoice"],
    ["receipt-generator", "receipt"],
    ["expense-report", "expense-report"],
    ["mileage-log", "mileage-log"],
    ["quarterly-tax-estimator", "quarterly-tax-estimator"],
    ["w9-request", "w9-request"],
    ["1099-nec-tracker", "1099-nec-tracker"],
  ]) {
    assert.match(source, new RegExp(`"${componentKey}"\\s*:\\s*"${documentType}"`));
  }
  assert.match(source, /getPublishedTemplates\(documentType\)/);
});

test("document template publishing validates and renders outside its final transaction", async () => {
  const [mutations, actions, nextConfig] = await Promise.all([
    readFile("lib/admin/adminMutations.ts", "utf8"),
    readFile("app/admin/actions.ts", "utf8"),
    readFile("next.config.ts", "utf8"),
  ]);

  for (const name of [
    "duplicateDocumentTemplate",
    "importDocumentTemplate",
    "updateDocumentTemplate",
    "publishDocumentTemplate",
    "updateAndPublishDocumentTemplate",
    "archiveDocumentTemplate",
    "setDefaultDocumentTemplate",
  ]) {
    assert.match(mutations, new RegExp(`export async function ${name}`));
    assert.match(actions, new RegExp(name));
  }
  assert.match(mutations, /validateAdvancedTemplateForPublish/);
  assert.match(mutations, /import\("@pdfme\/generator"\)/);
  assert.match(mutations, /expectedVersion/);
  assert.match(mutations, /current\.version !== expectedVersion/);
  assert.match(actions, /5_000_000/);
  assert.match(nextConfig, /bodySizeLimit:\s*"6mb"/);
  assert.match(mutations, /eq\(invoiceTemplatesTable\.documentType,\s*template\.documentType\)/);
});
