"use client";

import { useCallback, useRef, useState, type PointerEvent } from "react";
import { createLucideIcon } from "lucide-react";

import { DesignWorkspace } from "@/app/devtools/components/color-design/DesignWorkspace";
import { ResultSurface } from "@/components/ResultSurface";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import {
  Button,
  ButtonGroup,
  CanvasHandle,
  Checkbox,
  Field,
  Input,
  Select,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/index.tsx";

const RadiusCorner = createLucideIcon("RadiusCorner", [["path", { d: "M4 4h8a8 8 0 0 1 8 8v8", key: "corner" }]]);

const CORNERS = [
  ["topLeft", "Top-left", "-rotate-90"],
  ["topRight", "Top-right", "rotate-0"],
  ["bottomLeft", "Bottom-left", "rotate-180"],
  ["bottomRight", "Bottom-right", "rotate-90"],
] as const;

const PRESETS = {
  card: { radius: 16, unit: "px", width: 280, height: 200 },
  pill: { radius: 9999, unit: "px", width: 280, height: 100 },
  circle: { radius: 50, unit: "%", width: 220, height: 220 },
} as const;

type Corner = (typeof CORNERS)[number][0];
type Handle = {
  key: string;
  corner: Corner;
  edge: "top" | "right" | "bottom" | "left";
  label: string;
  vertical: boolean;
  reverse: boolean;
};

export default function BorderRadiusWorkspace(props: WorkspaceProps) {
  const shapeRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    key: string;
    pointerId: number;
    start: number;
    position: number;
    moved: boolean;
    settings: Record<string, unknown>;
  } | null>(null);
  const [bounds, setBounds] = useState({ width: 300, height: 180 });
  const [dimensionDrafts, setDimensionDrafts] = useState<Record<string, string>>({});
  const measurePreview = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setBounds({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const number = (key: string, fallback: number) => Number(props.settings[key] ?? fallback);
  const unit = String(props.settings.unit ?? "px");
  const linked = props.settings.linked !== false;
  const elliptical = props.settings.elliptical === true;
  const width = number("width", 280);
  const height = number("height", 200);
  const selectedPreset =
    linked && !elliptical
      ? Object.entries(PRESETS).find(
          ([, value]) =>
            unit === value.unit &&
            width === value.width &&
            height === value.height &&
            CORNERS.every(([key]) => number(key, 16) === value.radius),
        )?.[0]
      : undefined;
  const scale = Math.min(1, Math.max(1, bounds.width - 56) / width, Math.max(1, bounds.height - 56) / height);
  const pixelsPerUnit = (vertical: boolean) =>
    unit === "%" ? (vertical ? height : width) / 100 : unit === "rem" ? number("rootFontSize", 16) : 1;
  const cssOrder = ["topLeft", "topRight", "bottomRight", "bottomLeft"];
  const previewRadius = `${cssOrder.map((key) => `${number(key, 16) * pixelsPerUnit(false)}px`).join(" ")} / ${cssOrder.map((key) => `${number(elliptical ? `${key}Y` : key, 16) * pixelsPerUnit(true)}px`).join(" ")}`;
  const handles: Handle[] = [
    { key: "topLeft", corner: "topLeft", edge: "top", label: "Top X", vertical: false, reverse: false },
    {
      key: elliptical ? "topRightY" : "topRight",
      corner: "topRight",
      edge: "right",
      label: "Right Y",
      vertical: true,
      reverse: false,
    },
    { key: "bottomRight", corner: "bottomRight", edge: "bottom", label: "Bottom X", vertical: false, reverse: true },
    {
      key: elliptical ? "bottomLeftY" : "bottomLeft",
      corner: "bottomLeft",
      edge: "left",
      label: "Left Y",
      vertical: true,
      reverse: true,
    },
  ];
  function handleMaximum(handle: Handle) {
    return (handle.vertical ? height : width) / pixelsPerUnit(handle.vertical);
  }
  function changeHandle(handle: Handle, value: number) {
    if (props.disabled || !Number.isFinite(value)) return;
    changeCorner(
      handle.corner,
      Number(Math.min(handleMaximum(handle), Math.max(0, value)).toFixed(4)),
      elliptical && handle.vertical,
    );
  }
  function moveHandle(event: PointerEvent<HTMLButtonElement>, handle: Handle) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || drag.key !== handle.key) return;
    const coordinate = handle.vertical ? event.clientY : event.clientX;
    if (!drag.moved && coordinate === drag.start) return;
    const rect = shapeRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return;
    drag.moved = true;
    const extent = handle.vertical ? height : width;
    const renderedExtent = handle.vertical ? rect.height : rect.width;
    const delta = ((coordinate - drag.start) * extent) / renderedExtent / pixelsPerUnit(handle.vertical);
    changeHandle(handle, drag.position + delta * (handle.reverse ? -1 : 1));
  }

  function patch(values: Record<string, unknown>) {
    for (const [key, value] of Object.entries(values)) props.onSettingChange(key, value);
  }
  function changeCorner(key: string, value: number, vertical = false) {
    if (!Number.isFinite(value)) return;
    const next = Math.min(10000, Math.max(0, value));
    if (linked) for (const [corner] of CORNERS) props.onSettingChange(`${corner}${vertical ? "Y" : ""}`, next);
    else props.onSettingChange(`${key}${vertical ? "Y" : ""}`, next);
  }
  function preset(kind: keyof typeof PRESETS) {
    setDimensionDrafts({});
    const { radius: value, ...settings } = PRESETS[kind];
    patch({
      ...settings,
      linked: true,
      elliptical: false,
      rootFontSize: 16,
    });
    for (const [corner] of CORNERS) patch({ [corner]: value, [`${corner}Y`]: value });
  }
  function cornerControl(key: string, label: string, rotation: string) {
    return (
      <div
        className={elliptical ? "grid w-32 grid-cols-1 gap-2 sm:w-auto sm:max-w-64 sm:grid-cols-2" : "max-w-32"}
        key={key}
      >
        <Field htmlFor={`radius-${key}`} label={`${label}${elliptical ? " X" : ""}`}>
          <Input
            disabled={props.disabled}
            min={0}
            max={10000}
            step="any"
            type="number"
            leadingIcon={<RadiusCorner className={rotation} />}
            suffix={unit}
            value={number(key, 16)}
            onChange={(event) => changeCorner(key, event.currentTarget.valueAsNumber)}
          />
        </Field>
        {elliptical ? (
          <Field htmlFor={`radius-${key}-y`} label={`${label} Y`}>
            <Input
              disabled={props.disabled}
              min={0}
              max={10000}
              step="any"
              type="number"
              leadingIcon={<RadiusCorner className={rotation} />}
              suffix={unit}
              value={number(`${key}Y`, 16)}
              onChange={(event) => changeCorner(key, event.currentTarget.valueAsNumber, true)}
            />
          </Field>
        ) : null}
      </div>
    );
  }
  function dimension(key: string, label: string, fallback: number, min = 40, max = 1200) {
    function clearDraft() {
      setDimensionDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
    function commit(value: number) {
      if (Number.isFinite(value)) props.onSettingChange(key, Math.min(max, Math.max(min, value)));
      clearDraft();
    }
    return (
      <Field htmlFor={`radius-${key}`} label={label} key={key}>
        <Input
          disabled={props.disabled}
          min={min}
          max={max}
          type="number"
          suffix="px"
          value={dimensionDrafts[key] ?? number(key, fallback)}
          onChange={(event) => {
            const text = event.currentTarget.value;
            setDimensionDrafts((current) => ({ ...current, [key]: text }));
            const next = event.currentTarget.valueAsNumber;
            if (Number.isFinite(next) && next >= min && next <= max) props.onSettingChange(key, next);
          }}
          onBlur={(event) => commit(event.currentTarget.valueAsNumber)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit(event.currentTarget.valueAsNumber);
            } else if (event.key === "Escape") {
              event.preventDefault();
              clearDraft();
            }
          }}
        />
      </Field>
    );
  }

  return (
    <DesignWorkspace
      compactOutput
      workspaceClassName="min-h-[40rem] grid-rows-[minmax(30rem,2fr)_minmax(10rem,1fr)] sm:min-h-[32rem] sm:grid-rows-[minmax(22rem,2fr)_minmax(10rem,1fr)]"
      title="Shape and corners"
      controlTitle="Shape settings"
      previewActions={
        <span className="text-xs text-muted-foreground">
          {width} × {height}px{scale < 0.99 ? " · scaled to fit" : ""}
          {unit === "rem" ? ` · 1rem = ${number("rootFontSize", 16)}px` : ""}
        </span>
      }
      preview={
        <div className="flex h-full min-h-0 flex-col gap-2 p-3">
          <div className="flex justify-between gap-3">
            {CORNERS.slice(0, 2).map(([key, label, rotation]) => cornerControl(key, label, rotation))}
          </div>
          <div className="relative grid min-h-20 flex-1 place-items-center overflow-hidden" ref={measurePreview}>
            <div
              ref={shapeRef}
              className="relative shrink-0 outline outline-1 outline-dashed outline-border/60"
              style={{ width: width * scale, height: height * scale }}
            >
              <div
                role="img"
                aria-label="Border radius shape preview"
                className="absolute left-0 top-0 origin-top-left bg-primary"
                style={{ width, height, borderRadius: previewRadius, transform: `scale(${scale})` }}
              />
              <TooltipProvider>
                {handles.map((handle) => {
                  const { key, label, vertical, edge, reverse } = handle;
                  const value = number(key, 16);
                  const rawPosition = Math.min(100, Math.max(0, (value / handleMaximum(handle)) * 100));
                  const position = reverse ? 100 - rawPosition : rawPosition;
                  return (
                    <Tooltip key={key}>
                      <TooltipTrigger asChild>
                        <CanvasHandle
                          role="slider"
                          aria-label={`${label} handle`}
                          aria-describedby="radius-handle-help"
                          aria-valuemin={0}
                          aria-valuemax={Math.max(value, handleMaximum(handle))}
                          aria-valuenow={value}
                          aria-valuetext={`${value}${unit}`}
                          aria-orientation={vertical ? "vertical" : "horizontal"}
                          variant="subtle"
                          edge={edge}
                          disabled={props.disabled}
                          className={
                            vertical
                              ? "cursor-ns-resize active:cursor-ns-resize"
                              : "cursor-ew-resize active:cursor-ew-resize"
                          }
                          style={{
                            left: vertical ? (edge === "left" ? 0 : "100%") : `${position}%`,
                            top: vertical ? `${position}%` : edge === "top" ? 0 : "100%",
                          }}
                          onPointerDown={(event) => {
                            if (!event.isPrimary || event.button !== 0 || props.disabled || dragRef.current) return;
                            if (!shapeRef.current) return;
                            event.preventDefault();
                            event.currentTarget.focus({ preventScroll: true });
                            event.currentTarget.setPointerCapture(event.pointerId);
                            dragRef.current = {
                              key,
                              pointerId: event.pointerId,
                              start: vertical ? event.clientY : event.clientX,
                              position: Math.min(value, handleMaximum(handle)),
                              moved: false,
                              settings: {
                                ...Object.fromEntries(
                                  CORNERS.flatMap(([corner]) => [
                                    [corner, number(corner, 16)],
                                    [`${corner}Y`, number(`${corner}Y`, 16)],
                                  ]),
                                ),
                                linked,
                                elliptical,
                              },
                            };
                          }}
                          onPointerMove={(event) => moveHandle(event, handle)}
                          onPointerUp={(event) => {
                            if (dragRef.current?.pointerId !== event.pointerId || dragRef.current.key !== key) return;
                            if (dragRef.current.moved) moveHandle(event, handle);
                            if (event.currentTarget.hasPointerCapture(event.pointerId))
                              event.currentTarget.releasePointerCapture(event.pointerId);
                            dragRef.current = null;
                          }}
                          onPointerCancel={(event) => {
                            if (dragRef.current?.pointerId !== event.pointerId || dragRef.current.key !== key) return;
                            patch(dragRef.current.settings);
                            dragRef.current = null;
                          }}
                          onLostPointerCapture={(event) => {
                            if (dragRef.current?.pointerId !== event.pointerId || dragRef.current.key !== key) return;
                            dragRef.current = null;
                          }}
                          onKeyDown={(event) => {
                            const step = (event.shiftKey ? 10 : 1) * (reverse ? -1 : 1);
                            const increaseKey = vertical ? "ArrowDown" : "ArrowRight";
                            const decreaseKey = vertical ? "ArrowUp" : "ArrowLeft";
                            const next =
                              event.key === "Home"
                                ? 0
                                : event.key === "End"
                                  ? handleMaximum(handle)
                                  : event.key === increaseKey
                                    ? value + step
                                    : event.key === decreaseKey
                                      ? value - step
                                      : undefined;
                            if (next !== undefined) {
                              event.preventDefault();
                              changeHandle(handle, next);
                            } else if (event.key === "Escape" && dragRef.current?.key === key) {
                              patch(dragRef.current.settings);
                              if (event.currentTarget.hasPointerCapture(dragRef.current.pointerId))
                                event.currentTarget.releasePointerCapture(dragRef.current.pointerId);
                              dragRef.current = null;
                            }
                          }}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        {label}: {value}
                        {unit}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </TooltipProvider>
            </div>
          </div>
          <div className="flex justify-between gap-3">
            {CORNERS.slice(2).map(([key, label, rotation]) => cornerControl(key, label, rotation))}
          </div>
          <p id="radius-handle-help" className="text-xs text-muted-foreground">
            Drag top and bottom handles horizontally, and side handles vertically. Use arrow keys for fine adjustments.
            {linked ? " Corners are linked." : ""}
          </p>
        </div>
      }
      controls={
        <>
          <ButtonGroup aria-label="Shape presets">
            {(["card", "pill", "circle"] as const).map((name) => (
              <Button
                disabled={props.disabled}
                key={name}
                variant={selectedPreset === name ? "default" : "outline"}
                aria-pressed={selectedPreset === name}
                size="sm"
                onClick={() => preset(name)}
              >
                {name[0].toUpperCase() + name.slice(1)}
              </Button>
            ))}
          </ButtonGroup>
          <Checkbox
            disabled={props.disabled}
            checked={linked}
            label="Link corners"
            description="Editing one corner updates the others."
            onCheckedChange={(checked) => {
              props.onSettingChange("linked", Boolean(checked));
              if (checked)
                for (const [key] of CORNERS)
                  patch({ [key]: number("topLeft", 16), [`${key}Y`]: number("topLeftY", 16) });
            }}
          />
          <Field htmlFor="radius-unit" label="Radius unit">
            <Select
              disabled={props.disabled}
              value={unit}
              onChange={(event) => props.onSettingChange("unit", event.target.value)}
            >
              {["px", "%", "rem"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            {dimension("width", "Preview width", 280)}
            {dimension("height", "Preview height", 200)}
          </div>
          {unit === "rem" ? dimension("rootFontSize", "Root font size", 16, 1, 100) : null}
          <Checkbox
            disabled={props.disabled}
            checked={elliptical}
            label="Elliptical corners"
            description="Set horizontal (X) and vertical (Y) radii separately."
            onCheckedChange={(checked) => {
              props.onSettingChange("elliptical", Boolean(checked));
              if (checked) for (const [key] of CORNERS) props.onSettingChange(`${key}Y`, number(key, 16));
            }}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            Percentages use the shape’s width for X and height for Y. Preview dimensions are not included in the CSS.
          </p>
          <Button className="self-start" disabled={props.disabled} variant="outline" onClick={() => preset("card")}>
            Reset shape
          </Button>
        </>
      }
      output={
        <ResultSurface
          error={props.error}
          result={props.running || props.error ? null : props.result}
          retainedResult={props.result}
          running={props.running}
          spec={props.spec}
          title="Border radius CSS"
        />
      }
    />
  );
}
