import assert from "node:assert/strict";
import test from "node:test";

import { PDFDocument } from "pdf-lib";

import { openPdfInspectionSession } from "../lib/tool-framework/media/pdfRender.ts";

async function twoPagePdf() {
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 400]);
  pdf.addPage([500, 600]);
  return pdf.save();
}

test("PDF inspection keeps a range-backed session and returns geometry before raster work", async () => {
  const source = new File([await twoPagePdf()], "two-pages.pdf", {
    type: "application/pdf",
  });
  const slice = source.slice.bind(source);
  let sliceCalls = 0;
  Object.defineProperties(source, {
    arrayBuffer: {
      value() {
        throw new Error("inspection must not read the complete File");
      },
    },
    slice: {
      value(begin, end, contentType) {
        sliceCalls += 1;
        return slice(begin, end, contentType);
      },
    },
  });

  const session = await openPdfInspectionSession(
    {
      id: "pdf-1",
      name: source.name,
      mime: source.type,
      size: source.size,
      source,
    },
    180,
    new AbortController().signal,
  );

  assert.equal(session.pageCount, 2);
  assert.deepEqual(session.pages, [
    { pageNumber: 1, pageWidth: 300, pageHeight: 400 },
    { pageNumber: 2, pageWidth: 500, pageHeight: 600 },
  ]);
  assert.ok(sliceCalls > 0, "PDF.js should request bounded File slices");
  await assert.rejects(session.renderThumbnails([3]), (error) => error?.code === "invalid-page-selection");
  await session.close();
  await session.close();
});
