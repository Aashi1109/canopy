"use client";

import { PdfFileWorkspace } from "@/components/PdfFileWorkspace";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import { pdfSize } from "@/lib/tool-framework/media/pdfDocument";
import { parsePageSelection } from "@/lib/tool-framework/settings";

function getPlan(settings: WorkspaceProps["settings"], pageCount: number) {
  const value = settings.pages ?? "all";
  const selection = parsePageSelection(Array.isArray(value) ? value.join(",") : String(value), pageCount);
  const count = selection === "all" ? pageCount : selection.length;
  if (!count) throw new Error(`Choose pages from 1 to ${pageCount}, or enter all.`);
  const pageSize =
    settings.pageSize === "letter" || settings.pageSize === "legal" || settings.pageSize === "custom"
      ? settings.pageSize
      : "a4";
  const target = pdfSize(pageSize, Number(settings.width ?? 595), Number(settings.height ?? 842));
  if (!Number.isFinite(target.width) || !Number.isFinite(target.height))
    throw new Error("Enter valid page dimensions.");
  const margin = Number(settings.margin ?? 18);
  const maximumMargin = Math.min(target.width, target.height) / 2;
  if (settings.margin === "" || !Number.isFinite(margin) || margin < 0 || margin >= maximumMargin) {
    throw new Error(`Use a margin from 0 to less than ${maximumMargin} pt so content fits on the page.`);
  }
  return {
    title: `${count} ${count === 1 ? "page will" : "pages will"} be resized`,
    detail: "A new PDF will be created with these settings. Your original stays unchanged.",
  };
}

export default function ResizePdfPagesWorkspace(props: WorkspaceProps) {
  return (
    <PdfFileWorkspace {...props} definitionKey="resize-pdf-pages" optionsTitle="Resize settings" getPlan={getPlan} />
  );
}
