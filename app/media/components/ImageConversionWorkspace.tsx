"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Caption,
  DownloadResult,
  Muted,
  ProcessingStatus,
  ToolOptionsPanel,
  FieldLabel,
  Select,
} from "@canopy/ui";
import { Download, Plus, ShieldCheck, Upload } from "lucide-react";

import { IMAGE_OUTPUT_KEY, resolveImageConversion } from "@/app/media/lib/imageConversion";
import { useFileDownload } from "@/components/ArtifactDownloadButton";
import { validateFileSelection } from "@/components/FileInput";
import { MediaInputGallery, MediaOutputGallery } from "@/components/MediaOutputGallery";
import { SettingsPanel } from "@/components/SettingsPanel";
import { FileIntakeSurface, WorkspaceSurface } from "@/components/Surfaces";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import type { StoredToolArtifact } from "@/lib/tool-framework/artifacts";
import type { SettingsSpec } from "@/lib/tool-framework/settings";

function sizeLabel(bytes: number) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1_048_576
      ? `${(bytes / 1024).toFixed(1)} KiB`
      : `${(bytes / 1_048_576).toFixed(1)} MiB`;
}

function ConversionDownload({ file }: { file: StoredToolArtifact }) {
  const { download, downloading, error } = useFileDownload(file);
  const label = file.mime === "application/zip" ? "Download ZIP" : "Download";
  return (
    <div className="grid min-w-0 gap-2">
      <DownloadResult
        title={file.mime === "application/zip" ? "Your files are ready" : "Your file is ready"}
        metadata={
          <span className="block break-all">
            {file.name} · {sizeLabel(file.size)}
          </span>
        }
        className="min-w-0 flex-wrap [&>div:nth-child(2)]:basis-32"
        action={
          <Button
            aria-label={`${error ? "Retry download" : label} ${file.name}`}
            disabled={downloading}
            onClick={() => void download()}
            size="xs"
          >
            <Download aria-hidden="true" />
            {downloading ? "Preparing…" : error ? "Retry download" : label}
          </Button>
        }
      />
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Download unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/** Shared operation surface for image-to-image conversions, driven by the tool's own contract. */
export function ImageConversionWorkspace(props: WorkspaceProps) {
  const outputFormatId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const options = useRef<HTMLDivElement>(null);
  const [inputIssue, setInputIssue] = useState("");
  const [cancelled, setCancelled] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputSpec = props.spec.input;
  const running = Boolean(props.running);
  const disabled = Boolean(props.disabled || running);
  const hasFiles = props.input.files.length > 0;
  const conversion = resolveImageConversion(props.spec, props.settings);
  const activeSpec = conversion.spec;
  const actionLabel = activeSpec.trigger.mode === "manual" ? activeSpec.trigger.actionLabel : "Convert images";
  const outputFormat = actionLabel.replace(/^Convert to /, "");
  const outputImages = useMemo(
    () => (props.result?.render === "files" ? props.result.files.filter((file) => file.mime.startsWith("image/")) : []),
    [props.result],
  );
  const completed = !running && outputImages.length > 0;
  const primaryOutput =
    props.result?.render === "files"
      ? (props.result.files.find((file) => file.mime === "application/zip") ?? outputImages[0])
      : undefined;
  const settingsSpec = useMemo<SettingsSpec>(
    () => ({
      ...activeSpec.settings,
      fields: Object.fromEntries(
        Object.entries(activeSpec.settings.fields).map(([key, field]) => [
          key,
          field.kind === "slider" ? { ...field, kind: "number", step: field.step ?? 1 } : field,
        ]),
      ),
    }),
    [activeSpec.settings],
  );
  let settingsIssue = "";
  for (const [key, field] of Object.entries(settingsSpec.fields)) {
    const raw = conversion.settings[key] ?? field.default;
    if (field.kind === "number") {
      const value = typeof raw === "number" || typeof raw === "string" ? Number(raw) : NaN;
      if (
        raw === "" ||
        !Number.isFinite(value) ||
        (field.min !== undefined && value < field.min) ||
        (field.max !== undefined && value > field.max)
      ) {
        settingsIssue = `${field.label} must be between ${field.min ?? 0} and ${field.max ?? 100}.`;
        break;
      }
    } else if (field.kind === "color" && (typeof raw !== "string" || !/^#[0-9a-f]{6}$/i.test(raw))) {
      settingsIssue = `${field.label} must use #RRGGBB, for example #FFFFFF.`;
      break;
    }
  }
  const reason = settingsIssue || (!hasFiles ? "Add at least one image to begin." : null);
  useEffect(() => {
    props.onValidationChange?.(reason);
  }, [reason, props.onValidationChange]);
  useEffect(() => {
    props.onToolbarActionsChange?.({ primaryActionInWorkspace: true });
    return () => props.onToolbarActionsChange?.(null);
  }, [props.onToolbarActionsChange]);
  useEffect(() => {
    setCancelled(false);
  }, [props.input, props.settings]);
  useEffect(() => {
    if (running) setCancelled(false);
  }, [running]);
  useEffect(() => {
    if (!completed) return;
    options.current?.focus({ preventScroll: true });
    if (window.matchMedia("(max-width: 64rem)").matches) options.current?.scrollIntoView({ block: "start" });
  }, [completed]);

  if (inputSpec.kind !== "files") return null;
  const addFiles = (files: File[]) => {
    if (disabled || completed || files.length === 0) return;
    const selection = validateFileSelection(props.input.files, files, inputSpec);
    setInputIssue(selection.issue);
    if (selection.files.length !== props.input.files.length)
      props.onInputChange({ ...props.input, files: selection.files });
  };
  const editSettings = () => {
    setInputIssue("");
    props.onInputChange({ ...props.input });
    requestAnimationFrame(() => options.current?.querySelector<HTMLInputElement>("input")?.focus());
  };
  const convertMore = () => {
    setInputIssue("");
    props.onInputChange({ files: [], text: "" });
    for (const [key, field] of Object.entries(props.spec.settings.fields)) props.onSettingChange(key, field.default);
  };
  const progress =
    props.progress && props.progress.total > 0
      ? Math.min(100, Math.max(0, Math.round((props.progress.completed / props.progress.total) * 100)))
      : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(20rem,30%)] lg:overflow-hidden">
      <div
        className={`flex min-h-0 min-w-0 shrink-0 flex-col border-b border-border lg:border-r lg:border-b-0 ${dragging ? "ring-2 ring-inset ring-primary" : ""}`}
        onDragOver={(event) => {
          if (disabled || completed || !hasFiles || !event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          if (!hasFiles) return;
          event.preventDefault();
          setDragging(false);
          addFiles(Array.from(event.dataTransfer.files));
        }}
      >
        {completed ? (
          <WorkspaceSurface
            title="Generated image workspace"
            header="sr-only"
            purpose="preview"
            className="h-[30rem] flex-none lg:h-auto lg:flex-1"
            contentClassName="gap-0"
            scroll="none"
          >
            <MediaOutputGallery files={outputImages} key={outputImages.map((file) => file.id).join(":")} />
          </WorkspaceSurface>
        ) : hasFiles ? (
          <WorkspaceSurface
            title="Image selection"
            header="sr-only"
            purpose="source"
            className="h-[30rem] flex-none lg:h-auto lg:flex-1"
            contentClassName="gap-0"
            scroll="none"
          >
            <MediaInputGallery
              files={props.input.files}
              disabled={disabled}
              onRemove={(file) => {
                if (disabled) return;
                setInputIssue("");
                props.onInputChange({
                  ...props.input,
                  files: props.input.files.filter((entry) => entry !== file),
                });
              }}
            />
          </WorkspaceSurface>
        ) : (
          <FileIntakeSurface
            accept={inputSpec.accept}
            multiple={inputSpec.multiple}
            maxFiles={Number.MAX_SAFE_INTEGER}
            className="min-h-72 flex-1"
            header="sr-only"
            disabled={disabled}
            intakeIcon={<Upload aria-hidden="true" />}
            intakeTitle={inputSpec.label}
            intakeDescription={inputSpec.dropzoneDescription}
            onFiles={addFiles}
            title="Add images"
            intakeHint="Click to browse, or drag and drop images here"
          />
        )}
        {inputIssue && (
          <Alert className="m-4 w-auto shrink-0" variant="destructive">
            <AlertTitle>Some files were not added</AlertTitle>
            <AlertDescription>{inputIssue} Choose supported images within the limits and try again.</AlertDescription>
          </Alert>
        )}
        {!hasFiles && (
          <Caption className="flex shrink-0 items-center justify-center gap-2 px-4 pb-6 text-muted-foreground">
            <ShieldCheck aria-hidden="true" className="size-4 shrink-0" />
            Files stay on this device. Nothing is uploaded.
          </Caption>
        )}
      </div>
      <div ref={options} tabIndex={-1} className="min-h-0 min-w-0 shrink-0 lg:overflow-y-auto">
        <ToolOptionsPanel
          title="Options"
          aria-label={completed ? "Conversion results" : "Conversion settings"}
          variant="plain"
          className="p-6"
        >
          {!completed &&
            (Object.keys(settingsSpec.fields).length > 0 ? (
              <SettingsPanel
                disabled={disabled}
                spec={settingsSpec}
                values={conversion.settings}
                onChange={(key, value) => props.onSettingChange(conversion.settingKey(key), value)}
              />
            ) : (
              <Muted>PNG is lossless. No quality settings are needed.</Muted>
            ))}
          <div className="grid gap-2">
            <FieldLabel htmlFor={outputFormatId}>Output format</FieldLabel>
            <Select
              id={outputFormatId}
              aria-describedby={`${outputFormatId}-help`}
              disabled={disabled}
              value={conversion.target}
              onChange={(event) => {
                const value = event.target.value;
                if (!disabled && conversion.choices.some((entry) => entry.toolId.endsWith(`-to-${value}`)))
                  props.onSettingChange(IMAGE_OUTPUT_KEY, value);
              }}
            >
              {[
                { value: "jpg", label: "JPG (JPEG)" },
                { value: "png", label: "PNG" },
                { value: "webp", label: "WebP" },
              ].map((item) => (
                <option
                  key={item.value}
                  value={item.value}
                  disabled={!conversion.choices.some((entry) => entry.toolId.endsWith(`-to-${item.value}`))}
                >
                  {item.label}
                </option>
              ))}
            </Select>
            <Caption id={`${outputFormatId}-help`} className="text-muted-foreground">
              {conversion.source === "heic"
                ? "HEIC to WebP is not supported."
                : `${conversion.source.toUpperCase()} output is unavailable: your sources are already ${conversion.source.toUpperCase()}.`}{" "}
              Switching keeps your images.
            </Caption>
          </div>
          {completed && primaryOutput ? (
            <>
              <Muted role="status">
                {outputImages.length} {outputImages.length === 1 ? "image converted" : "images converted"} to{" "}
                {outputFormat}. Your originals are unchanged.
              </Muted>
              <ConversionDownload file={primaryOutput} key={primaryOutput.id} />
              <div className="grid grid-cols-2 gap-2 border-t border-border pt-4">
                <Button variant="outline" onClick={editSettings}>
                  Edit settings
                </Button>
                <Button variant="outline" onClick={convertMore}>
                  Convert more
                </Button>
              </div>
              <Caption className="text-muted-foreground">
                Edit settings to reconvert these images. Convert more starts a new batch.
              </Caption>
            </>
          ) : (
            <>
              <Caption className="text-muted-foreground">
                Original pixel dimensions are preserved. Metadata is removed.
              </Caption>
              {settingsIssue && (
                <Alert variant="destructive">
                  <AlertTitle>Check your settings</AlertTitle>
                  <AlertDescription>{settingsIssue}</AlertDescription>
                </Alert>
              )}
              {running ? (
                <ProcessingStatus
                  title={activeSpec.labels.running}
                  progress={progress}
                  detail={
                    props.progress
                      ? `${props.progress.stage} · ${Math.min(props.progress.completed, props.progress.total)} of ${props.progress.total} complete`
                      : "Preparing your images…"
                  }
                  action={
                    props.primaryAction?.onCancel ? (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setCancelled(true);
                          props.primaryAction?.onCancel?.();
                        }}
                      >
                        Cancel
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <Button
                  className="w-full"
                  disabled={disabled || Boolean(reason) || props.primaryAction?.disabled}
                  onClick={props.primaryAction?.onRun}
                >
                  {actionLabel}
                </Button>
              )}
              {hasFiles && (
                <>
                  <input
                    ref={fileInput}
                    accept={inputSpec.accept}
                    type="file"
                    multiple={inputSpec.multiple}
                    className="sr-only"
                    tabIndex={-1}
                    disabled={disabled}
                    onChange={(event) => {
                      if (event.currentTarget.files) addFiles(Array.from(event.currentTarget.files));
                      event.currentTarget.value = "";
                    }}
                  />
                  <Button
                    className="w-full"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => fileInput.current?.click()}
                  >
                    <Plus aria-hidden="true" />
                    Add more images
                  </Button>
                </>
              )}
              {!hasFiles && (
                <Caption className="text-muted-foreground">Add at least one image to enable conversion.</Caption>
              )}
              {hasFiles && (
                <Caption className="text-muted-foreground">
                  {props.input.files.length === 1
                    ? `One image downloads as a ${outputFormat} file.`
                    : "Multiple images download together as a ZIP, or individually."}
                </Caption>
              )}
              {cancelled && !running && (
                <Muted role="status">
                  Conversion cancelled. Your images and settings are kept. Choose {actionLabel} to try again.
                </Muted>
              )}
              {props.error && (
                <Alert variant="destructive">
                  <AlertTitle>Conversion failed</AlertTitle>
                  <AlertDescription>
                    {props.error} Remove any unsupported or damaged image, then choose {actionLabel} to retry. Your
                    originals are unchanged.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </ToolOptionsPanel>
      </div>
    </div>
  );
}
