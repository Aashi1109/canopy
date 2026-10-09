"use client";

import { useTranslations } from "next-intl";

import { PdfFileWorkspace } from "@/components/PdfFileWorkspace";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import { pdfSize } from "@/lib/tool-framework/media/pdfDocument";
import { parsePageSelection } from "@/lib/tool-framework/settings";

function getPlan(settings: WorkspaceProps["settings"], pageCount: number, t: ReturnType<typeof useTranslations>) {
  const value = settings.pages ?? "all";
  let selection: ReturnType<typeof parsePageSelection>;
  try {
    selection = parsePageSelection(Array.isArray(value) ? value.join(",") : String(value), pageCount);
  } catch {
    throw new Error(t("workspace.choosePages", { count: pageCount }));
  }
  const count = selection === "all" ? pageCount : selection.length;
  if (!count) throw new Error(t("workspace.choosePages", { count: pageCount }));
  const pageSize =
    settings.pageSize === "letter" || settings.pageSize === "legal" || settings.pageSize === "custom"
      ? settings.pageSize
      : "a4";
  const target = pdfSize(pageSize, Number(settings.width ?? 595), Number(settings.height ?? 842));
  if (!Number.isFinite(target.width) || !Number.isFinite(target.height))
    throw new Error(t("workspace.validDimensions"));
  const margin = Number(settings.margin ?? 18);
  const maximumMargin = Math.min(target.width, target.height) / 2;
  if (settings.margin === "" || !Number.isFinite(margin) || margin < 0 || margin >= maximumMargin) {
    throw new Error(t("workspace.validMargin", { maximum: maximumMargin }));
  }
  return {
    title: t("workspace.planTitle", { count }),
    detail: t("workspace.planDetail"),
  };
}

export default function ResizePdfPagesWorkspace(props: WorkspaceProps) {
  const t = useTranslations("Tool.runtime");
  return (
    <PdfFileWorkspace
      {...props}
      definitionKey="resize-pdf-pages"
      optionsTitle={t("workspace.resizeSettings")}
      getPlan={(settings, count) => getPlan(settings, count, t)}
    />
  );
}
