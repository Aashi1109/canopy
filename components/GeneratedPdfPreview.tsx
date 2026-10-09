"use client";

import { useTranslations } from "next-intl";
import { ToolError, translateToolError } from "@/lib/tool-framework/run";

import { Button, MediaPreview, Muted, PdfViewer } from "@/components/ui/index.tsx";
import { useEffect, useState } from "react";

import { PdfPreviewPage, usePdfPageImages } from "@/components/PdfPagesSurface";
import { ArtifactDownloadButton } from "@/components/ArtifactDownloadButton";
import { WorkspaceSurface } from "@/components/Surfaces";
import { readArtifact, type StoredToolArtifact } from "@/lib/tool-framework/artifacts";
import { useToolRun } from "@/lib/tool-framework/useToolRun";
import { createToolRunFile } from "@/lib/tool-framework/workerProtocol";

export function GeneratedPdfPreview({
  file,
  definitionKey,
  fill = false,
}: {
  file: StoredToolArtifact;
  definitionKey: string;
  fill?: boolean;
}) {
  const t = useTranslations("Workbench");
  const toolText = useTranslations("Tool.runtime");
  const { inspect, previews, requestThumbnails, state } = useToolRun();
  const pages = usePdfPageImages(previews);
  const [currentPage, setCurrentPage] = useState(1);
  const [failure, setFailure] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let current = true;
    setFailure("");
    void readArtifact(file)
      .then((blob) => {
        if (!current) return;
        inspect({
          key: definitionKey,
          source: "output",
          file: createToolRunFile(file.id, new File([blob], file.name, { type: file.mime })),
          thumbnailWidth: 1200,
        });
      })
      .catch(() => {
        if (current) setFailure(t("mediaGeneratedPdfOpenFailed"));
      });
    return () => {
      current = false;
    };
  }, [file, definitionKey, inspect, attempt, t]);

  useEffect(() => {
    if (state.status === "completed") requestThumbnails([currentPage]);
  }, [currentPage, requestThumbnails, state.status, previews]);

  const error =
    failure ||
    (state.error
      ? translateToolError(
          new ToolError(state.error.code, state.error.message, state.error.recovery, state.error.details),
          (message) => (toolText.has(message.key) ? toolText(message.key, message.values) : undefined),
          (message) => (t.has(message.key) ? t(message.key, message.values) : undefined),
        ).message
      : undefined);
  const viewer = (onExpand?: () => void) => (
    <PdfViewer
      className={`min-w-0 w-full ${onExpand && !fill ? "h-[40rem]" : "h-full"}`}
      currentPage={currentPage}
      fit={fill ? "page" : "width"}
      fileName={file.name}
      onExpand={onExpand}
      onPageChange={setCurrentPage}
      outline={pages.map((entry) => ({
        id: `page-${entry.pageNumber}`,
        title: t("mediaPageNumber", { page: entry.pageNumber }),
        page: entry.pageNumber,
      }))}
      pageCount={pages.length}
      pages={pages.map((page) => ({
        pageNumber: page.pageNumber,
        width: page.pageWidth,
        height: page.pageHeight,
        content: (
          <PdfPreviewPage
            alt={t("mediaGeneratedPdfPage", { page: page.pageNumber })}
            page={page}
            requestThumbnails={requestThumbnails}
            active={!onExpand || !expanded}
          />
        ),
      }))}
      pagePreviewDetail={file.name}
      renderPagePreview={(pageNumber) => (
        <PagePreview pageNumber={pageNumber} previews={pages} requestThumbnails={requestThumbnails} />
      )}
    />
  );
  return (
    <WorkspaceSurface
      className={fill ? "h-full min-h-0" : undefined}
      contentClassName={fill ? "min-h-0 flex-1 gap-0" : undefined}
      scroll={fill ? "none" : "content"}
      header="sr-only"
      purpose="preview"
      state={error ? "error" : pages.length ? "ready" : "loading"}
      stateAction={
        error ? (
          <Button onClick={() => setAttempt((value) => value + 1)} variant="outline">
            {t("mediaRetryPreview")}
          </Button>
        ) : undefined
      }
      stateDescription={error ? t("mediaGeneratedPreviewRetry", { error }) : undefined}
      stateTitle={error ? t("mediaPreviewUnavailable") : t("mediaOpeningGeneratedPdf")}
      title={t("mediaGeneratedPdf")}
    >
      {viewer(() => setExpanded(true))}
      <MediaPreview
        open={expanded}
        onOpenChange={setExpanded}
        title={file.name}
        description={t("mediaGeneratedPdfPosition", { page: currentPage, count: pages.length })}
        actions={<ArtifactDownloadButton file={file} size="sm" />}
        viewportClassName="bg-card p-0 text-foreground sm:p-0"
      >
        {viewer()}
      </MediaPreview>
    </WorkspaceSurface>
  );
}

function PagePreview({
  pageNumber,
  previews,
  requestThumbnails,
}: {
  pageNumber: number;
  previews: ReturnType<typeof usePdfPageImages>;
  requestThumbnails: (pages: readonly number[]) => void;
}) {
  const t = useTranslations("Workbench");
  useEffect(() => {
    requestThumbnails([pageNumber]);
  }, [pageNumber, requestThumbnails]);
  const page = previews.find((entry) => entry.pageNumber === pageNumber);
  return page?.url ? (
    <img alt={t("mediaPageNumber", { page: pageNumber })} className="h-full w-full object-contain" src={page.url} />
  ) : (
    <Muted role="status">{t("mediaRenderingPageNumber", { page: pageNumber })}</Muted>
  );
}
