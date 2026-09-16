import type {
  PDFContentStream as PDFContentStreamType,
  PDFDocument,
  PDFOperator,
  PDFPage,
} from "pdf-lib";
import { MEDIA_LIMITS } from "./validation.ts";

export type PdfContentBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PdfClipApi = Pick<
  typeof import("pdf-lib"),
  "PDFContentStream" | "clip" | "endPath" | "popGraphicsState" | "pushGraphicsState" | "rectangle"
>;

export class PdfPreflightError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function hasTransparentPixels(data: Uint8Array | Uint8ClampedArray) {
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < 255) return true;
  }
  return false;
}

export function getPdfContentBox(
  pageWidth: number,
  pageHeight: number,
  margin: number,
): PdfContentBox {
  return {
    x: margin,
    y: margin,
    width: Math.max(1, pageWidth - margin * 2),
    height: Math.max(1, pageHeight - margin * 2),
  };
}

export function clipStartOperators(box: PdfContentBox, pdfLib: PdfClipApi): PDFOperator[] {
  return [
    pdfLib.pushGraphicsState(),
    pdfLib.rectangle(box.x, box.y, box.width, box.height),
    pdfLib.clip(),
    pdfLib.endPath(),
  ];
}

export function clipEndOperators(pdfLib: PdfClipApi): PDFOperator[] {
  return [pdfLib.popGraphicsState()];
}

export function wrapPageContentsWithClip(
  document: PDFDocument,
  page: PDFPage,
  box: PdfContentBox,
  pdfLib: PdfClipApi,
) {
  const start: PDFContentStreamType = pdfLib.PDFContentStream.of(
    document.context.obj({}),
    clipStartOperators(box, pdfLib),
  );
  const end: PDFContentStreamType = pdfLib.PDFContentStream.of(
    document.context.obj({}),
    clipEndOperators(pdfLib),
  );
  page.node.wrapContentStreams(document.context.register(start), document.context.register(end));
}

export function assertStructuralPdfInspection({
  isEncrypted,
  pageCount,
}: {
  isEncrypted: boolean;
  pageCount: number;
}) {
  if (isEncrypted) {
    throw new PdfPreflightError(
      "encrypted-pdf",
      "Encrypted or password-protected PDFs are not supported.",
    );
  }
  if (pageCount > MEDIA_LIMITS.pdfs.maxStructuralPages) {
    throw new PdfPreflightError(
      "too-many-pages",
      `Structural PDF jobs support at most ${MEDIA_LIMITS.pdfs.maxStructuralPages} pages.`,
    );
  }
}

export async function inspectPdfBeforeStructuralRewrite(data: ArrayBuffer) {
  const { PDFDocument } = await import("pdf-lib");
  try {
    const pdf = await PDFDocument.load(data, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
    const pageCount = pdf.getPageCount();
    assertStructuralPdfInspection({ isEncrypted: pdf.isEncrypted, pageCount });
    return { pageCount };
  } catch (error) {
    if (error instanceof PdfPreflightError) throw error;
    if (
      error instanceof Error &&
      /password|encrypted|encryption/i.test(`${error.name} ${error.message}`)
    ) {
      throw new PdfPreflightError(
        "encrypted-pdf",
        "Encrypted or password-protected PDFs are not supported.",
      );
    }
    throw new PdfPreflightError("malformed-pdf", "The PDF is malformed or unsupported.");
  }
}

export async function processStructuralPages<T>(
  pages: readonly T[],
  pageNumber: (page: T) => number,
  stage: string,
  report: (current: number, completed: number, total: number, stage: string) => void,
  process: (page: T, index: number) => void | Promise<void>,
) {
  for (let index = 0; index < pages.length; index += 1) {
    const current = pageNumber(pages[index]);
    report(current, index, pages.length, stage);
    await process(pages[index], index);
    report(current, index + 1, pages.length, "Page complete");
  }
}
