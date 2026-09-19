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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/index.tsx";
import { Download, FileText, Upload, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";

import { validateFileSelection, workspaceFileId } from "@/components/FileInput";
import { SplitStack, Stack } from "@/components/Stacks";
import { GeneratedPdfPreview } from "@/components/GeneratedPdfPreview";
import { ResultView } from "@/components/ResultView";
import { MediaInputGallery, MediaOutputGallery } from "@/components/MediaOutputGallery";
import { PdfInspectionProvider } from "@/components/PdfPagesSurface";
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

function StoredFileResult({ file }: { readonly file: StoredOutputFile }): ReactElement {
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
            disabled={downloading}
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
 * The worker owns the renderer, so nothing PDF-specific is imported here; the
 * decision to inspect is the spec's, never the tool's identity.
 */
function useInspectedPages(
  spec: ToolSpec,
  runFiles: readonly ToolRunFile[],
  suspended: boolean,
): {
  readonly inspecting: boolean;
  readonly previews: readonly ToolPagePreview[];
  readonly requestThumbnails: (pageNumbers: readonly number[], renderWidth?: number) => void;
} {
  const { closeInspection, inspect, previews, requestThumbnails, reset, state } = useToolRun();
  const key = spec.input.kind === "files" && spec.input.inspect === true ? (spec.toolId.split(".")[1] ?? "") : "";
  const file = runFiles[0];
  // Derived identity again: `runFiles` is a new array on every read.
  const fileKey = file ? `${file.id}:${file.size}:${file.source.lastModified}` : "";

  useEffect(() => {
    if (suspended) {
      closeInspection();
      return;
    }
    if (!key || !file) {
      reset();
      return;
    }
    try {
      inspect({
        key,
        file,
      });
    } catch {
      // An input the protocol rejects outright (an unusable MIME type, say)
      // simply gets no previews. The file stays selected and `validate` still
      // reports why the tool cannot run.
    }
    // `file` is read through `fileKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeInspection, key, fileKey, inspect, reset, suspended]);

  // This hook owns the only job this `useToolRun` ever starts, so a running
  // job here is always the inspection.
  return {
    inspecting: state.status === "running",
    previews,
    requestThumbnails,
  };
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
  const hooks = useToolHooks(props.spec.toolId);
  const filesKey = props.input.files
    .map((file) => `${workspaceFileId(file)}:${file.size}:${file.lastModified}`)
    .join("|");
  const runFiles = useMemo(
    () => props.input.files.map((file) => createToolRunFile(workspaceFileId(file), file)),
    // The selection identity is its stable file metadata, not the parent array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filesKey],
  );
  const { inspecting, previews, requestThumbnails } = useInspectedPages(props.spec, runFiles, props.running ?? false);
  const [inputIssue, setInputIssue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [wasCancelled, setWasCancelled] = useState(false);
  useSettingsHooks(props, hooks, previews, filesKey);
  const fields = Object.values(props.spec.settings.fields);
  const hasSettings = fields.length > 0;
  const hasMainSettings = fields.some((field) => field.pane === "main");
  const hasSideSettings = fields.some((field) => field.pane !== "main");
  const fixedOptions = props.spec.optionsPanel?.collapsible === false;
  const fileInputSpec = props.spec.input.kind === "files" ? props.spec.input : null;
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
      primaryActionInWorkspace: fixedOptions || Boolean(props.running),
    });
    return () => props.onToolbarActionsChange?.(null);
  }, [fixedOptions, props.running, props.onToolbarActionsChange]);

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

  const addFiles = (files: File[]) => {
    if (!fileInputSpec || props.disabled) return;
    const selection = validateFileSelection(props.input.files, files, fileInputSpec);
    setInputIssue(selection.issue);
    props.onInputChange({ ...props.input, files: selection.files });
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
      <ToolActionButton action="upload" disabled={props.disabled} onClick={() => fileInputRef.current?.click()}>
        {fileInputSpec?.multiple ? "Upload" : "Replace"}
      </ToolActionButton>
    </>
  );
  const inputSurface = fileInputSpec ? (
    <Stack
      className={
        hasDetailSurface ? (props.compactFileToolbar ? "shrink-0" : "max-h-60 min-h-32 shrink-0") : "h-full min-h-0"
      }
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
      ) : props.compactFileToolbar && props.input.files.length === 1 ? (
        <div
          aria-label="Source image"
          className="flex min-w-0 flex-wrap items-center gap-3 border-b border-border px-4 py-2"
        >
          <FileThumbnail file={props.input.files[0]} />
          <div className="min-w-0 flex-1 truncate">
            {props.input.files[0].name}{" "}
            <span className="text-muted-foreground">· {formatFileSize(props.input.files[0].size)}</span>
          </div>
          {fileActions}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  tabIndex={props.disabled ? 0 : undefined}
                  aria-label={props.disabled ? "Remove image — wait for processing to finish" : undefined}
                  className="rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Button
                    aria-label={`Remove ${props.input.files[0].name}`}
                    disabled={props.disabled}
                    onClick={() => props.onInputChange({ ...props.input, files: [] })}
                    size="icon"
                    variant="outline"
                  >
                    <X aria-hidden="true" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{props.disabled ? "Wait for processing to finish" : "Remove image"}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
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
              onClick={() =>
                props.onInputChange({
                  ...props.input,
                  files: props.input.files.filter((entry) => entry !== file),
                })
              }
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
  const inputContent = hasDetailSurface ? (
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
  const hasPdfPreview = !props.running && Boolean(outputPdf);
  const hasImageGallery = !props.running && !hasPdfPreview && outputImages.length > 0;
  const resultPreview =
    hasPdfPreview && outputPdf ? (
      <GeneratedPdfPreview
        fill
        definitionKey={props.spec.toolId.split(".")[1] ?? ""}
        file={outputPdf}
        key={outputPdf.id}
      />
    ) : hasImageGallery ? (
      <MediaOutputGallery key={outputImages.map((file) => file.id).join(":")} files={outputImages} />
    ) : null;
  const processingStatus = (
    <ProcessingStatus
      aria-label={
        progress && currentItem !== undefined
          ? `Processing ${progressPercent} percent. Working on item ${currentItem} of ${progress.total}. ${progress.stage}`
          : `${props.spec.labels.running}. Progress is not available.`
      }
      action={
        <Button
          onClick={() => {
            setWasCancelled(true);
            props.primaryAction?.onCancel?.();
          }}
          type="button"
          variant="secondary"
        >
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
      className="h-full"
      contentClassName={
        hasImageGallery || hasPdfPreview
          ? "min-h-0 overflow-hidden gap-0"
          : `overflow-y-auto [&>*]:shrink-0 ${resultPreview ? "gap-0" : "gap-4 p-4"} ${props.running || (props.result?.render === "files" && !resultPreview) ? "[&>:first-child]:mt-auto" : !props.result ? "justify-center" : ""}`
      }
      purpose="result"
      id={outputId}
      state={props.error ? "error" : "ready"}
      stateDescription={props.error}
      stateTitle="Unable to create the result"
      scroll="none"
      title="Processed output"
    >
      {hasPdfPreview && resultPreview ? <div className="min-h-0 flex-1">{resultPreview}</div> : resultPreview}
      {props.running ? (
        processingStatus
      ) : props.result?.render === "files" ? (
        <div className={`grid min-w-0 shrink-0 gap-3 ${hasPdfPreview ? "px-4 pb-4" : resultPreview ? "p-4" : ""}`}>
          {props.result.files
            .filter((file) => !hasImageGallery || !outputImages.includes(file))
            .map((file) => (
              <StoredFileResult file={file} key={`${file.name}-${file.size}`} />
            ))}
        </div>
      ) : props.result ? (
        <>
          <DownloadResult metadata={props.spec.labels.ready} title="Processing complete" />
          <ResultView result={props.result} />
        </>
      ) : (
        <ContentState
          state={wasCancelled ? "cancelled" : "waiting"}
          className="rounded-none border-0 bg-transparent"
          description={wasCancelled ? "Your input files are unchanged. Run again when ready." : props.spec.labels.empty}
          icon={<FileText aria-hidden="true" />}
          title={wasCancelled ? "Processing cancelled" : "Result will appear here"}
        />
      )}
    </WorkspaceSurface>
  );
  const resultContent = (
    <Stack
      className={
        hasPdfPreview ? "h-full max-[64rem]:h-[32rem]" : hasImageGallery ? "h-full max-[1025px]:h-[26rem]" : "h-full"
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
        className="h-full"
        defaultSize={hasSettings ? (hasEmptyFileQueue ? 48 : 52) : 50}
        key={hasEmptyFileQueue ? "empty-file-queue" : "input"}
        minSize={30}
        secondaryHidden={!props.result}
      >
        <Stack className="h-full">
          <div className="min-h-0 flex-1">{inputContent}</div>
          {validationAlert}
          {!fixedOptions && !props.result && props.running ? (
            <div className="shrink-0 border-t border-border p-4">{processingStatus}</div>
          ) : null}
          {!props.result && props.error ? (
            <Alert className="m-3 shrink-0" variant="destructive">
              <AlertTitle>Unable to create the result</AlertTitle>
              <AlertDescription>{props.error} Check your input and try again.</AlertDescription>
            </Alert>
          ) : null}
          {!props.result && wasCancelled && !props.running ? (
            <Muted className="shrink-0 p-4" role="status">
              Processing cancelled. Your input files are unchanged. Run again when ready.
            </Muted>
          ) : null}
        </Stack>
        {props.result ? resultContent : null}
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
    <SplitStack
      className="h-full"
      collapseLabel="settings panel"
      collapseSide="secondary"
      collapsible
      defaultCollapsed={props.spec.optionsPanel?.defaultCollapsed === false ? undefined : "secondary"}
      defaultSize={75}
      minSize={75}
    >
      {mainContent}
      {settingsContent}
    </SplitStack>
  );
}
