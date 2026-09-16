import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const previewPath = "app/paperwork/components/AdvancedDocumentPreview.tsx";

test("Paperwork advanced template preview owns the complete pdfme lifecycle", async () => {
  const source = await readFile(previewPath, "utf8");

  assert.match(source, /^"use client";/);
  assert.match(source, /template: AdvancedDocumentTemplate/);
  assert.match(source, /data: Record<string, string>/);

  assert.match(source, /import\("@pdfme\/ui"\)/);
  assert.match(source, /import\("@pdfme\/schemas"\)/);
  assert.match(source, /new Viewer\(/);
  assert.match(source, /\.updateTemplate\(/);
  assert.match(source, /\.setInputs\(/);
  assert.match(source, /\.destroy\(\)/);

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
    assert.match(source, new RegExp(`${plugin}: schemas\\.${plugin}`));
  }
  assert.match(source, /\.\.\.schemas\.barcodes/);

  assert.match(source, /import\("@pdfme\/generator"\)/);
  assert.match(source, /generate\(\{/);
  assert.match(source, /export async function downloadAdvancedDocumentPdf/);
  assert.match(source, /export async function openAdvancedDocumentPdf/);
  assert.match(source, /URL\.createObjectURL\(/);
  assert.match(source, /finally\s*\{[\s\S]*URL\.revokeObjectURL\(/);
  assert.match(source, /role="alert"/);
});

test("Paperwork advanced preview fills its container and anchors controls at the bottom", async () => {
  const [source, styles] = await Promise.all([
    readFile(previewPath, "utf8"),
    readFile("app/globals.css", "utf8"),
  ]);

  assert.match(source, /className="pdfme-preview-surface size-full"/);
  assert.match(
    styles,
    /\.pdfme-preview-surface\s*>\s*\.pdfme-designer-root[\s\S]*?height:\s*100%\s*!important/,
  );
  assert.match(
    styles,
    /\.pdfme-preview-surface[\s\S]*?:has\(>\s*\.pdfme-ui-control-bar\)[\s\S]*?bottom:\s*16px\s*!important/,
  );
  assert.match(source, /function fitViewerPageToSurface/);
  assert.match(source, /container\.clientWidth - 16/);
  assert.match(
    source,
    /container\.clientHeight - controls\.getBoundingClientRect\(\)\.height - 48/,
  );
  assert.match(source, /viewer\.updateOptions\(\{\s*zoomLevel\s*\}\)/);
});
