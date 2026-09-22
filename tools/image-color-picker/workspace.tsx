"use client";

import { useEffect, useRef, useState } from "react";
import { DesignWorkspace } from "@/app/devtools/components/color-design/DesignWorkspace";
import { ResultSurface } from "@/components/ResultSurface";
import { ColorValueList } from "@/app/devtools/components/color-design/ColorValueList";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import { Button, Caption, ColorSwatch, Field, FileUploadZone, Input, Select } from "@/components/ui/index.tsx";
import { decodeImage, pixelCoordinates } from "./model";

export default function ImageColorPickerWorkspace(props: WorkspaceProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState("fit");
  const file = props.input.files[0];
  const x = Math.max(0, Math.min(Math.max(0, dimensions.width - 1), Math.floor(Number(props.settings.x) || 0)));
  const y = Math.max(0, Math.min(Math.max(0, dimensions.height - 1), Math.floor(Number(props.settings.y) || 0)));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) canvas.width = 0;
    setDimensions({ width: 0, height: 0 });
  }, [file]);

  useEffect(() => {
    const abort = new AbortController();
    if (!file) {
      setDimensions({ width: 0, height: 0 });
      return () => abort.abort();
    }
    void decodeImage(file, abort.signal)
      .then((image) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        context?.drawImage(image.canvas, 0, 0);
        if (context) {
          const sampleX = Math.max(0, Math.min(image.width - 1, Math.floor(Number(props.settings.x) || 0)));
          const sampleY = Math.max(0, Math.min(image.height - 1, Math.floor(Number(props.settings.y) || 0)));
          const radius = Math.max(4, Math.max(image.width, image.height) / 150);
          context.lineWidth = Math.max(1, radius / 4);
          context.strokeStyle = "white";
          context.strokeRect(sampleX - radius, sampleY - radius, radius * 2, radius * 2);
          context.lineWidth = Math.max(1, radius / 8);
          context.strokeStyle = "black";
          context.strokeRect(sampleX - radius, sampleY - radius, radius * 2, radius * 2);
        }
        setDimensions({ width: image.width, height: image.height });
      })
      .catch(() => {
        if (!abort.signal.aborted) setDimensions({ width: 0, height: 0 });
      });
    return () => abort.abort();
  }, [file, props.settings.x, props.settings.y]);

  function load(files: FileList | readonly File[] | null) {
    if (!files?.[0]) return;
    setZoom("fit");
    setDimensions({ width: 0, height: 0 });
    props.onSettingChange("x", 0);
    props.onSettingChange("y", 0);
    props.onInputChange({ text: "", files: [files[0]] });
  }
  function sample(nextX: number, nextY: number) {
    props.onSettingChange("x", Math.max(0, Math.min(dimensions.width - 1, Math.floor(nextX))));
    props.onSettingChange("y", Math.max(0, Math.min(dimensions.height - 1, Math.floor(nextY))));
  }
  const currentResult = props.running || props.error ? null : props.result;
  const selected = currentResult?.sections?.find((section) => section.title === "Selected pixel")?.body;
  const palette = currentResult?.sections?.find((section) => section.title === "Approximate palette")?.body;
  const selectedHex =
    selected?.render === "key-value" ? selected.entries.find((entry) => entry.label === "HEX")?.value : undefined;

  return (
    <DesignWorkspace
      title={file ? file.name : "Choose an image"}
      controlTitle="Pick a pixel"
      previewActions={
        file ? (
          <Button disabled={props.disabled} onClick={() => fileInput.current?.click()} size="sm" variant="outline">
            Replace image
          </Button>
        ) : undefined
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
              description="PNG · JPEG · WebP · GIF · up to 20 MB"
              disabled={props.disabled}
              hint="Click to choose, or drop an image. Nothing is uploaded."
              onClick={() => fileInput.current?.click()}
              title="Pick colors from an image"
            />
          ) : (
            <>
              <div
                className={`relative flex min-h-0 flex-1 overflow-auto rounded-lg border border-border ${zoom === "fit" ? "items-center justify-center" : "items-start justify-start"}`}
              >
                <ColorSwatch
                  className="pointer-events-none absolute inset-0 rounded-none border-0"
                  color="transparent"
                  label="Transparency background"
                />
                <canvas
                  aria-label="Image color sampling surface. Click a pixel, or use arrow keys to move the selected pixel."
                  className="relative shrink-0 cursor-crosshair outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={(event) => {
                    if (props.disabled || !dimensions.width) return;
                    const rect = event.currentTarget.getBoundingClientRect();
                    const next = pixelCoordinates(
                      event.clientX - rect.left,
                      event.clientY - rect.top,
                      rect.width,
                      rect.height,
                      dimensions.width,
                      dimensions.height,
                    );
                    sample(next.x, next.y);
                  }}
                  onKeyDown={(event) => {
                    if (props.disabled || !dimensions.width) return;
                    const delta: Record<string, [number, number]> = {
                      ArrowLeft: [-1, 0],
                      ArrowRight: [1, 0],
                      ArrowUp: [0, -1],
                      ArrowDown: [0, 1],
                    };
                    const direction = delta[event.key];
                    if (!direction) return;
                    event.preventDefault();
                    sample(x + direction[0] * (event.shiftKey ? 10 : 1), y + direction[1] * (event.shiftKey ? 10 : 1));
                  }}
                  ref={canvasRef}
                  role="img"
                  style={
                    zoom === "fit"
                      ? { maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto" }
                      : { width: dimensions.width, height: dimensions.height, maxWidth: "none" }
                  }
                  tabIndex={props.disabled ? -1 : 0}
                />
              </div>
              <Caption className="mt-2" aria-live="polite">
                {dimensions.width
                  ? `${dimensions.width} × ${dimensions.height} pixels · Selected ${x}, ${y}`
                  : props.error
                    ? "Replace the image to try again."
                    : "Reading the image…"}
              </Caption>
            </>
          )}
        </div>
      }
      controls={
        <>
          <Caption>Click a pixel or enter its coordinates. Arrow keys move one pixel; hold Shift to move ten.</Caption>
          <div className="grid grid-cols-2 gap-3">
            <Field htmlFor="image-pixel-x" label="X (from left)">
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
            <Field htmlFor="image-pixel-y" label="Y (from top)">
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
          <Field htmlFor="image-zoom" label="Image view">
            <Select
              disabled={!dimensions.width}
              id="image-zoom"
              value={zoom}
              onChange={(event) => setZoom(event.target.value)}
            >
              <option value="fit">Fit image</option>
              <option value="actual">Actual pixels (100%)</option>
            </Select>
          </Field>
          <Field htmlFor="image-palette-count" label="Palette colors">
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
          <Caption>
            Pixel coordinates start at zero. Animated files use the first frame. Palette shares are approximate and
            exclude transparent pixels.
          </Caption>
          <Button
            disabled={props.disabled || !file}
            onClick={() => props.onInputChange({ text: "", files: [] })}
            variant="outline"
          >
            Clear image
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
          title="Pixel and palette"
          renderResult={() => (
            <div className="grid min-w-0 gap-4 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                {selectedHex && (
                  <ColorSwatch
                    className="mb-2 h-9"
                    color={String(selectedHex)}
                    label={`Selected pixel ${selectedHex}`}
                  />
                )}
                {selected?.render === "key-value" && <ColorValueList entries={selected.entries} />}
              </div>
              <div className="min-w-0">
                <Caption>Approximate dominant palette</Caption>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {palette?.render === "table" &&
                    palette.rows.map(([hex, share]) => (
                      <div key={hex} className="min-w-0">
                        <ColorSwatch className="h-9" color={hex} />
                        <Caption className="block truncate">{hex}</Caption>
                        <Caption>{share}</Caption>
                      </div>
                    ))}
                </div>
                {palette?.render === "table" && !palette.rows.length && (
                  <Caption>This image is fully transparent; it has no visible palette.</Caption>
                )}
              </div>
            </div>
          )}
        />
      }
    />
  );
}
