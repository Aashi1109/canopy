"use client";
import { useTranslations as useToolTranslations } from "next-intl";

import { useEffect, useMemo, useRef, useState } from "react";
import { DesignWorkspace } from "@/app/devtools/components/color-design/DesignWorkspace";
import { ResultSurface } from "@/components/ResultSurface";
import { ColorValueList } from "@/app/devtools/components/color-design/ColorValueList";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import {
  Button,
  Caption,
  ColorSwatch,
  Field,
  FileChip,
  FileUploadZone,
  Input,
  Select,
  ToolActionButton,
} from "@/components/ui/index.tsx";
import { decodeImage, pixelColorValues } from "./model";
import { ImageSamplingCanvas } from "./ImageSamplingCanvas";

export default function ImageColorPickerWorkspace(props: WorkspaceProps) {
  const toolText = useToolTranslations("Tool.runtime");
  const fileInput = useRef<HTMLInputElement>(null);
  const [decoded, setDecoded] = useState<{ file: File; canvas: HTMLCanvasElement } | null>(null);
  const [zoom, setZoom] = useState<"fit" | "actual">("fit");
  const file = props.input.files[0];
  const image = decoded?.file === file ? decoded?.canvas : null;
  const dimensions = { width: image?.width ?? 0, height: image?.height ?? 0 };
  const x = Math.max(0, Math.min(Math.max(0, dimensions.width - 1), Math.floor(Number(props.settings.x) || 0)));
  const y = Math.max(0, Math.min(Math.max(0, dimensions.height - 1), Math.floor(Number(props.settings.y) || 0)));

  useEffect(() => {
    const abort = new AbortController();
    setDecoded(null);
    if (!file) {
      return () => abort.abort();
    }
    void decodeImage(file, abort.signal)
      .then((image) => {
        if (!abort.signal.aborted) setDecoded({ file, canvas: image.canvas });
      })
      .catch(() => {
        if (!abort.signal.aborted) setDecoded(null);
      });
    return () => abort.abort();
  }, [file]);

  function load(files: FileList | readonly File[] | null) {
    if (props.disabled || !files?.[0]) return;
    setZoom("fit");
    setDecoded(null);
    props.onSettingChange("x", 0);
    props.onSettingChange("y", 0);
    props.onInputChange({ text: "", files: [files[0]] });
  }
  function clearImage() {
    if (props.disabled) return;
    setZoom("fit");
    setDecoded(null);
    props.onSettingChange("x", 0);
    props.onSettingChange("y", 0);
    props.onInputChange({ text: "", files: [] });
  }
  function sample(nextX: number, nextY: number) {
    props.onSettingChange("x", Math.max(0, Math.min(dimensions.width - 1, Math.floor(nextX))));
    props.onSettingChange("y", Math.max(0, Math.min(dimensions.height - 1, Math.floor(nextY))));
  }
  const currentResult = props.running || props.error ? null : props.result;
  const selected = useMemo(() => (image ? pixelColorValues(image, x, y) : undefined), [image, x, y]);
  const palette = image ? props.result?.sections?.find((section) => section.body.render === "table")?.body : undefined;
  const selectedHex = selected?.hex;

  return (
    <DesignWorkspace
      title={toolText("workspace.image_1aa4cb")}
      controlTitle={toolText("image.controlTitle")}
      previewMeta={file ? <FileChip file={file} disabled={props.disabled} onRemove={clearImage} /> : undefined}
      previewActions={
        <ToolActionButton action="upload" disabled={props.disabled} onClick={() => fileInput.current?.click()}>
          {toolText("workspace.upload_865e89")}
        </ToolActionButton>
      }
      preview={
        <div
          className="relative flex h-full min-h-0 flex-col overflow-hidden p-4"
          onDragOver={(event) => {
            if (!props.disabled) event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (!props.disabled) load(event.dataTransfer.files);
          }}
        >
          <input
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            disabled={props.disabled}
            onChange={(event) => {
              load(event.target.files);
              event.target.value = "";
            }}
            ref={fileInput}
            tabIndex={-1}
            type="file"
          />
          {!file ? (
            <FileUploadZone
              className="min-h-40 flex-1"
              description={toolText("workspace.png_jpeg_webp_601a79")}
              disabled={props.disabled}
              hint={toolText("image.uploadHint")}
              onClick={() => fileInput.current?.click()}
              title={toolText("workspace.pick_colors_from_8c65bb")}
            />
          ) : (
            <>
              {image ? (
                <ImageSamplingCanvas
                  image={image}
                  x={x}
                  y={y}
                  zoom={zoom}
                  disabled={Boolean(props.disabled)}
                  onSample={sample}
                />
              ) : (
                <div className="min-h-0 flex-1" />
              )}
              <Caption className="mt-2" aria-live="polite">
                {dimensions.width
                  ? toolText("image.selection", { ...dimensions, x, y })
                  : props.error
                    ? toolText("workspace.upload_another_image_2549e7")
                    : toolText("workspace.reading_the_image_9a0944")}
              </Caption>
            </>
          )}
        </div>
      }
      controls={
        <>
          <Caption>{toolText("workspace.click_or_drag_945c3c")}</Caption>
          <div className="grid grid-cols-2 gap-3">
            <Field htmlFor="image-pixel-x" label={toolText("workspace.x_from_left_595135")}>
              <Input
                disabled={props.disabled || !dimensions.width}
                id="image-pixel-x"
                min={0}
                max={Math.max(0, dimensions.width - 1)}
                step={1}
                type="number"
                value={x}
                onChange={(event) => {
                  if (event.target.value !== "" && Number.isFinite(Number(event.target.value)))
                    sample(Number(event.target.value), y);
                }}
              />
            </Field>
            <Field htmlFor="image-pixel-y" label={toolText("workspace.y_from_top_a5588e")}>
              <Input
                disabled={props.disabled || !dimensions.height}
                id="image-pixel-y"
                min={0}
                max={Math.max(0, dimensions.height - 1)}
                step={1}
                type="number"
                value={y}
                onChange={(event) => {
                  if (event.target.value !== "" && Number.isFinite(Number(event.target.value)))
                    sample(x, Number(event.target.value));
                }}
              />
            </Field>
          </div>
          <Field htmlFor="image-zoom" label={toolText("workspace.image_view_d40257")}>
            <Select
              disabled={props.disabled || !dimensions.width}
              id="image-zoom"
              value={zoom}
              onChange={(event) => setZoom(event.target.value === "actual" ? "actual" : "fit")}
            >
              <option value="fit">{toolText("workspace.fit_image_294736")}</option>
              <option value="actual">{toolText("workspace.actual_pixels_100_715803")}</option>
            </Select>
          </Field>
          <Field htmlFor="image-palette-count" label={toolText("workspace.palette_colors_d752a8")}>
            <Input
              disabled={props.disabled || !file}
              id="image-palette-count"
              max={12}
              min={3}
              step={1}
              type="number"
              value={Number(props.settings.colors ?? 6)}
              onChange={(event) => {
                const count = Number(event.target.value);
                if (Number.isInteger(count) && count >= 3 && count <= 12) props.onSettingChange("colors", count);
              }}
            />
          </Field>
          <Caption>{toolText("workspace.pixel_coordinates_start_a0be66")}</Caption>
          <Button disabled={props.disabled || !file} onClick={clearImage} variant="outline">
            {toolText("workspace.clear_image_20231a")}
          </Button>
        </>
      }
      output={
        <ResultSurface
          error={props.error}
          result={currentResult}
          retainedResult={props.result}
          running={props.running}
          spec={props.spec}
          title={toolText("workspace.pixel_and_palette_bbec59")}
          renderResult={() => (
            <div className="grid min-w-0 gap-4 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                {selectedHex && (
                  <ColorSwatch
                    className="mb-2 h-9"
                    color={String(selectedHex)}
                    label={toolText("image.selectedPixel", { hex: selectedHex })}
                  />
                )}
                {selected && (
                  <ColorValueList
                    entries={selected.entries.map((entry) => ({
                      ...entry,
                      label: entry.labelMessage ? toolText(entry.labelMessage.key) : entry.label,
                    }))}
                  />
                )}
              </div>
              <div className="min-w-0">
                <Caption>{toolText("workspace.approximate_dominant_palette_a73fe0")}</Caption>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {palette?.render === "table" &&
                    palette.rows.map(([hex, share]) => (
                      <div key={hex} className="min-w-0">
                        <ColorSwatch className="h-9" color={hex} />
                        <Caption className="block whitespace-nowrap">
                          {hex} <span aria-hidden="true">|</span> {share}
                        </Caption>
                      </div>
                    ))}
                </div>
                {palette?.render === "table" && !palette.rows.length && (
                  <Caption>{toolText("workspace.this_image_is_65cf49")}</Caption>
                )}
              </div>
            </div>
          )}
        />
      }
    />
  );
}
