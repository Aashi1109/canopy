import { test, expect } from "vitest";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("invoice action generates React PDF while the live preview stays HTML", async () => {
  const [app, preview, pdfDocument] = await Promise.all([
    readFile(new URL("app/paperwork/components/App.tsx", root), "utf8"),
    readFile(new URL("app/paperwork/components/InvoicePreviewRenderer.tsx", root), "utf8"),
    readFile(new URL("app/paperwork/components/InvoicePdfDocument.tsx", root), "utf8"),
  ]);

  expect(/\bwindow\.print\s*\(/.test(app), "the invoice action should not use browser printing").toBe(false);
  expect(
    /\bpdf\s*\([\s\S]*<InvoicePdfDocument\b[\s\S]*\)\.toBlob\s*\(\)/.test(app),
    "the invoice action should generate a real React PDF blob",
  ).toBe(true);
  expect(/\bdata:\s*InvoiceData\s*;\s*template:\s*InvoiceTemplate\s*;/.test(preview)).toBe(true);
  expect(/\bdata:\s*InvoiceData\s*;\s*template:\s*InvoiceTemplate\s*;/.test(pdfDocument)).toBe(true);
  expect(/<(?:article|div|section)\b/.test(preview), "the live invoice preview should render regular HTML").toBe(true);
  expect(
    /@react-pdf\/renderer|\b(?:PDFViewer|usePDF|InvoicePdfDocument|setTimeout|clearTimeout)\b/.test(preview),
    "the live HTML preview must not mount or debounce a PDF renderer",
  ).toBe(false);
});

test("invoice PDF lets each text size calculate its own line height", async () => {
  const pdfDocument = await readFile(new URL("app/paperwork/components/InvoicePdfDocument.tsx", root), "utf8");

  expect(
    /\bconst lineHeight\b|\blineHeight,/.test(pdfDocument),
    "a page-level computed line height overlaps larger title and badge text",
  ).toBe(false);
});
