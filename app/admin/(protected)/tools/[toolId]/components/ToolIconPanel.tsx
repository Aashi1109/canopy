"use client";

import { H3, Label, Caption, Muted, Text, AlertBanner, Button, Input } from "@canopy/ui";
import { ImagePlus, RotateCcw, Trash2, Upload } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState, type ChangeEvent, type ReactElement } from "react";
import { ToolIcon } from "../../../../../../components/ToolIcon";
import { removeToolIconAction, uploadToolIconAction, type ToolContentActionState } from "../../actions";

const IDLE: ToolContentActionState = { status: "idle", message: "" };

export interface ToolIconPanelProps {
  readonly iconUrl: string | null;
  readonly name: string;
  readonly toolId: string;
  readonly uploadsEnabled: boolean;
}

export function ToolIconPanel({ iconUrl, name, toolId, uploadsEnabled }: ToolIconPanelProps): ReactElement {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [state, setState] = useState<ToolContentActionState>(IDLE);
  const [, uploadAction, isUploading] = useActionState(async (previous: ToolContentActionState, data: FormData) => {
    // React resets file inputs after a form action; retain the file for retries.
    if (selectedFile) data.set("icon", selectedFile);
    const next = await uploadToolIconAction(previous, data);
    if (next.status === "success") resetSelection();
    setState(next);
    return next;
  }, IDLE);
  const [, removeAction, isRemoving] = useActionState(async (previous: ToolContentActionState, data: FormData) => {
    const next = await removeToolIconAction(previous, data);
    if (next.status === "success") resetSelection();
    setState(next);
    return next;
  }, IDLE);
  const busy = isUploading || isRemoving;

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  function preview(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setState(IDLE);
  }

  function resetSelection(): void {
    setSelectedFile(null);
    setPreviewUrl(null);
    if (inputRef.current) inputRef.current.value = "";
    setState(IDLE);
  }

  return (
    <section className="grid gap-5">
      <div>
        <H3>Tool icon</H3>
        <Muted className="mt-1 text-muted-foreground">
          Upload a square source. The catalog generates its display sizes automatically.
        </Muted>
      </div>

      {state.status !== "idle" ? (
        <AlertBanner variant={state.status === "success" ? "success" : "error"}>{state.message}</AlertBanner>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-[150px_minmax(0,1fr)]">
        <div className="grid content-start gap-2">
          <span className="grid aspect-square w-full place-items-center overflow-hidden rounded-xl border border-border bg-muted">
            {previewUrl ? (
              // This blob URL is local-only and exists solely for the selected-file preview.
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="Selected icon preview" className="size-full object-cover" src={previewUrl} />
            ) : (
              <ToolIcon name={name} iconUrl={iconUrl} size={72} toolId={toolId} />
            )}
          </span>
          <Caption className="block break-all text-center text-muted-foreground">
            {selectedFile?.name ?? (iconUrl ? "Uploaded icon" : "Generated identicon")}
          </Caption>
        </div>

        {uploadsEnabled ? (
          <form action={uploadAction} className="grid content-start gap-4">
            <input name="toolId" type="hidden" value={toolId} />
            <Input
              accept="image/png,image/jpeg,image/webp"
              aria-label="Choose an icon"
              className="peer sr-only"
              disabled={busy}
              id={inputId}
              name="icon"
              onChange={preview}
              ref={inputRef}
              required={!selectedFile}
              tabIndex={selectedFile ? -1 : 0}
              type="file"
            />
            {selectedFile ? (
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={resetSelection} size="sm" type="button" variant="secondary">
                  <RotateCcw aria-hidden="true" />
                  Reset
                </Button>
                <Button disabled={busy} loading={isUploading} size="sm" type="submit">
                  <Upload aria-hidden="true" />
                  {isUploading ? "Uploading…" : "Upload"}
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => inputRef.current?.click()}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  <ImagePlus aria-hidden="true" />
                  Choose another
                </Button>
              </div>
            ) : (
              <Label
                className="group grid min-h-32 cursor-pointer place-items-center rounded-xl border border-dashed border-input bg-muted/40 p-5 text-center outline-none transition-colors hover:border-primary/45 hover:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
                htmlFor={inputId}
              >
                <span>
                  <span className="mx-auto grid size-9 place-items-center rounded-lg bg-card text-primary">
                    <ImagePlus aria-hidden="true" className="size-4" />
                  </span>
                  <Text className="mt-2 block">Choose a replacement icon</Text>
                  <Caption className="mt-1 block text-muted-foreground">
                    PNG, JPG, or WebP · square recommended · 1 MB maximum
                  </Caption>
                </span>
              </Label>
            )}
          </form>
        ) : (
          <AlertBanner title="Icon uploads are disabled" variant="warning">
            Configure Cloudinary credentials to enable uploads. Existing icons and generated identicons still render.
          </AlertBanner>
        )}
      </div>

      {iconUrl ? (
        <form action={removeAction} className="border-t border-border pt-4">
          <input name="toolId" type="hidden" value={toolId} />
          <Button disabled={busy} loading={isRemoving} size="sm" type="submit" variant="danger-subtle">
            <Trash2 aria-hidden="true" />
            Remove uploaded icon
          </Button>
        </form>
      ) : null}
    </section>
  );
}
