/**
 * Structural PDF primitives built on `pdf-lib` only.
 *
 * Nothing here rasterises, so nothing here may reach for `pdfjs-dist` — that is
 * `pdfRender.ts`'s exclusive dependency. `pdf-lib` itself stays behind
 * `await import(...)` at every call site.
 */

import type { PDFDocument, PDFPage } from "pdf-lib";

import { ToolError, type ToolRunFile, type ToolRunProgress } from "../run.ts";
import { readToolFile } from "./fileBytes.ts";
import { processStructuralPages } from "./pdfRules.ts";
import { validateMediaSignature, validatePdfSelection } from "./validation.ts";

/** Nine-point anchor for content drawn onto a page. */
export type PdfBoxPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

/**
 * Mirrors `PageSelection` from `lib/tool-framework/settings.ts`. `"odd"` and
 * `"even"` arrive unresolved because settings are parsed before any document
 * is loaded; this module is where the page count finally exists, so this is
 * where they are enumerated.
 */
export type PdfPageSelection = "all" | "odd" | "even" | readonly number[];

export type PdfNamedPageSize = "auto" | "a4" | "letter" | "legal" | "custom";

export type PdfPageDimensions = {
  readonly width: number;
  readonly height: number;
};

export type PdfProgress = (progress: ToolRunProgress) => void;

const POSITION_MARGIN = 24;

export async function loadPdf(file: ToolRunFile): Promise<PDFDocument> {
  const { PDFDocument: Document } = await import("pdf-lib");
  try {
    const pdf = await Document.load(await readToolFile(file), {
      ignoreEncryption: false,
      updateMetadata: false,
    });
    if (pdf.isEncrypted) {
      throw new ToolError(
        "encrypted-pdf",
        "Encrypted or password-protected PDFs are not supported.",
      );
    }
    return pdf;
  } catch (error) {
    if (error instanceof ToolError) throw error;
    if (isPasswordError(error)) {
      throw new ToolError(
        "encrypted-pdf",
        "Encrypted or password-protected PDFs are not supported.",
      );
    }
    throw new ToolError("malformed-pdf", "The PDF is malformed or unsupported.");
  }
}

export async function validatePdfInput(file: ToolRunFile): Promise<void> {
  const result = validateMediaSignature(
    new Uint8Array(await file.source.slice(0, 64 * 1024).arrayBuffer()),
    file.mime,
    ["pdf"],
  );
  if (!result.ok) throw new ToolError(result.code, result.message);
}

export function enforcePageLimit(file: ToolRunFile, pageCount: number, raster: boolean): void {
  const result = validatePdfSelection([{ size: file.size }], {
    pageCount,
    raster,
  });
  if (!result.ok) throw new ToolError(result.code, result.message);
}

/** Validates a 1-based page list and returns it as 0-based indexes. */
export function checkedPages(
  pages: readonly number[],
  pageCount: number,
  rejectDuplicates = true,
): number[] {
  if (!pages.length) throw new ToolError("empty-range", "Choose at least one page.");
  const indexes = pages.map((page) => {
    if (!Number.isInteger(page) || page < 1 || page > pageCount) {
      throw new ToolError("page-out-of-range", `Choose pages between 1 and ${pageCount}.`);
    }
    return page - 1;
  });
  if (rejectDuplicates && new Set(indexes).size !== indexes.length) {
    throw new ToolError("duplicate-page", "Each selected page may appear only once.");
  }
  return indexes;
}

export function resolvePageSelection(selection: PdfPageSelection, pageCount: number): number[] {
  if (selection === "all") {
    return Array.from({ length: pageCount }, (_, index) => index);
  }
  if (selection === "odd" || selection === "even") {
    // Page numbers are 1-based for the user, indexes are 0-based here: page 1
    // is odd and lives at index 0.
    const firstIndex = selection === "odd" ? 0 : 1;
    const indexes: number[] = [];
    for (let index = firstIndex; index < pageCount; index += 2) indexes.push(index);
    return indexes;
  }
  return checkedPages(selection, pageCount);
}

export function resolvePageNumbers(selection: PdfPageSelection, pageCount: number): number[] {
  return resolvePageSelection(selection, pageCount).map((index) => index + 1);
}

export function positionedBox(
  page: PDFPage,
  width: number,
  height: number,
  position: PdfBoxPosition,
): { x: number; y: number } {
  const [vertical, horizontal] = position.split("-") as [string, string];
  const margin = POSITION_MARGIN;
  const x =
    horizontal === "left"
      ? margin
      : horizontal === "right"
        ? page.getWidth() - width - margin
        : (page.getWidth() - width) / 2;
  const y =
    vertical === "top"
      ? page.getHeight() - height - margin
      : vertical === "bottom"
        ? margin
        : (page.getHeight() - height) / 2;
  return { x: Math.max(0, x), y: Math.max(0, y) };
}

export function pdfSize(
  size: PdfNamedPageSize,
  width?: number,
  height?: number,
): PdfPageDimensions {
  if (size === "a4") return { width: 595.28, height: 841.89 };
  if (size === "letter") return { width: 612, height: 792 };
  if (size === "legal") return { width: 612, height: 1008 };
  if (size === "custom" && width && height && width > 0 && height > 0) {
    return { width, height };
  }
  throw new ToolError("invalid-page-size", "Choose valid custom PDF page dimensions.");
}

/** Copies `pages` (0-based indexes) from `source` into `output`, in order. */
export async function addCopiedPagesWithProgress(
  output: PDFDocument,
  source: PDFDocument,
  pages: readonly number[],
  stage: string,
  progress?: PdfProgress,
): Promise<void> {
  const copies = await output.copyPages(source, [...pages]);
  await processStructuralPages(
    pages,
    (page) => page + 1,
    stage,
    reportStructuralProgress(progress),
    (_page, index) => {
      output.addPage(copies[index]);
    },
  );
}

/** Adapts `processStructuralPages`' four-argument report to `ctx.progress`. */
export function reportStructuralProgress(
  progress?: PdfProgress,
): (current: number, completed: number, total: number, stage: string) => void {
  return (_current, completed, total, stage) => {
    progress?.({ completed, total, stage });
  };
}

export function isPasswordError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /password|encrypted|encryption/i.test(`${error.name} ${error.message}`)
  );
}
