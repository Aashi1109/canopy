"use client";

/** Crop selections are stored in source pixels and shared with the worker. */

import { FileProcessorWorkspace } from "@/components/FileProcessorWorkspace";
import { CropFrame, type CropBox } from "@/components/CropFrame";
import { workspaceFileId } from "@/components/FileInput";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import { useCallback, useEffect, useId, useState } from "react";
import { Button, FieldLabel, Input, Muted } from "@smarttools/ui";
import { SettingsPanel } from "@/components/SettingsPanel";
import { FreeformPreview } from "./FreeformPreview";
import {
  fullImagePoints,
  moveCropPoint,
  parseCropPoints,
  selectionBounds,
  resizeCropPoints,
  type CropPoint,
} from "./geometry";

const ASPECT = "cropAspect";
const FREE = "free";
const CROP_KEYS = {
  height: "cropHeight",
  width: "cropWidth",
  x: "cropX",
  y: "cropY",
} as const;
const RATIOS: Readonly<Record<string, number>> = {
  "1:1": 1,
  "4:3": 4 / 3,
  "16:9": 16 / 9,
};

interface Size {
  readonly height: number;
  readonly width: number;
}

const NO_SIZE: Size = { height: 0, width: 0 };

function pixelsOf(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Fits a box to the locked ratio, if any, without leaving the image. */
function applyAspect(box: CropBox, bounds: Size, ratio: number | undefined): CropBox {
  if (!ratio) return box;
  const height = Math.max(1, Math.min(Math.round(box.width / ratio), bounds.height - box.y));
  return {
    height,
    width: Math.max(1, Math.min(Math.round(height * ratio), bounds.width - box.x)),
    x: box.x,
    y: box.y,
  };
}

/** An object URL for the picked image, revoked when the selection changes. */
function useImageUrl(file: File | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const fileKey = file ? `${workspaceFileId(file)}:${file.size}` : "";

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
    // `file` is read through `fileKey`, which is what actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileKey]);

  return url;
}

interface CropPreviewProps {
  disabled: boolean;
  file: File | undefined;
  onSettingChange: WorkspaceProps["onSettingChange"];
  settings: WorkspaceProps["settings"];
  onImageLoad?: (size: Size) => void;
}

function CropPreview({ disabled, file, onSettingChange, settings, onImageLoad }: CropPreviewProps) {
  const url = useImageUrl(file);
  const [size, setSize] = useState<Size>(NO_SIZE);
  const aspect = typeof settings[ASPECT] === "string" ? settings[ASPECT] : FREE;
  const ratio = RATIOS[aspect];
  const box: CropBox = {
    height: pixelsOf(settings[CROP_KEYS.height], 0),
    width: pixelsOf(settings[CROP_KEYS.width], 0),
    x: pixelsOf(settings[CROP_KEYS.x], 0),
    y: pixelsOf(settings[CROP_KEYS.y], 0),
  };

  const write = useCallback(
    (next: CropBox, current: CropBox) => {
      for (const [axis, key] of Object.entries(CROP_KEYS)) {
        const value = next[axis as keyof CropBox];
        if (value !== current[axis as keyof CropBox]) onSettingChange(key, value);
      }
    },
    [onSettingChange],
  );

  // Seeds the box once the image's real size is known, and re-fits it whenever
  // the ratio lock changes. Keyed on the size and the ratio alone: the writes
  // below change neither, so the effect settles after one pass.
  const sizeKey = `${size.width}x${size.height}:${aspect}`;
  useEffect(() => {
    if (size.width === 0 || size.height === 0) return;
    const seeded: CropBox =
      box.width > 0 && box.height > 0
        ? box
        : { height: size.height, width: size.width, x: 0, y: 0 };
    write(applyAspect(seeded, size, ratio), box);
    // The box is read, not depended on — depending on it would re-seed on
    // every drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizeKey, write]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Muted className="shrink-0 px-4 py-2">
        Drag handles to shape the crop · Drag inside to move it
      </Muted>
      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-6">
        {url ? (
          <div className="relative inline-block max-w-full shrink-0 overflow-hidden touch-none select-none">
            <img
              alt="Crop preview"
              className="block max-h-[520px] max-w-full object-contain outline outline-1 outline-black/10 dark:outline-white/10"
              draggable={false}
              onLoad={(event) => {
                const next = {
                  height: event.currentTarget.naturalHeight,
                  width: event.currentTarget.naturalWidth,
                };
                setSize(next);
                onImageLoad?.(next);
              }}
              src={url}
            />
            {size.width > 0 && size.height > 0 ? (
              <CropFrame
                bounds={size}
                box={box}
                disabled={disabled}
                onChange={(next) => write(applyAspect(next, size, ratio), box)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      <Muted className="shrink-0 border-t border-border px-4 py-2">
        Arrow keys move 1 px · Shift moves 10 px · Drag the corner to resize
      </Muted>
    </div>
  );
}

function CropEditor(props: WorkspaceProps) {
  const { onSettingChange: change, settings } = props;
  const file = props.input.files[0];
  const url = useImageUrl(file);
  const [size, setSize] = useState<Size>(NO_SIZE);
  const [selected, setSelected] = useState(0);
  const [imageError, setImageError] = useState("");
  const [pointIssue, setPointIssue] = useState("");
  const [countDraft, setCountDraft] = useState<string | null>(null);
  const fieldId = useId();
  const freeform = settings.cropMode !== "rectangle";
  const pointCount = pixelsOf(settings.cropPointCount, 4);
  let points: readonly CropPoint[] = [];
  try {
    points = parseCropPoints(settings.cropPoints, size.width ? size : undefined);
  } catch {
    /* Not decoded or invalid yet. */
  }
  const writePoints = useCallback(
    (next: readonly CropPoint[]) => change("cropPoints", JSON.stringify(next)),
    [change],
  );
  useEffect(() => {
    if (size.width && size.height && !settings.cropPoints) {
      try {
        writePoints(resizeCropPoints(fullImagePoints(size), pointCount, size));
      } catch (error) {
        setPointIssue(error instanceof Error ? error.message : "Choose fewer points.");
      }
    }
  }, [size, settings.cropPoints, pointCount, writePoints]);
  const onSettingChange = useCallback(
    (key: string, value: unknown) => {
      if ((key === CROP_KEYS.width || key === CROP_KEYS.height) && settings[ASPECT] !== FREE)
        change(ASPECT, FREE);
      change(key, value);
    },
    [change, settings],
  );
  const bounds = points.length >= 3 ? selectionBounds(points) : { x: 0, y: 0, width: 0, height: 0 };
  const fields = props.spec.settings.fields;
  const outputFields = Object.fromEntries(
    Object.entries(fields).filter(
      ([key]) =>
        key === "outputFormat" ||
        (key === "quality" &&
          settings.outputFormat !== "png" &&
          !(settings.outputFormat === "original" && file?.type === "image/png")),
    ),
  );
  const resetCrop = () => {
    setPointIssue("");
    if (freeform) {
      try {
        writePoints(resizeCropPoints(fullImagePoints(size), pointCount, size));
      } catch (error) {
        setPointIssue(error instanceof Error ? error.message : "Choose fewer points.");
      }
    } else {
      change("cropX", 0);
      change("cropY", 0);
      change("cropWidth", size.width);
      change("cropHeight", size.height);
      change(ASPECT, FREE);
    }
  };
  return (
    <FileProcessorWorkspace
      {...props}
      compactFileToolbar
      onSettingChange={onSettingChange}
      onInputChange={(input) => {
        if (input.files[0] !== file) {
          change("cropPoints", "");
          for (const key of Object.values(CROP_KEYS)) change(key, 0);
        }
        props.onInputChange(input);
      }}
      renderOptions={() => (
        <>
          <div className={freeform ? "grid grid-cols-2 items-start gap-4" : undefined}>
            <SettingsPanel
              disabled={props.disabled}
              onChange={onSettingChange}
              spec={{ fields: { cropMode: fields.cropMode } }}
              values={settings}
            />
            {freeform ? (
              <div className="grid gap-1.5">
                <FieldLabel htmlFor={`${fieldId}-count`}>Freeform point count</FieldLabel>
                <Input
                  id={`${fieldId}-count`}
                  type="number"
                  min={3}
                  max={12}
                  step={1}
                  disabled={props.disabled}
                  value={countDraft ?? pointCount}
                  aria-describedby={`${fieldId}-count-help`}
                  onBlur={() => {
                    if (countDraft !== null) {
                      setCountDraft(null);
                      setPointIssue("");
                    }
                  }}
                  onChange={(event) => {
                    setCountDraft(event.currentTarget.value);
                    const value = event.currentTarget.valueAsNumber;
                    if (!Number.isInteger(value) || value < 3 || value > 12) {
                      setPointIssue("Choose between 3 and 12 points.");
                      return;
                    }
                    try {
                      if (size.width && size.height)
                        writePoints(
                          resizeCropPoints(
                            points.length >= 3 ? points : fullImagePoints(size),
                            value,
                            size,
                          ),
                        );
                      change("cropPointCount", value);
                      setCountDraft(null);
                      setSelected(0);
                      setPointIssue("");
                    } catch (error) {
                      setPointIssue(
                        error instanceof Error ? error.message : "Choose fewer points.",
                      );
                    }
                  }}
                />
                <Muted id={`${fieldId}-count-help`}>3–12 points.</Muted>
              </div>
            ) : null}
          </div>
          {freeform ? (
            <>
              <Muted>Each point moves freely. Edges cannot cross or leave the image.</Muted>
              <div className="grid grid-cols-2 gap-4">
                {(["x", "y"] as const).map((axis) => (
                  <div className="grid gap-2" key={axis}>
                    <FieldLabel htmlFor={`${fieldId}-${axis}`}>
                      {axis.toUpperCase()} · selected point {selected + 1}
                    </FieldLabel>
                    <Input
                      id={`${fieldId}-${axis}`}
                      suffix="px"
                      type="number"
                      min={0}
                      max={axis === "x" ? size.width : size.height}
                      step={1}
                      disabled={props.disabled || points.length < 3 || !size.width}
                      value={points[selected]?.[axis] ?? ""}
                      aria-invalid={Boolean(pointIssue)}
                      aria-describedby={pointIssue ? `${fieldId}-issue` : undefined}
                      onChange={(event) => {
                        const value = event.currentTarget.valueAsNumber;
                        if (!Number.isSafeInteger(value) || !points[selected]) {
                          setPointIssue("Enter a whole-number pixel position.");
                          return;
                        }
                        const next = moveCropPoint(
                          points,
                          selected,
                          { ...points[selected], [axis]: value },
                          size,
                        );
                        if (next === points) {
                          setPointIssue("Points cannot overlap or cross the opposite edge.");
                          return;
                        }
                        setPointIssue("");
                        writePoints(next);
                      }}
                    />
                  </div>
                ))}
                {(["width", "height"] as const).map((axis) => (
                  <div className="grid gap-2" key={axis}>
                    <FieldLabel htmlFor={`${fieldId}-${axis}`}>
                      {axis === "width" ? "Width" : "Height"} · selection bounds
                    </FieldLabel>
                    <Input id={`${fieldId}-${axis}`} suffix="px" readOnly value={bounds[axis]} />
                  </div>
                ))}
              </div>
              {pointIssue ? (
                <Muted id={`${fieldId}-issue`} role="alert">
                  {pointIssue}
                </Muted>
              ) : null}
              <Muted>
                Select a point to edit its X and Y. Width and height show the selection’s bounding
                box.
              </Muted>
            </>
          ) : (
            <SettingsPanel
              className="grid-cols-2"
              layout="grid"
              disabled={props.disabled}
              onChange={onSettingChange}
              values={settings}
              spec={{
                fields: Object.fromEntries(
                  Object.entries(fields).filter(([key]) =>
                    [ASPECT, ...Object.values(CROP_KEYS)].includes(key),
                  ),
                ),
              }}
            />
          )}
          <SettingsPanel
            disabled={props.disabled}
            onChange={onSettingChange}
            spec={{ fields: outputFields }}
            values={settings}
          />
          {freeform ? (
            <Muted>
              {settings.outputFormat === "jpeg" ||
              (settings.outputFormat === "original" && file?.type === "image/jpeg")
                ? "JPEG fills the area outside your selection with white. Choose PNG or WebP to keep it transparent."
                : "Pixels outside the selection are transparent. This crops the shape; it does not straighten perspective."}
            </Muted>
          ) : null}
          <Button
            disabled={props.disabled || !file || !size.width}
            onClick={resetCrop}
            variant="outline"
          >
            Reset crop
          </Button>
        </>
      )}
      detail={({ disabled }) =>
        freeform ? (
          imageError ? (
            <div role="alert" className="p-4">
              <Muted>{imageError} Replace the image to try again.</Muted>
            </div>
          ) : url ? (
            <FreeformPreview
              url={url}
              points={points}
              size={size}
              selected={selected}
              disabled={disabled}
              onInvalidMove={() =>
                setPointIssue("Points cannot overlap or cross the opposite edge.")
              }
              onSelect={(index) => {
                setSelected(index);
                setPointIssue("");
              }}
              onChange={(next) => {
                setPointIssue("");
                writePoints(next);
              }}
              onError={() => {
                setImageError("This image could not be decoded.");
                change("cropPoints", "");
                setSize(NO_SIZE);
              }}
              onLoad={(next) => {
                if (!next.width || !next.height || next.width * next.height > 100_000_000) {
                  setImageError("Choose an image under 100 megapixels.");
                  change("cropPoints", "");
                  setSize(NO_SIZE);
                  return;
                }
                setSize(next);
              }}
            />
          ) : (
            <Muted>Loading image…</Muted>
          )
        ) : (
          <CropPreview
            disabled={disabled}
            file={file}
            onSettingChange={props.onSettingChange}
            settings={settings}
            onImageLoad={setSize}
          />
        )
      }
    />
  );
}

export default function CropImageWorkspace(props: WorkspaceProps) {
  const file = props.input.files[0];
  return (
    <CropEditor
      key={file ? `${workspaceFileId(file)}:${file.size}:${file.lastModified}` : "empty"}
      {...props}
    />
  );
}
