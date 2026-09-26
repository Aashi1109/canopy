"use client";

import {
  Muted,
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  ToolActionButton,
  DownloadResult,
  ContentState,
  ProcessingStatus,
  ToolOptionsPanel,
  FileChip,
  MediaPreview,
  PdfViewer,
  WorkspacePanelHeader,
  toast,
} from "@/components/ui/index.tsx";
import { Download, FileText, Upload, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";

import { validateFileSelection, workspaceFileId } from "@/components/FileInput";
import { SettingsStack, SplitStack, Stack } from "@/components/Stacks";
import { GeneratedPdfPreview } from "@/components/GeneratedPdfPreview";
import { ArtifactDownloadButton } from "@/components/ArtifactDownloadButton";
import { ResultView } from "@/components/ResultView";
import { MediaInputGallery, MediaOutputGallery } from "@/components/MediaOutputGallery";
import { PdfInspectionProvider, PdfPreviewPage, usePdfPageImages } from "@/components/PdfPagesSurface";
import { FileIntakeSurface, FileQueueSurface, WorkspaceSurface } from "@/components/Surfaces";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import { WorkspaceInputSurface } from "@/components/WorkspaceInput";
import { SettingsPanel } from "@/components/SettingsPanel";
import { loadToolHooks } from "@/lib/tool-framework/hooks";
import { readArtifact } from "@/lib/tool-framework/artifacts";
import type { ToolHooks, ToolPagePreview, ToolRunFile } from "@/lib/tool-framework/run";
import { parseSettings } from "@/lib/tool-framework/settings";
import type { ToolSpec } from "@/lib/tool-framework/spec";
import { useToolRun } from "@/lib/tool-framework/useToolRun";
import { createToolRunFile } from "@/lib/tool-framework/workerProtocol";

type Hooks = ToolHooks<Record<string, unknown>>;

const NO_HOOKS: Hooks = {};
const NO_PREVIEWS: readonly ToolPagePreview[] = [];

function formatFileSize(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1_000)), units.length);
  const value = bytes / 1_000 ** unit;
  return `${value.toFixed(1).replace(/\.0$/, "")} ${units[unit - 1]}`;
}

function FileThumbnail({ file }: { file: File }): ReactElement {
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    setFailed(false);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url && !failed ? (
    <img
      alt=""
      className="size-10 rounded-lg object-contain"
      decoding="async"
      loading="lazy"
      onError={() => setFailed(true)}
      src={url}
    />
  ) : (
    <FileText aria-hidden="true" />
  );
}

