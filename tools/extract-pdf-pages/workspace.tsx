"use client";

import { PdfFileWorkspace, PdfPageSelectionOverlay } from "@/components/PdfFileWorkspace";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import { parsePageRange } from "@/lib/tool-framework/media/validation";
import { parsePageSelection } from "@/lib/tool-framework/settings";

function selectedPages(value: unknown, pageCount: number): number[] {
  const expression = (Array.isArray(value) ? value.join(",") : String(value ?? ""))
    .trim()
    .toLowerCase();
  if (expression === "odd" || expression === "even") {
    const pages = parsePageSelection(expression, pageCount) as number[];
    if (!pages.length) throw new Error("No pages match this selection. Choose pages in your PDF.");
    return pages;
  }
  const parsed = parsePageRange(expression, pageCount);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.pages;
}

function getPlan(settings: WorkspaceProps["settings"], pageCount: number) {
  const pages = selectedPages(settings.pages, pageCount);
  return {
    title: `1 PDF with ${pages.length} ${pages.length === 1 ? "page" : "pages"} will be created`,
    detail: (
      <div className="max-h-32 overflow-y-auto text-muted-foreground">
        Pages in output order: {pages.join(", ")}
      </div>
    ),
  };
}

export default function ExtractPdfWorkspace(props: WorkspaceProps) {
  return (
    <PdfFileWorkspace
      {...props}
      definitionKey="extract-pdf-pages"
      optionsTitle="Extraction settings"
      getPlan={getPlan}
      pageClassName="rounded-lg border-0"
      renderPageOverlay={({ pageNumber }, pages) => {
        let selection: number[];
        try {
          selection = selectedPages(props.settings.pages, pages.length);
        } catch {
          selection = [];
        }
        const selected = selection.includes(pageNumber);
        return (
          <PdfPageSelectionOverlay
            pageNumber={pageNumber}
            selected={selected}
            disabled={props.disabled}
            onToggle={() =>
              props.onSettingChange(
                "pages",
                (selected
                  ? selection.filter((page) => page !== pageNumber)
                  : [...selection, pageNumber]
                ).join(","),
              )
            }
          />
        );
      }}
    />
  );
}
