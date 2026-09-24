import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";

const previewPath = "app/paperwork/components/AdvancedDocumentPreview.tsx";

test("Paperwork advanced template preview owns the complete pdfme lifecycle", async () => {
  const source = await readFile(previewPath, "utf8");

  expect(source).toMatch(/^"use client";/);
  expect(source).toMatch(/template: AdvancedDocumentTemplate/);
  expect(source).toMatch(/data: Record<string, string>/);

  expect(source).toMatch(/import\("@pdfme\/ui"\)/);
  expect(source).toMatch(/import\("@pdfme\/schemas"\)/);
  expect(source).toMatch(/new Viewer\(/);
  expect(source).toMatch(/\.updateTemplate\(/);
  expect(source).toMatch(/\.setInputs\(/);
  expect(source).toMatch(/\.destroy\(\)/);

  for (const plugin of [
    "text",
    "multiVariableText",
    "list",
    "image",
    "signature",
    "svg",
    "table",
    "line",
    "rectangle",
    "ellipse",
    "dateTime",
    "date",
    "time",
    "select",
    "radioGroup",
    "checkbox",
    "circleMark",
  ]) {
    expect(source).toMatch(new RegExp(`${plugin}: schemas\\.${plugin}`));
  }
  expect(source).toMatch(/\.\.\.schemas\.barcodes/);

  expect(source).toMatch(/import\("@pdfme\/generator"\)/);
  expect(source).toMatch(/generate\(\{/);
  expect(source).toMatch(/export async function downloadAdvancedDocumentPdf/);
  expect(source).toMatch(/export async function openAdvancedDocumentPdf/);
  expect(source).toMatch(/URL\.createObjectURL\(/);
  expect(source).toMatch(/finally\s*\{[\s\S]*URL\.revokeObjectURL\(/);
  expect(source).toMatch(/role="alert"/);
});

test("Paperwork advanced preview fills its container and anchors controls at the bottom", async () => {
  const [source, styles] = await Promise.all([readFile(previewPath, "utf8"), readFile("app/globals.css", "utf8")]);

  expect(source).toMatch(/className="pdfme-preview-surface size-full"/);
  expect(styles).toMatch(/\.pdfme-preview-surface\s*>\s*\.pdfme-designer-root[\s\S]*?height:\s*100%\s*!important/);
  expect(styles).toMatch(
    /\.pdfme-preview-surface[\s\S]*?:has\(>\s*\.pdfme-ui-control-bar\)[\s\S]*?bottom:\s*16px\s*!important/,
  );
  expect(source).toMatch(/function fitViewerPageToSurface/);
  expect(source).toMatch(/container\.clientWidth - 16/);
  expect(source).toMatch(/container\.clientHeight - controls\.getBoundingClientRect\(\)\.height - 48/);
  expect(source).toMatch(/viewer\.updateOptions\(\{\s*zoomLevel\s*\}\)/);
});