async function downloadStoredFile(
  artifact: Extract<NonNullable<WorkspaceProps["result"]>, { render: "files" }>["files"][number],
): Promise<void> {
  const file = await readArtifact(artifact);
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.download = artifact.name;
  link.href = url;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

type StoredOutputFile = Extract<NonNullable<WorkspaceProps["result"]>, { render: "files" }>["files"][number];

function StoredFileResult({ file, disabled }: { readonly file: StoredOutputFile; disabled?: boolean }): ReactElement {
  const [downloadFailed, setDownloadFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    setDownloadFailed(false);
    setDownloading(true);
    try {
      await downloadStoredFile(file);
    } catch {
      setDownloadFailed(true);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="grid min-w-0 gap-2">
      <DownloadResult
        action={
          <Button
            className="max-sm:w-full max-sm:!min-h-11 [@media(pointer:coarse)]:!min-h-11"
            disabled={disabled || downloading}
            onClick={() => void download()}
            size="xs"
            type="button"
          >
            <Download aria-hidden="true" />
            {downloadFailed
              ? "Retry download"
              : downloading
                ? "Preparing…"
                : file.mime === "application/zip"
                  ? "Download ZIP"
                  : "Download file"}
          </Button>
        }
        className="min-w-0 flex-wrap [&_p]:truncate [&>div:nth-child(2)]:basis-40"
        metadata={`${file.name} · ${formatFileSize(file.size)}`}
        title="Your file is ready"
      />
      {downloadFailed ? (
        <Alert variant="destructive">
          <AlertTitle>Download unavailable</AlertTitle>
          <AlertDescription>
            The browser could not reopen this stored output. Retry the download, or run the tool again if the file was
            cleared from browser storage.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

/**
 * Loads the tool's own hooks. Nothing here reaches into `tools/` by name —
 * `loadToolHooks` resolves the folder from the toolId.
 */
function useToolHooks(toolId: string): Hooks {
  const [hooks, setHooks] = useState<Hooks>(NO_HOOKS);
  useEffect(() => {
    let current = true;
    void loadToolHooks(toolId).then((loaded) => {
      if (current) setHooks(loaded);
    });
    return () => {
      current = false;
    };
  }, [toolId]);
  return hooks;
}

/**
 * Renders page previews for the tools whose spec declares `input.inspect`.
 *
 * The worker owns rendering; the spec decides whether inspection is needed.
 */
function useInspectedPages(
  spec: ToolSpec,
  runFiles: readonly ToolRunFile[],
  suspended: boolean,
): {
  readonly inspecting: boolean;
  readonly error: string | undefined;
  readonly retry: () => void;
  readonly previews: readonly ToolPagePreview[];
  readonly requestThumbnails: (pageNumbers: readonly number[], renderWidth?: number) => void;
} {
  const { closeInspection, inspect, previews, requestThumbnails, reset, state } = useToolRun();
  const key = spec.input.kind === "files" && spec.input.inspect === true ? (spec.toolId.split(".")[1] ?? "") : "";
  const file = runFiles[0];
  // Derived identity again: `runFiles` is a new array on every read.
  const fileKey = file ? `${file.id}:${file.size}:${file.source.lastModified}` : "";
  const [inspectedKey, setInspectedKey] = useState("");
  const [failure, setFailure] = useState("");
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (suspended) {
      closeInspection();
      return;
    }
    if (!key || !file) {
      reset();
      return;
    }
    setInspectedKey(fileKey);
    setFailure("");
    try {
      inspect({
        key,
        file,
      });
    } catch (error) {
      reset();
      setFailure(error instanceof Error ? error.message : "This PDF could not be opened.");
    }
    // `file` is read through `fileKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeInspection, key, fileKey, inspect, reset, suspended, attempt]);

  // This hook owns the only job this `useToolRun` ever starts, so a running
  // job here is always the inspection.
  return {
    inspecting: state.status === "running",
    error: inspectedKey === fileKey ? failure || state.error?.message : undefined,
    retry,
    previews: inspectedKey === fileKey ? previews : NO_PREVIEWS,
    requestThumbnails,
  };
}

function SourcePdfPreview({
  file,
  previews,
  requestThumbnails,
  error,
  onRetry,
}: {
  file: File;
  previews: readonly ToolPagePreview[];
  requestThumbnails: (pageNumbers: readonly number[], renderWidth?: number) => void;
  error?: string;
  onRetry: () => void;
}) {
  const pages = usePdfPageImages(previews);
  const [currentPage, setCurrentPage] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const viewer = (fullScreen: boolean) => (
    <PdfViewer
      className="h-full min-w-0 w-full"
      currentPage={currentPage}
      fileName={file.name}
      fit="page"
      onExpand={fullScreen ? undefined : () => setExpanded(true)}
      onPageChange={setCurrentPage}
      outline={pages.map((page) => ({
        id: `page-${page.pageNumber}`,
        title: `Page ${page.pageNumber}`,
        page: page.pageNumber,
      }))}
      pageCount={pages.length}
      pages={pages.map((page) => ({
        pageNumber: page.pageNumber,
        width: page.pageWidth,
        height: page.pageHeight,
        content: (
          <PdfPreviewPage
            active={fullScreen || !expanded}
            alt={`Source PDF page ${page.pageNumber}`}
            page={page}
            requestThumbnails={requestThumbnails}
          />
        ),
      }))}
    />
  );
  return (
    <WorkspaceSurface
      className="min-h-0 flex-1"
      contentClassName="min-h-0 flex-1 gap-0"
      header="sr-only"
      purpose="preview"
      scroll="none"
      state={error ? "error" : pages.length ? "ready" : "loading"}
      stateAction={
        error ? (
          <Button onClick={onRetry} variant="outline">
            Retry preview
          </Button>
        ) : undefined
      }
      stateDescription={error ? `${error} Retry the preview or upload a different PDF.` : undefined}
      stateTitle={error ? "Preview unavailable" : "Opening PDF…"}
      title="Source PDF preview"
    >
      {viewer(false)}
      <MediaPreview
        open={expanded}
        onOpenChange={setExpanded}
        title={file.name}
        description={`Source PDF · Page ${currentPage} of ${pages.length}`}
        viewportClassName="bg-card p-0 text-foreground sm:p-0"
      >
        {viewer(true)}
      </MediaPreview>
    </WorkspaceSurface>
  );
}

function sameSetting(current: unknown, next: unknown): boolean {
  if (Object.is(current, next)) return true;
  return (
    Array.isArray(current) &&
    Array.isArray(next) &&
    current.length === next.length &&
    current.every((entry, index) => Object.is(entry, next[index]))
  );
}

/**
 * Pushes a hook's patch through the ordinary settings path, skipping any value
 * that is already what the hook asks for. That skip is what makes an idempotent
 * hook settle: applying a patch re-renders, which re-runs the hook, and only an
 * actual change keeps the cycle going.
 */
function applySettingsPatch(props: WorkspaceProps, patch: Readonly<Record<string, unknown>>): void {
  for (const [key, value] of Object.entries(patch)) {
    const current = Object.hasOwn(props.settings, key) ? props.settings[key] : undefined;
    if (!sameSetting(current, value)) props.onSettingChange(key, value);
  }
}

/**
 * Applies the two settings-shaped hooks: `onPagesInspected` seeds from a fresh
 * inspection, `onSettingsChanged` re-derives whenever an edit lands while
 * previews exist.
 */
function useSettingsHooks(
  props: WorkspaceProps,
  hooks: Hooks,
  previews: readonly ToolPagePreview[],
  filesKey: string,
): void {
  const seeded = useRef<{ hooks: Hooks; filesKey: string; previewsKey: string } | null>(null);
  const previewsKey = previews
    .map(({ pageNumber, pageWidth, pageHeight }) => [pageNumber, pageWidth, pageHeight].join(":"))
    .join("|");
  // Value identity, not object identity: the settings object is rebuilt on
  // every edit, and only the values decide whether a hook has more to say.
  const settingsKey = JSON.stringify(props.settings);

  useEffect(() => {
    if (previews.length === 0) return;
    if (
      seeded.current?.hooks === hooks &&
      seeded.current.filesKey === filesKey &&
      seeded.current.previewsKey === previewsKey
    )
      return;
    // Reopening the same source after processing must preserve the user's edits.
    seeded.current = { hooks, filesKey, previewsKey };
    applySettingsPatch(props, hooks.onPagesInspected?.(previews) ?? {});
    // Seeding is a reaction to a new inspection only — re-running it on a
    // settings edit would overwrite the edit that triggered it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hooks, previewsKey, filesKey]);

  useEffect(() => {
    if (previews.length === 0) return;
    applySettingsPatch(
      props,
      hooks.onSettingsChanged?.(parseSettings(props.spec.settings, props.settings), previews) ?? {},
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hooks, previewsKey, settingsKey]);
}

/** What a tool's own detail surface is given. */
export interface FileProcessorDetail {
  readonly disabled: boolean;
  readonly inspecting: boolean;
  readonly previews: readonly ToolPagePreview[];
}

export interface FileProcessorWorkspaceProps extends WorkspaceProps {
  /**
   * A surface the tool renders below its file intake — a page picker, a crop
   * frame, a preview. It must return an element rather than call hooks itself:
   * this is invoked during render, so any state belongs to the element.
   */
  detail?: (state: FileProcessorDetail) => ReactNode;
  /** Shows the reorderable file list, for tools where file order is input. */
  orderFiles?: boolean;
  /** A single-file editor can keep intake metadata and recovery in one row. */
  compactFileToolbar?: boolean;
  /** Tool-owned option controls inside the existing settings boundary. */
  renderOptions?: () => ReactNode;
}

export function FileProcessorWorkspace(props: FileProcessorWorkspaceProps) {
  const outputId = useId();
  const persistentOutput = props.spec.app === "media";
  const hooks = useToolHooks(props.spec.toolId);
  const fileInputSpec = props.spec.input.kind === "files" ? props.spec.input : null;
  const hasSourcePdfPreview =
    fileInputSpec?.engine === "pdf" &&
    fileInputSpec.inspect === true &&
    !fileInputSpec.multiple &&
    !props.detail &&
    props.input.files.length === 1;
  const filesKey = props.input.files
    .map((file) => `${workspaceFileId(file)}:${file.size}:${file.lastModified}`)
    .join("|");
  const runFiles = useMemo(
    () => props.input.files.map((file) => createToolRunFile(workspaceFileId(file), file)),
    // The selection identity is its stable file metadata, not the parent array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filesKey],
  );
  const {
    inspecting,
    previews,
    requestThumbnails,
    error: previewError,
    retry: retryPreview,
  } = useInspectedPages(props.spec, runFiles, Boolean(props.running) && !hasSourcePdfPreview);
  const [inputIssue, setInputIssue] = useState("");
  const [pastePending, setPastePending] = useState(false);
  const pasteRequest = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [wasCancelled, setWasCancelled] = useState(false);
  const cancelRun = props.primaryAction?.onCancel;
  const cancel = useCallback(() => {
    setWasCancelled(true);
    cancelRun?.();
  }, [cancelRun]);
  useSettingsHooks(props, hooks, previews, filesKey);
  const fields = Object.values(props.spec.settings.fields);
  const hasSettings = fields.length > 0;
  const hasMainSettings = fields.some((field) => field.pane === "main");
  const hasSideSettings = fields.some((field) => field.pane !== "main");
  const fixedOptions = !persistentOutput && props.spec.optionsPanel?.collapsible === false;
  const canPasteImages = fileInputSpec?.engine === "image";
  const hasEmptyFileQueue = fileInputSpec !== null && props.input.files.length === 0;
  const hasDetailSurface = Boolean(props.detail) && !hasEmptyFileQueue;
  const workspaceStateKey = JSON.stringify([
    props.input.files.map((file) => workspaceFileId(file)),
    props.input.secondary,
    props.input.text,
    props.settings,
  ]);
  const previousWorkspaceStateKey = useRef(workspaceStateKey);
  const progress =
    props.progress &&
    Number.isFinite(props.progress.completed) &&
    Number.isFinite(props.progress.total) &&
    props.progress.total > 0
      ? props.progress
      : null;
  const progressPercent = progress
    ? Math.max(0, Math.min(100, Math.round((progress.completed / progress.total) * 100)))
    : undefined;
  const currentItem = progress ? Math.min(Math.max(progress.completed + 1, 1), progress.total) : undefined;

  const reason = hooks.validate?.(parseSettings(props.spec.settings, props.settings), runFiles) ?? null;
  const onValidationChange = props.onValidationChange;

  useEffect(() => {
    onValidationChange?.(reason);
  }, [onValidationChange, reason]);

  useEffect(() => {
    props.onToolbarActionsChange?.({
      primaryActionInWorkspace: fixedOptions || (!persistentOutput && Boolean(props.running)),
      onCancel: cancelRun ? cancel : undefined,
    });
    return () => props.onToolbarActionsChange?.(null);
  }, [cancel, cancelRun, fixedOptions, persistentOutput, props.running, props.onToolbarActionsChange]);

  useEffect(() => {
    if (props.result && window.matchMedia("(max-width: 64rem)").matches) {
      const frame = requestAnimationFrame(() => document.getElementById(outputId)?.scrollIntoView({ block: "start" }));
      return () => cancelAnimationFrame(frame);
    }
  }, [props.result, outputId]);

  useEffect(() => {
    if (props.running) setWasCancelled(false);
  }, [props.running]);

  useEffect(() => {
    if (previousWorkspaceStateKey.current === workspaceStateKey) return;
    previousWorkspaceStateKey.current = workspaceStateKey;
    setWasCancelled(false);
  }, [workspaceStateKey]);

  useEffect(
    () => () => {
      pasteRequest.current += 1;
    },
    [props.input, props.disabled, props.running],
  );

  const addFiles = (files: File[]) => {
    if (!fileInputSpec || props.disabled) return;
    const selection = validateFileSelection(props.input.files, files, fileInputSpec);
    setInputIssue(selection.issue);
    props.onInputChange({ ...props.input, files: selection.files });
  };
  const pasteImages = async () => {
    if (!canPasteImages || props.disabled || props.running || pastePending) return;
    if (typeof navigator.clipboard?.read !== "function") {
      toast.error("Clipboard access is unavailable. Paste with Ctrl+V / ⌘V in the image area, or use Upload.");
      return;
    }
    const request = ++pasteRequest.current;
    setPastePending(true);
    try {
      const items = await navigator.clipboard.read();
      const images = await Promise.all(
        items.map(async (item, index) => {
          const type = item.types.find((value) => value.startsWith("image/"));
          if (!type) return null;
          const blob = await item.getType(type);
          const extension = type === "image/jpeg" ? "jpg" : type.slice(6).split("+")[0];
          return new File([blob], `pasted-image-${props.input.files.length + index + 1}.${extension}`, { type });
        }),
      );
      if (request !== pasteRequest.current) return;
      const files = images.filter((file): file is File => file !== null);
      if (files.length === 0) {
        toast.error("No image found in the clipboard. Copy an image, then try Paste again, or use Upload.");
        return;
      }
      addFiles(files);
    } catch {
      if (request === pasteRequest.current) {
        toast.error("Could not read the clipboard. Paste with Ctrl+V / ⌘V in the image area, or use Upload.");
      }
    } finally {
      setPastePending(false);
    }
  };
  const fileActions = (
    <>
      <input
        accept={fileInputSpec?.accept}
        className="sr-only"
        disabled={props.disabled}
        multiple={fileInputSpec?.multiple}
        onChange={(event) => {
          if (event.currentTarget.files) addFiles(Array.from(event.currentTarget.files));
          event.currentTarget.value = "";
        }}
        ref={fileInputRef}
        tabIndex={-1}
        type="file"
      />
      {canPasteImages && (
        <ToolActionButton
          action="paste"
          disabled={props.disabled || props.running || pastePending}
          loading={pastePending}
          onClick={() => void pasteImages()}
        >
          {pastePending ? "Pasting…" : "Paste"}
        </ToolActionButton>
      )}
      <ToolActionButton action="upload" disabled={props.disabled} onClick={() => fileInputRef.current?.click()}>
        Upload
      </ToolActionButton>
    </>
  );
  const inputSurface = fileInputSpec ? (
    <Stack
      className={
        hasSourcePdfPreview
          ? "shrink-0"
          : hasDetailSurface
            ? props.compactFileToolbar
              ? "shrink-0"
              : "max-h-60 min-h-32 shrink-0"
            : "h-full min-h-0"
      }
      onPaste={(event) => {
        if (!canPasteImages || props.disabled || props.running || pastePending) return;
        const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
        if (!files.length) return;
        event.preventDefault();
        addFiles(files);
      }}
      onDragOver={(event) => {
        if (!hasEmptyFileQueue && !props.disabled && Array.from(event.dataTransfer.types).includes("Files")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(event) => {
        if (hasEmptyFileQueue || props.disabled || !event.dataTransfer.files.length) return;
        event.preventDefault();
        addFiles(Array.from(event.dataTransfer.files));
      }}
    >
      {hasEmptyFileQueue ? (
        <FileIntakeSurface
          accept={fileInputSpec.accept}
          actions={canPasteImages ? fileActions : undefined}
          className="min-h-64 flex-1"
          disabled={props.disabled}
          intakeDescription={fileInputSpec.dropzoneDescription}
          intakeIcon={<Upload aria-hidden="true" />}
          intakeTitle={fileInputSpec.label}
          maxFiles={Number.MAX_SAFE_INTEGER}
          multiple={fileInputSpec.multiple}
          onFiles={addFiles}
          title="Input files"
        />
      ) : (props.compactFileToolbar || hasSourcePdfPreview) && props.input.files.length === 1 ? (
        <WorkspacePanelHeader
          aria-label={fileInputSpec.engine === "pdf" ? "Source PDF" : "Source image"}
          actions={fileActions}
        >
          <FileChip
            file={props.input.files[0]}
            disabled={props.disabled}
            onRemove={() => {
              if (props.disabled) return;
              setInputIssue("");
              props.onInputChange({ ...props.input, files: [] });
            }}
          />
        </WorkspacePanelHeader>
      ) : fileInputSpec.engine === "image" && !props.detail ? (
        <WorkspaceSurface
          title="Image selection"
          header="sr-only"
          className="min-h-0 flex-1"
          contentClassName="gap-0"
          scroll="none"
        >
          <MediaInputGallery
            actions={fileActions}
            files={props.input.files}
            disabled={props.disabled}
            onReorder={props.orderFiles ? (files) => props.onInputChange({ ...props.input, files }) : undefined}
            onRemove={(file) => {
              if (props.disabled) return;
              setInputIssue("");
              props.onInputChange({
                ...props.input,
                files: props.input.files.filter((entry) => entry !== file),
              });
            }}
          />
        </WorkspaceSurface>
      ) : (
        <FileQueueSurface
          actions={fileActions}
          className="min-h-0 flex-1"
          description={props.orderFiles ? "Drag to reorder. Files are processed from top to bottom." : undefined}
          disabled={props.disabled}
          getIcon={(file) => <FileThumbnail file={file} />}
          getId={workspaceFileId}
          getMetadata={(file) => formatFileSize(file.size)}
          getName={(file) => file.name}
          items={props.input.files}
          onReorder={props.orderFiles ? (files) => props.onInputChange({ ...props.input, files }) : undefined}
          renderAction={(file) => (
            <Button
              aria-label={`Remove ${file.name}`}
              disabled={props.disabled}
              onClick={() => {
                if (props.disabled) return;
                setInputIssue("");
                props.onInputChange({
                  ...props.input,
                  files: props.input.files.filter((entry) => entry !== file),
                });
              }}
              size="icon"
              variant="outline"
            >
              <X aria-hidden="true" />
            </Button>
          )}
          title="Selected files"
        />
      )}
      {inputIssue ? (
        <Alert className="m-3" variant="destructive">
          <AlertTitle>Some files were not added</AlertTitle>
          <AlertDescription>{inputIssue}</AlertDescription>
        </Alert>
      ) : null}
    </Stack>
  ) : (
    <WorkspaceInputSurface
      disabled={props.disabled}
      input={props.input}
      inputSpec={props.spec.input}
      onInputChange={props.onInputChange}
    />
  );
  const inputContent = hasSourcePdfPreview ? (
    <Stack className="h-full min-h-0 max-[1025px]:h-[28rem]">
      {inputSurface}
      <SourcePdfPreview
        key={filesKey}
        file={props.input.files[0]}
        previews={previews}
        requestThumbnails={requestThumbnails}
        error={previewError}
        onRetry={retryPreview}
      />
    </Stack>
  ) : hasDetailSurface ? (
    <Stack className="h-full overflow-y-auto max-[1025px]:h-[28rem]">
      {inputSurface}
      <Stack className="min-h-[46px] flex-1 [&>*]:h-full [&>section>div]:overflow-y-auto [&>section>header_p]:overflow-visible [&>section>header_p]:text-clip [&>section>header_p]:whitespace-normal [&_[data-surface-state]]:min-h-0">
        <PdfInspectionProvider requestThumbnails={requestThumbnails}>
          {props.detail?.({ disabled: props.disabled ?? false, inspecting, previews })}
        </PdfInspectionProvider>
      </Stack>
    </Stack>
  ) : (
    inputSurface
  );
  const validationAlert =
    reason && !hasEmptyFileQueue ? (
      <Alert className="m-3" variant="destructive">
        <AlertTitle>This tool cannot run yet</AlertTitle>
        <AlertDescription>{reason}</AlertDescription>
      </Alert>
    ) : null;
  const outputImages = useMemo(
    () =>
      props.result?.render === "files"
        ? props.result.files.filter((file) => /^image\/(jpeg|png|webp|gif|avif|bmp)$/.test(file.mime))
        : [],
    [props.result],
  );
  const pdfOutputs =
    props.result?.render === "files" ? props.result.files.filter((file) => file.mime === "application/pdf") : [];
  const outputPdf = pdfOutputs.length === 1 ? pdfOutputs[0] : undefined;
  const outputFiles = props.result?.render === "files" ? props.result.files : [];
  const primaryOutput =
    outputFiles.find((file) => file.mime === "application/zip") ??
    (outputFiles.length === 1 ? outputFiles[0] : undefined);
  const hasPdfPreview = Boolean(outputPdf);
  const hasImageGallery = !hasPdfPreview && outputImages.length > 0;
  const additionalOutputs = outputFiles.filter(
    (file) => file !== primaryOutput && (!hasImageGallery || !outputImages.includes(file)),
  );
  const resultPreview =
    hasPdfPreview && outputPdf ? (
      <GeneratedPdfPreview
        fill
        definitionKey={props.spec.toolId.split(".")[1] ?? ""}
        file={outputPdf}
        key={outputPdf.id}
      />
    ) : hasImageGallery ? (
      <MediaOutputGallery
        key={outputImages.map((file) => file.id).join(":")}
        files={outputImages}
        header="sr-only"
        disabled={props.running}
        primaryOutputId={primaryOutput?.id}
      />
    ) : null;
  const processingStatus = (
    <ProcessingStatus
      aria-label={
        progress && currentItem !== undefined
          ? `Processing ${progressPercent} percent. Working on item ${currentItem} of ${progress.total}. ${progress.stage}`
          : `${props.spec.labels.running}. Progress is not available.`
      }
      action={
        <Button onClick={cancel} type="button" variant="secondary">
          Cancel
        </Button>
      }
      detail={
        progress && currentItem !== undefined
          ? `Working on item ${currentItem} of ${progress.total} · ${progress.stage}`
          : "Preparing the first item."
      }
      progress={progressPercent}
      title={progressPercent === undefined ? props.spec.labels.running : `Processing · ${progressPercent}%`}
    />
  );
  const settingsSurface = (
    <ToolOptionsPanel
      aria-label="Options"
      className="h-full overflow-y-auto bg-card p-[22px] max-sm:[&_[data-slot=button]]:!min-h-11 [@media(pointer:coarse)]:[&_[data-slot=button]]:!min-h-11"
      title="Options"
      variant="plain"
    >
      {props.renderOptions ? (
        props.renderOptions()
      ) : hasSideSettings ? (
        <SettingsPanel
          className={props.spec.optionsPanel?.layout === "grid" ? "grid-cols-2" : undefined}
          disabled={props.disabled}
          layout={props.spec.optionsPanel?.layout}
          onChange={props.onSettingChange}
          pane="side"
          spec={props.spec.settings}
          values={props.settings}
        />
      ) : null}
      {fixedOptions &&
        (props.running ? (
          processingStatus
        ) : (
          <Button
            className="w-full"
            disabled={props.disabled || props.primaryAction?.disabled}
            onClick={props.primaryAction?.onRun}
          >
            {props.primaryAction?.label ?? "Run"}
          </Button>
        ))}
    </ToolOptionsPanel>
  );
  const resultSurface = (
    <WorkspaceSurface
      actions={
        primaryOutput ? (
          <ArtifactDownloadButton
            key={primaryOutput.id}
            file={primaryOutput}
            disabled={props.running}
            label={primaryOutput.mime === "application/zip" ? "Download ZIP" : "Download"}
            variant="toolbar"
          />
        ) : (
          <ToolActionButton action="download" disabled>
            Download
          </ToolActionButton>
        )
      }
      className="h-full"
      contentClassName={
        hasImageGallery || hasPdfPreview
          ? "min-h-0 overflow-hidden gap-0"
          : `overflow-y-auto [&>*]:shrink-0 ${resultPreview ? "gap-0" : "gap-4 p-4"} ${!props.result ? "justify-center" : ""}`
      }
      purpose="result"
      meta={props.running ? "Processing…" : primaryOutput ? formatFileSize(primaryOutput.size) : undefined}
      id={outputId}
      state={props.error && !props.result ? "error" : "ready"}
      stateDescription={props.error ? `${props.error} Check your input and try again.` : undefined}
      stateTitle="Unable to create the result"
      scroll="none"
      title="Processed output"
    >
      {props.running ? <div className="shrink-0 p-4">{processingStatus}</div> : null}
      {props.result && props.error ? (
        <Muted className="shrink-0 px-4 pt-4" role="status">
          The update failed. Your previous output is still available. Check the settings and try again.
        </Muted>
      ) : null}
      {props.result && wasCancelled && !props.running ? (
        <Muted className="shrink-0 px-4 pt-4" role="status">
          Update cancelled. Your previous output is still available. Run again when ready.
        </Muted>
      ) : null}
      {hasPdfPreview && resultPreview ? <div className="min-h-0 flex-1">{resultPreview}</div> : resultPreview}
      {props.result?.render === "files" && (additionalOutputs.length > 0 || (primaryOutput && !resultPreview)) ? (
        <div className={`grid min-w-0 shrink-0 gap-3 ${hasPdfPreview ? "px-4 pb-4" : resultPreview ? "p-4" : ""}`}>
          {additionalOutputs.map((file) => (
            <StoredFileResult file={file} disabled={props.running} key={`${file.name}-${file.size}`} />
          ))}
          {primaryOutput && !resultPreview ? (
            <div className="min-w-0" role="status">
              <p className="font-semibold">Your file is ready</p>
              <Muted className="break-all">
                {primaryOutput.name} · {formatFileSize(primaryOutput.size)}
              </Muted>
            </div>
          ) : null}
        </div>
      ) : props.result && props.result.render !== "files" ? (
        <>
          <DownloadResult metadata={props.spec.labels.ready} title="Processing complete" />
          <ResultView result={props.result} />
        </>
      ) : !props.result && !props.running ? (
        <ContentState
          state={wasCancelled ? "cancelled" : "waiting"}
          className="rounded-none border-0 bg-transparent"
          description={wasCancelled ? "Your input files are unchanged. Run again when ready." : props.spec.labels.empty}
          icon={<FileText aria-hidden="true" />}
          title={wasCancelled ? "Processing cancelled" : "Result will appear here"}
        />
      ) : null}
    </WorkspaceSurface>
  );
  const resultContent = (
    <Stack
      className={
        persistentOutput || hasPdfPreview
          ? "h-full max-[64rem]:h-[32rem]"
          : hasImageGallery
            ? "h-full max-[1025px]:h-[26rem]"
            : "h-full"
      }
    >
      {props.spec.input.kind === "none" ? validationAlert : null}
      {resultSurface}
    </Stack>
  );
  const settingsContent = (
    <Stack className="h-full">
      <Stack className="min-h-0 flex-1 [&>*]:h-full">{settingsSurface}</Stack>
    </Stack>
  );
  const primaryContent =
    props.spec.input.kind === "none" ? (
      resultContent
    ) : (
      <SplitStack
        presentation={persistentOutput || Boolean(props.result)}
        className="h-full"
        defaultSize={persistentOutput ? 50 : hasSettings ? (hasEmptyFileQueue ? 48 : 52) : 50}
        key={persistentOutput ? "media-workspace" : hasEmptyFileQueue ? "empty-file-queue" : "input"}
        minSize={30}
        secondaryHidden={persistentOutput ? undefined : !props.result}
      >
        <Stack className="h-full">
          <div className="min-h-0 flex-1">{inputContent}</div>
          {validationAlert}
          {!persistentOutput && !fixedOptions && !props.result && props.running ? (
            <div className="shrink-0 border-t border-border p-4">{processingStatus}</div>
          ) : null}
          {!persistentOutput && !props.result && props.error ? (
            <Alert className="m-3 shrink-0" variant="destructive">
              <AlertTitle>Unable to create the result</AlertTitle>
              <AlertDescription>{props.error} Check your input and try again.</AlertDescription>
            </Alert>
          ) : null}
          {!persistentOutput && !props.result && wasCancelled && !props.running ? (
            <Muted className="shrink-0 p-4" role="status">
              Processing cancelled. Your input files are unchanged. Run again when ready.
            </Muted>
          ) : null}
        </Stack>
        {persistentOutput || props.result ? resultContent : null}
      </SplitStack>
    );
  const mainContent = hasMainSettings ? (
    <div className="flex h-full min-h-0 flex-col">
      <SettingsPanel
        className="shrink-0 border-b border-border p-4"
        disabled={props.disabled}
        layout="grid"
        onChange={props.onSettingChange}
        pane="main"
        spec={props.spec.settings}
        values={props.settings}
      />
      <div className="min-h-0 flex-1">{primaryContent}</div>
    </div>
  ) : (
    primaryContent
  );

  if (!hasSideSettings && !fixedOptions) return mainContent;
  if (fixedOptions) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(20rem,30%)] lg:overflow-hidden">
        <div className="min-h-0 min-w-0 shrink-0 border-b border-border lg:border-r lg:border-b-0">{mainContent}</div>
        <div className="min-h-0 min-w-0 shrink-0">{settingsContent}</div>
      </div>
    );
  }

  return (
    <SettingsStack
      className="h-full"
      defaultCollapsed={props.spec.optionsPanel?.defaultCollapsed === false ? undefined : "secondary"}
      defaultSize={75}
      minSize={75}
    >
      {mainContent}
      {settingsContent}
    </SettingsStack>
  );
}
