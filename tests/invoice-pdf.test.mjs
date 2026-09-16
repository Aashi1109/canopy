import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("invoice action generates React PDF while the live preview stays HTML", async () => {
  const [app, preview, pdfDocument] = await Promise.all([
    readFile(new URL("app/paperwork/components/App.tsx", root), "utf8"),
    readFile(new URL("app/paperwork/components/InvoicePreviewRenderer.tsx", root), "utf8"),
    readFile(new URL("app/paperwork/components/InvoicePdfDocument.tsx", root), "utf8"),
  ]);

  assert.equal(/\bwindow\.print\s*\(/.test(app), false, "the invoice action should not use browser printing");
  assert.equal(
    /\bpdf\s*\([\s\S]*<InvoicePdfDocument\b[\s\S]*\)\.toBlob\s*\(\)/.test(app),
    true,
    "the invoice action should generate a real React PDF blob",
  );
  assert.equal(/\bdata:\s*InvoiceData\s*;\s*template:\s*InvoiceTemplate\s*;/.test(preview), true);
  assert.equal(/\bdata:\s*InvoiceData\s*;\s*template:\s*InvoiceTemplate\s*;/.test(pdfDocument), true);
  assert.equal(/<(?:article|div|section)\b/.test(preview), true, "the live invoice preview should render regular HTML");
  assert.equal(
    /@react-pdf\/renderer|\b(?:PDFViewer|usePDF|InvoicePdfDocument|setTimeout|clearTimeout)\b/.test(preview),
    false,
    "the live HTML preview must not mount or debounce a PDF renderer",
  );
});

test("invoice PDF lets each text size calculate its own line height", async () => {
  const pdfDocument = await readFile(new URL("app/paperwork/components/InvoicePdfDocument.tsx", root), "utf8");

  assert.equal(
    /\bconst lineHeight\b|\blineHeight,/.test(pdfDocument),
    false,
    "a page-level computed line height overlaps larger title and badge text",
  );
});
