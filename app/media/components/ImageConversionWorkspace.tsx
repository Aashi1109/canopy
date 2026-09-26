"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Caption,
  ContentState,
  Muted,
  ProcessingStatus,
  ToolOptionsPanel,
  FieldLabel,
  Select,
  ToolActionButton,
  toast,
} from "@/components/ui/index.tsx";
import { ShieldCheck, Upload } from "lucide-react";

import { IMAGE_OUTPUT_KEY, resolveImageConversion } from "@/app/media/lib/imageConversion";
import { ArtifactDownloadButton } from "@/components/ArtifactDownloadButton";
import { SettingsStack, SplitStack } from "@/components/Stacks";
import { validateFileSelection } from "@/components/FileInput";
import { MediaInputGallery, MediaOutputGallery } from "@/components/MediaOutputGallery";
import { SettingsPanel } from "@/components/SettingsPanel";
import { FileIntakeSurface, WorkspaceSurface } from "@/components/Surfaces";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import type { SettingsSpec } from "@/lib/tool-framework/settings";

function sizeLabel(bytes: number) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1_048_576
      ? `${(bytes / 1024).toFixed(1)} KiB`
      : `${(bytes / 1_048_576).toFixed(1)} MiB`;
}

/** Shared operation surface for image-to-image conversions, driven by the tool's own contract. */
export function ImageConversionWorkspace(props: WorkspaceProps) {
  const outputFormatId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const pasteRequest = useRef(0);
  const [pastePending, setPastePending] = useState(false);
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
  const completed = outputImages.length > 0;
  const completedFormat = outputImages[0]?.mime.split("/")[1]?.replace("jpeg", "jpg").toUpperCase();
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
  const onCancel = props.primaryAction?.onCancel;
  const cancelConversion = useCallback(() => {
    setCancelled(true);
    onCancel?.();
  }, [onCancel]);
  useEffect(() => {
    props.onToolbarActionsChange?.({
      primaryActionLabel: actionLabel,
      onCancel: onCancel ? cancelConversion : undefined,
    });
    return () => props.onToolbarActionsChange?.(null);
  }, [actionLabel, cancelConversion, onCancel, props.onToolbarActionsChange]);
  useEffect(() => {
    setCancelled(false);
  }, [props.input, props.settings]);
  useEffect(() => {
    if (running) setCancelled(false);
  }, [running]);
  useEffect(
    () => () => {
      pasteRequest.current += 1;
    },
    [props.input, disabled],
  );

  if (inputSpec.kind !== "files") return null;
  const addFiles = (files: File[]) => {
    if (disabled || files.length === 0) return;
    const selection = validateFileSelection(props.input.files, files, inputSpec);
    setInputIssue(selection.issue);
    if (selection.files.length !== props.input.files.length)
      props.onInputChange({ ...props.input, files: selection.files });
  };
  const pasteImages = async () => {
    if (disabled || pastePending) return;
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
      if (!files.length) {
        toast.error("No image found in the clipboard. Copy an image, then try Paste again, or use Upload.");
        return;
      }
      addFiles(files);
    } catch {
      if (request === pasteRequest.current)
        toast.error("Could not read the clipboard. Paste with Ctrl+V / ⌘V in the image area, or use Upload.");
    } finally {
      setPastePending(false);
    }
  };
  const convertMore = () => {
    if (disabled) return;
    setInputIssue("");
    props.onInputChange({ files: [], text: "" });
    for (const [key, field] of Object.entries(props.spec.settings.fields)) props.onSettingChange(key, field.default);
  };
  const progress =
    props.progress && props.progress.total > 0
      ? Math.min(100, Math.max(0, Math.round((props.progress.completed / props.progress.total) * 100)))
      : undefined;

  const fileActions = (
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
      <ToolActionButton
        action="paste"
        disabled={disabled || pastePending}
        loading={pastePending}
        onClick={() => void pasteImages()}
      >
        {pastePending ? "Pasting…" : "Paste"}
      </ToolActionButton>
      <ToolActionButton action="upload" disabled={disabled} onClick={() => fileInput.current?.click()}>
        Upload
      </ToolActionButton>
    </>
  );

  return (
    <SettingsStack className="h-full" defaultCollapsed="secondary" defaultSize={75} minSize={75}>
      <SplitStack presentation className="h-full" defaultSize={50} minSize={30}>
        <div
          className={`flex h-full min-h-0 min-w-0 flex-col max-[64rem]:h-[32rem] ${dragging ? "ring-2 ring-inset ring-primary" : ""}`}
          onPaste={(event) => {
            if (disabled || pastePending) return;
            const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
            if (!files.length) return;
            event.preventDefault();
            addFiles(files);
          }}
          onDragOver={(event) => {
            if (disabled || !hasFiles || !event.dataTransfer.types.includes("Files")) return;
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
          {hasFiles ? (
            <WorkspaceSurface
              title="Image selection"
              header="sr-only"
              purpose="source"
              className="min-h-0 flex-1"
              contentClassName="gap-0"
              scroll="none"
            >
              <MediaInputGallery
                actions={fileActions}
                files={props.input.files}
                disabled={disabled}
                onRemove={(file) => {
                  if (disabled) return;
                  setInputIssue("");
                  props.onInputChange({ ...props.input, files: props.input.files.filter((entry) => entry !== file) });
                }}
              />
            </WorkspaceSurface>
          ) : (
            <FileIntakeSurface
              actions={fileActions}
              accept={inputSpec.accept}
              multiple={inputSpec.multiple}
              maxFiles={Number.MAX_SAFE_INTEGER}
              className="min-h-0 flex-1"
              disabled={disabled}
              intakeIcon={<Upload aria-hidden="true" />}
              intakeTitle={inputSpec.label}
              intakeDescription={inputSpec.dropzoneDescription}
              onFiles={addFiles}
              title="Selected images"
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
            <Caption className="flex shrink-0 items-center justify-center gap-2 px-4 pb-4 text-muted-foreground">
              <ShieldCheck aria-hidden="true" className="size-4 shrink-0" />
              Files stay on this device. Nothing is uploaded.
            </Caption>
          )}
        </div>
        <WorkspaceSurface
          title="Processed output"
          purpose="result"
          className="h-full max-[64rem]:h-[32rem]"
          contentClassName="gap-0 overflow-hidden"
          meta={running ? "Processing…" : primaryOutput ? sizeLabel(primaryOutput.size) : undefined}
          actions={
            primaryOutput ? (
              <ArtifactDownloadButton
                file={primaryOutput}
                key={primaryOutput.id}
                disabled={running}
                label={primaryOutput.mime === "application/zip" ? "Download ZIP" : "Download"}
                variant="toolbar"
              />
            ) : (
              <ToolActionButton action="download" disabled>
                Download
              </ToolActionButton>
            )
          }
        >
          {running && (
            <div className="shrink-0 p-4">
              <ProcessingStatus
                title={activeSpec.labels.running}
                progress={progress}
                detail={
                  props.progress
                    ? `${props.progress.stage} · ${Math.min(props.progress.completed, props.progress.total)} of ${props.progress.total} complete`
                    : completed
                      ? "Updating your images…"
                      : "Preparing your images…"
                }
                action={
                  props.primaryAction?.onCancel ? (
                    <Button variant="secondary" onClick={cancelConversion}>
                      Cancel
                    </Button>
                  ) : undefined
                }
              />
            </div>
          )}
          {!running && (props.error || cancelled) && (
            <div className="shrink-0 space-y-2 p-4" role="status">
              <Muted className={props.error ? "text-destructive" : undefined}>
                {props.error || "Conversion cancelled."}{" "}
                {completed ? "Your previous output is still available." : "Your images and settings are kept."} Check
                your settings and retry.
              </Muted>
              <Button
                disabled={disabled || Boolean(reason) || props.primaryAction?.disabled}
                onClick={props.primaryAction?.onRun}
              >
                Retry conversion
              </Button>
            </div>
          )}
          {completed ? (
            <>
              <MediaOutputGallery
                files={outputImages}
                key={outputImages.map((file) => file.id).join(":")}
                header="sr-only"
                disabled={running}
                primaryOutputId={primaryOutput?.id}
              />
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border p-4">
                <div className="min-w-0 flex-1">
                  <Muted role="status">
                    {running
                      ? "Updating converted images."
                      : `${outputImages.length} ${outputImages.length === 1 ? "image converted" : "images converted"} to ${completedFormat}.`}
                  </Muted>
                  <Caption className="text-muted-foreground">
                    Changing settings updates the output. Your originals are unchanged.
                  </Caption>
                </div>
                <Button variant="outline" disabled={disabled} onClick={convertMore}>
                  Convert more
                </Button>
              </div>
            </>
          ) : !running && !props.error && !cancelled ? (
            <ContentState
              state="waiting"
              className="min-h-0 flex-1 rounded-none border-0 bg-transparent"
              title="Converted images will appear here"
              description={`Add images, then choose ${actionLabel}. ${hasFiles && props.input.files.length > 1 ? "Download the results as a ZIP or individually." : `Download the converted ${outputFormat} file here.`}`}
            />
          ) : null}
        </WorkspaceSurface>
      </SplitStack>
      <ToolOptionsPanel
        title="Options"
        aria-label="Conversion settings"
        variant="plain"
        className="h-full overflow-y-auto p-[22px]"
      >
        {Object.keys(settingsSpec.fields).length > 0 ? (
          <SettingsPanel
            disabled={disabled}
            spec={settingsSpec}
            values={conversion.settings}
            onChange={(key, value) => props.onSettingChange(conversion.settingKey(key), value)}
          />
        ) : (
          <Muted>PNG is lossless. No quality settings are needed.</Muted>
        )}
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
        {settingsIssue && (
          <Muted className="text-destructive" role="status">
            {settingsIssue}
          </Muted>
        )}
        <Caption className="text-muted-foreground">
          Original pixel dimensions are preserved. Metadata is removed.
        </Caption>
      </ToolOptionsPanel>
    </SettingsStack>
  );
}
