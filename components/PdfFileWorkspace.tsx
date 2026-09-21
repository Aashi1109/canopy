"use client";

import {
  Alert,
  AlertBanner,
  AlertDescription,
  AlertTitle,
  Button,
  Caption,
  DownloadResult,
  FileChip,
  FileQueueItem,
  MediaPreview,
  Muted,
  PdfViewer,
  ProcessingStatus,
  ToolOptionsPanel,
  ToolActionButton,
} from "@/components/ui/index.tsx";
import { Check, FileText, Upload } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { ArtifactDownloadButton } from "@/components/ArtifactDownloadButton";
import { validateFileSelection, workspaceFileId } from "@/components/FileInput";
import { PdfPreviewPage, usePdfPageImages, type PdfPageImage } from "@/components/PdfPagesSurface";
import { SettingsPanel } from "@/components/SettingsPanel";
import { FileIntakeSurface, WorkspaceSurface } from "@/components/Surfaces";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import { useToolRun } from "@/lib/tool-framework/useToolRun";
import { createToolRunFile } from "@/lib/tool-framework/workerProtocol";

export function PdfPageSelectionOverlay({
  pageNumber,
  selected,
  disabled,
  onToggle,
}: {
  pageNumber: number;
  selected: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      aria-label={`${selected ? "Deselect" : "Select"} page ${pageNumber}`}
      aria-pressed={selected}
      className={`absolute inset-0 h-full w-full cursor-pointer touch-pan-y rounded-lg p-0 hover:bg-transparent ${selected ? "border-2 border-primary" : "border border-border hover:border-primary/50"}`}
      disabled={disabled}
      onClick={onToggle}
      variant="card-action"
    >
      {selected && (
        <span
          aria-hidden="true"
          className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-[4px] bg-primary text-primary-foreground"
        >
          <Check className="size-[13px]" />
        </span>
      )}
    </Button>
  );
}

export function PdfFileWorkspace({
  definitionKey,
  optionsTitle,
  getPlan,
  getPageRotation,
  pageClassName,
  renderPageOverlay,
  renderOptions,
  completedPreview,
  completionActions,
  secondaryActions,
  resultVariant = "card",
  ...props
}: WorkspaceProps & {
  definitionKey: string;
  optionsTitle: string;
  pageClassName?: string;
  getPlan: (
    settings: WorkspaceProps["settings"],
    pageCount: number,
    pages: readonly PdfPageImage[],
  ) => { title: string; detail: ReactNode };
  getPageRotation?: (page: PdfPageImage, pages: readonly PdfPageImage[]) => 0 | 90 | 180 | 270;
  renderPageOverlay?: (page: PdfPageImage, pages: readonly PdfPageImage[]) => ReactNode;
  renderOptions?: (pages: readonly PdfPageImage[]) => ReactNode;
  resultVariant?: "card" | "action";
  completedPreview?: ReactNode;
  completionActions?: ReactNode;
  secondaryActions?: ReactNode;
}) {
  const actionLabel = props.primaryAction?.label ?? "Run";
  const file = props.input.files[0];
  const inputSpec = props.spec.input;
  const { inspect, previews, requestThumbnails, reset, state } = useToolRun();
  const inspectedPages = usePdfPageImages(previews);
  const [inspectedFile, setInspectedFile] = useState<File>();
  const pages = inspectedFile === file ? inspectedPages : [];
  const [currentPage, setCurrentPage] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [inputIssue, setInputIssue] = useState("");
  const [inspectionFailure, setInspectionFailure] = useState("");
  const [cancelled, setCancelled] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInspectedFile(file);
    setCurrentPage(1);
    setExpanded(false);
    setInputIssue("");
    setInspectionFailure("");
    reset();
    if (file) {
      try {
        inspect({
          key: definitionKey,
          file: createToolRunFile(workspaceFileId(file), file),
          thumbnailWidth: 1200,
        });
      } catch {
        setInspectionFailure("This file could not be opened as a PDF.");
      }
    }
  }, [file, attempt, definitionKey, inspect, reset]);

  useEffect(() => {
    setCancelled(false);
  }, [file, props.settings]);
  useEffect(() => {
    if (props.running) setCancelled(false);
  }, [props.running]);

  const plan = useMemo(() => {
    if (!pages.length) return { summary: null, error: "" };
    try {
      return { summary: getPlan(props.settings, pages.length, pages), error: "" };
    } catch (error) {
      return {
        summary: null,
        error: error instanceof Error ? error.message : "Check your settings.",
      };
    }
  }, [getPlan, pages, props.settings]);

  const inspectionError = inspectionFailure || state.error?.message;
  const reason = !file
    ? "Add a PDF to begin."
    : inspectionError
      ? "Replace the PDF or retry opening it."
      : !pages.length
        ? "Opening your PDF…"
        : plan.error || null;
  useEffect(() => {
    props.onValidationChange?.(reason);
  }, [reason, props.onValidationChange]);
  useEffect(() => {
    props.onToolbarActionsChange?.({
      primaryActionInWorkspace: true,
      statusMeta: file
        ? `${file.name} · ${inspectionError ? "Unable to open PDF" : pages.length ? `${pages.length} pages` : "Opening PDF"}`
        : "Add one PDF to begin",
    });
    return () => props.onToolbarActionsChange?.(null);
  }, [file, pages.length, inspectionError, props.onToolbarActionsChange]);

  if (inputSpec.kind !== "files") return null;
  const addFiles = (files: File[]) => {
    if (props.disabled) return;
    if (files.length !== 1) {
      setInputIssue("Add one PDF at a time.");
      return;
    }
    const selection = validateFileSelection([], files, inputSpec);
    setInputIssue(selection.issue);
    if (selection.files.length) props.onInputChange({ ...props.input, files: selection.files });
  };
  const fileChip = file ? (
    <FileChip
      file={file}
      disabled={props.disabled}
      details={pages.length ? `${pages.length} ${pages.length === 1 ? "page" : "pages"}` : undefined}
      onRemove={() => {
        if (props.disabled) return;
        setExpanded(false);
        props.onInputChange({ ...props.input, files: [] });
      }}
    />
  ) : undefined;
  const fileControls = (
    <ToolActionButton
      action="upload"
      disabled={props.disabled}
      onClick={() => {
        setExpanded(false);
        fileInput.current?.click();
      }}
    >
      Upload
    </ToolActionButton>
  );
  const viewer = (fullScreen: boolean) => (
    <PdfViewer
      className="h-full min-h-0 w-full"
      currentPage={currentPage}
      fileName={file?.name ?? "Source PDF"}
      fileNameContent={fileChip}
      fileSize={
        file
          ? `${(file.size / (file.size < 1_048_576 ? 1024 : 1_048_576)).toFixed(2)} ${file.size < 1_048_576 ? "KiB" : "MiB"}`
          : undefined
      }
      fit="page"
      onExpand={fullScreen ? undefined : () => setExpanded(true)}
      onPageChange={setCurrentPage}
      outline={pages.map((page) => ({
        id: `page-${page.pageNumber}`,
        title: `Page ${page.pageNumber}`,
        page: page.pageNumber,
      }))}
      pageCount={pages.length}
      pageClassName={pageClassName}
      pages={pages.map((page) => {
        const rotation = getPageRotation?.(page, pages) ?? 0;
        const swapped = rotation === 90 || rotation === 270;
        return {
          pageNumber: page.pageNumber,
          width: swapped ? page.pageHeight : page.pageWidth,
          height: swapped ? page.pageWidth : page.pageHeight,
          content: (
            <div className="relative h-full w-full overflow-hidden">
              <div
                className="absolute left-1/2 top-1/2"
                style={{
                  width: `${(swapped ? page.pageWidth / page.pageHeight : 1) * 100}%`,
                  height: `${(swapped ? page.pageHeight / page.pageWidth : 1) * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                }}
              >
                <PdfPreviewPage page={page} requestThumbnails={requestThumbnails} active={fullScreen || !expanded} />
              </div>
              {renderPageOverlay?.(page, pages)}
            </div>
          ),
        };
      })}
      pagePreviewDetail={
        getPageRotation ? "Original thumbnail · changes shown in main preview" : "Original PDF · unchanged"
      }
      rightChildren={fileControls}
      renderPagePreview={(number) => {
        const page = pages[number - 1];
        return page ? (
          <div className="relative h-full w-full">
            <PdfPreviewPage page={page} requestThumbnails={requestThumbnails} active />
          </div>
        ) : null;
      }}
    />
  );
  const outputs = props.result?.render === "files" ? props.result.files : [];
  const primaryOutput =
    outputs.find((output) => output.mime === "application/zip") ?? (outputs.length === 1 ? outputs[0] : undefined);
  const pdfCount = outputs.filter((output) => output.mime === "application/pdf").length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(20rem,32%)] lg:overflow-hidden">
      <div
        className="flex min-h-0 min-w-0 shrink-0 flex-col border-b border-border lg:border-r lg:border-b-0"
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (file) addFiles(Array.from(event.dataTransfer.files));
        }}
      >
        {file ? (
          <WorkspaceSurface
            title="Source PDF"
            header="sr-only"
            className="h-[28rem] flex-none lg:h-auto lg:flex-1"
            contentClassName="gap-0"
            scroll="none"
          >
            <input
              accept={inputSpec.accept}
              className="sr-only"
              disabled={props.disabled}
              onChange={(event) => {
                if (event.target.files?.length) addFiles(Array.from(event.target.files));
                event.target.value = "";
              }}
              ref={fileInput}
              tabIndex={-1}
              type="file"
            />
            {(inspectionError || !pages.length) && (
              <div className="flex min-w-0 flex-wrap items-center gap-3 border-b border-border px-4 py-2">
                <div className="min-w-0 flex-1">{fileChip}</div>
                {fileControls}
              </div>
            )}
            <WorkspaceSurface
              title="PDF preview"
              header="sr-only"
              className="min-h-0 flex-1"
              scroll="none"
              contentClassName="gap-0"
              state={inspectionError ? "error" : pages.length ? "ready" : "loading"}
              stateTitle={inspectionError ? "Unable to open PDF" : "Opening your PDF…"}
              stateDescription={
                inspectionError ? `${inspectionError} Try another PDF, or retry opening this file.` : undefined
              }
              stateAction={
                inspectionError ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button onClick={() => setAttempt((value) => value + 1)} variant="outline">
                      Retry preview
                    </Button>
                  </div>
                ) : undefined
              }
            >
              {completedPreview ?? viewer(false)}
            </WorkspaceSurface>
          </WorkspaceSurface>
        ) : (
          <FileIntakeSurface
            accept={inputSpec.accept}
            className="min-h-72 flex-1"
            disabled={props.disabled}
            intakeDescription={`PDF · 1 file · ${(inputSpec.maxBytes ?? 52_428_800) / 1_048_576} MiB max · up to 500 pages`}
            intakeIcon={<Upload aria-hidden="true" />}
            intakeHint="Click to browse, or drop a PDF here"
            intakeTitle={inputSpec.label}
            maxFiles={Number.MAX_SAFE_INTEGER}
            onFiles={addFiles}
            title="Source PDF"
          />
        )}
        {inputIssue && (
          <Alert className="mx-4 mb-3 w-auto" variant="destructive">
            <AlertTitle>PDF not added</AlertTitle>
            <AlertDescription>{inputIssue}</AlertDescription>
          </Alert>
        )}
        {!file && (
          <Caption className="shrink-0 px-4 pb-4 text-muted-foreground">
            Password-protected PDFs are not supported. Remove the password before adding your file.
          </Caption>
        )}
      </div>
      <ToolOptionsPanel
        aria-label={optionsTitle}
        className="min-h-0 shrink-0 p-5 lg:overflow-y-auto max-sm:[&_[data-slot=button]]:!min-h-11 [@media(pointer:coarse)]:[&_[data-slot=button]]:!min-h-11"
        title={optionsTitle}
        variant="plain"
      >
        {renderOptions ? (
          renderOptions(pages)
        ) : (
          <SettingsPanel
            disabled={props.disabled}
            onChange={props.onSettingChange}
            spec={props.spec.settings}
            values={props.settings}
          />
        )}
        {plan.error && (
          <Alert variant="destructive">
            <AlertTitle>Check your settings</AlertTitle>
            <AlertDescription>{plan.error}</AlertDescription>
          </Alert>
        )}
        {!props.running && (!(primaryOutput && completionActions) || props.error || cancelled) && (
          <Button
            className="w-full"
            disabled={Boolean(reason) || props.primaryAction?.disabled}
            onClick={props.primaryAction?.onRun}
          >
            {actionLabel}
          </Button>
        )}
        {props.running && (
          <ProcessingStatus
            title={props.spec.labels.running}
            detail={props.progress?.stage ?? "Preparing the document."}
            action={
              <Button
                onClick={() => {
                  setCancelled(true);
                  props.primaryAction?.onCancel?.();
                }}
                variant="secondary"
              >
                Cancel
              </Button>
            }
          />
        )}
        {primaryOutput ? (
          <DownloadResult
            variant={resultVariant}
            className="min-w-0 [&>div:last-child]:shrink-0"
            title="Your file is ready"
            metadata={
              <span className={resultVariant === "action" ? "block break-words" : "block truncate"}>
                {primaryOutput.name} · {(primaryOutput.size / 1024).toFixed(1)} KiB
              </span>
            }
            action={
              <ArtifactDownloadButton
                file={primaryOutput}
                label={
                  primaryOutput.mime === "application/zip"
                    ? "Download ZIP"
                    : resultVariant === "action" && primaryOutput.mime === "application/pdf"
                      ? "Download PDF"
                      : undefined
                }
              />
            }
          />
        ) : outputs.length > 0 ? (
          <AlertBanner title="Complete" variant="success">
            {pdfCount} {pdfCount === 1 ? "PDF is" : "PDFs are"} ready to download. Your original is unchanged.
          </AlertBanner>
        ) : !reason && !props.result && plan.summary?.detail ? (
          <AlertBanner title={plan.summary.title}>{plan.summary.detail}</AlertBanner>
        ) : null}
        {primaryOutput ? completionActions : secondaryActions}
        {reason && !plan.error && <Muted role="status">{reason}</Muted>}
        {cancelled && !props.running && (
          <Muted role="status">Cancelled. Your PDF and settings are kept. Choose {actionLabel} to try again.</Muted>
        )}
        {props.error && (
          <Alert variant="destructive">
            <AlertTitle>Unable to {actionLabel.toLowerCase()}</AlertTitle>
            <AlertDescription>{props.error} Check the settings and try again, or replace the PDF.</AlertDescription>
          </Alert>
        )}
        {outputs.some((output) => output !== primaryOutput) && (
          <section aria-label={`${props.spec.name} results`} className="grid min-w-0 gap-3 border-t border-border pt-4">
            {outputs
              .filter((output) => output !== primaryOutput)
              .map((output) => (
                <FileQueueItem
                  className="flex-wrap"
                  key={output.id}
                  icon={<FileText aria-hidden="true" />}
                  name={output.name}
                  metadata={`${output.mime === "application/zip" ? "ZIP archive" : "PDF"} · ${(output.size / 1024).toFixed(1)} KiB`}
                  action={<ArtifactDownloadButton file={output} />}
                />
              ))}
          </section>
        )}
      </ToolOptionsPanel>
      <MediaPreview
        open={expanded}
        onOpenChange={setExpanded}
        title={file?.name ?? "Source PDF"}
        description={`Original PDF · Page ${currentPage} of ${pages.length}`}
        viewportClassName="bg-card p-0 text-foreground sm:p-0"
      >
        {viewer(true)}
      </MediaPreview>
    </div>
  );
}
