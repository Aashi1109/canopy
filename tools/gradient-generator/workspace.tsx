"use client";

import { GripVertical, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { DesignRange, DesignWorkspace } from "@/app/devtools/components/color-design/DesignWorkspace";
import { ResultSurface } from "@/components/ResultSurface";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import {
  Button,
  Caption,
  CheckboxControl as Checkbox,
  ColorControl,
  ColorSwatch,
  FieldRoot as Field,
  FieldLabel,
  FieldTitle,
  Input,
  OrderableList,
  Select,
} from "@/components/ui/index.tsx";
import { DEFAULT_STOPS, gradientValue, readStops, type GradientStop } from "./model";

const PRESETS = {
  "Blue to purple": DEFAULT_STOPS,
  Sunset: [
    { id: "sun-1", color: "#fb7185", position: 0 },
    { id: "sun-2", color: "#fbbf24", position: 50 },
    { id: "sun-3", color: "#7c3aed", position: 100 },
  ],
  Ocean: [
    { id: "sea-1", color: "#0f172a", position: 0 },
    { id: "sea-2", color: "#0284c7", position: 55 },
    { id: "sea-3", color: "#67e8f9", position: 100 },
  ],
};

export default function GradientGeneratorWorkspace(props: WorkspaceProps) {
  const [selectedId, setSelectedId] = useState("start");
  let stops: GradientStop[];
  try {
    stops =
      typeof props.settings.stops === "string" && props.settings.stops.trim()
        ? readStops(props.settings.stops)
        : DEFAULT_STOPS.map((stop, index) => ({
            ...stop,
            color: (index === 0 ? props.input.text : props.input.secondary) || stop.color,
          }));
  } catch {
    stops = DEFAULT_STOPS;
  }
  const currentPreset =
    Object.entries(PRESETS).find(
      ([, presetStops]) =>
        stops.length === presetStops.length &&
        stops.every(
          (stop, index) =>
            stop.position === presetStops[index].position &&
            stop.color.trim().toLowerCase() === presetStops[index].color.toLowerCase(),
        ),
    )?.[0] ?? "";
  const selected = stops.find((stop) => stop.id === selectedId) ?? stops[0];
  const type = props.settings.type === "radial" ? "radial" : "linear";
  let preview = "";
  try {
    preview = gradientValue(props.input.text || stops[0].color, props.input.secondary || stops.at(-1)!.color, {
      ...props.settings,
      stops: JSON.stringify(stops),
    }).value;
  } catch {
    /* Invalid edits leave the preview empty until corrected. */
  }

  function save(next: GradientStop[]) {
    props.onInputChange({ ...props.input, text: next[0].color, secondary: next.at(-1)!.color });
    props.onSettingChange("stops", JSON.stringify(next));
  }
  function update(patch: Partial<GradientStop>) {
    save(stops.map((stop) => (stop.id === selected.id ? { ...stop, ...patch } : stop)));
  }
  function setting(key: string, value: unknown) {
    if (!props.input.text || !props.input.secondary) save(stops);
    props.onSettingChange(key, value);
  }
  function preset(next: GradientStop[]) {
    save(next);
    setSelectedId(next[0].id);
  }
  function reset() {
    preset(DEFAULT_STOPS);
    props.onSettingChange("type", "linear");
    props.onSettingChange("angle", 135);
    props.onSettingChange("radialShape", "circle");
    props.onSettingChange("radialX", 50);
    props.onSettingChange("radialY", 50);
    props.onSettingChange("includeFallback", false);
  }

  return (
    <DesignWorkspace
      compactOutput
      title="Gradient preview"
      controlTitle="Gradient"
      previewActions={
        <Button disabled={props.disabled} onClick={reset} size="sm" variant="ghost">
          <RotateCcw />
          Reset
        </Button>
      }
      preview={
        <div className="flex h-full min-h-0 flex-col gap-3 p-4">
          <div
            aria-label="Live gradient preview"
            className="min-h-32 flex-1 rounded-lg border border-border"
            role="img"
            style={{ backgroundImage: preview || undefined }}
          />
          <Caption>
            {preview
              ? "Select a stop, then adjust its color and position."
              : "Correct the selected color to restore the preview."}
          </Caption>
          {!props.input.text && (
            <Button
              className="self-start"
              disabled={props.disabled}
              onClick={() => preset(DEFAULT_STOPS)}
              variant="outline"
            >
              Use these colors
            </Button>
          )}
        </div>
      }
      output={
        <ResultSurface
          error={props.error}
          result={props.running || props.error ? null : props.result}
          retainedResult={props.result}
          running={props.running}
          spec={props.spec}
          title="CSS"
        />
      }
      controls={
        <>
          <Field>
            <FieldLabel htmlFor="gradient-preset">Preset</FieldLabel>
            <Select
              disabled={props.disabled}
              id="gradient-preset"
              onChange={(event) => {
                const next = PRESETS[event.target.value as keyof typeof PRESETS];
                if (next) preset(next);
              }}
              value={currentPreset}
            >
              <option value="" disabled>
                Custom
              </option>
              {Object.keys(PRESETS).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="gradient-type">Type</FieldLabel>
            <Select
              disabled={props.disabled}
              id="gradient-type"
              value={type}
              onChange={(event) => setting("type", event.target.value)}
            >
              <option value="linear">Linear</option>
              <option value="radial">Radial</option>
            </Select>
          </Field>
          {type === "linear" ? (
            <DesignRange
              disabled={props.disabled}
              label="Angle"
              value={Number(props.settings.angle ?? 135)}
              min={0}
              max={360}
              suffix="°"
              onChange={(value) => setting("angle", value)}
            />
          ) : (
            <>
              <Field>
                <FieldLabel htmlFor="gradient-shape">Shape</FieldLabel>
                <Select
                  disabled={props.disabled}
                  id="gradient-shape"
                  value={String(props.settings.radialShape ?? "circle")}
                  onChange={(event) => setting("radialShape", event.target.value)}
                >
                  <option value="circle">Circle</option>
                  <option value="ellipse">Ellipse</option>
                </Select>
              </Field>
              <Field aria-labelledby="gradient-center-label">
                <FieldTitle id="gradient-center-label">Center</FieldTitle>
                <div className="grid grid-cols-2 gap-2">
                  {(["X", "Y"] as const).map((axis) => (
                    <Input
                      aria-label={`Center ${axis} value`}
                      disabled={props.disabled}
                      key={axis}
                      leadingIcon={axis}
                      max={100}
                      min={0}
                      step={1}
                      suffix="%"
                      type="number"
                      value={Number(props.settings[`radial${axis}`] ?? 50)}
                      onChange={(event) => {
                        const next = event.target.valueAsNumber;
                        if (Number.isFinite(next)) setting(`radial${axis}`, Math.max(0, Math.min(100, next)));
                      }}
                    />
                  ))}
                </div>
              </Field>
            </>
          )}
          <div className="flex items-center justify-between gap-2">
            <FieldLabel>Color stops · {stops.length}/12</FieldLabel>
            <Button
              disabled={props.disabled || stops.length >= 12}
              size="sm"
              variant="outline"
              onClick={() => {
                const stop = {
                  id: crypto.randomUUID(),
                  color: selected.color,
                  position: Math.min(100, selected.position + 10),
                };
                save([...stops, stop]);
                setSelectedId(stop.id);
              }}
            >
              <Plus />
              Add
            </Button>
          </div>
          <OrderableList
            animateSelection
            ariaLabel="Gradient stops"
            className="flex flex-col gap-1"
            disabled={props.disabled}
            getId={(stop) => stop.id}
            getLabel={(stop) => `Color stop at ${stop.position}%`}
            items={stops}
            selectedId={selected.id}
            onReorder={(next) => {
              const positions = stops.map((stop) => stop.position).sort((a, b) => a - b);
              save(next.map((stop, index) => ({ ...stop, position: positions[index] })));
            }}
            renderItem={(stop, state) => (
              <div className="flex min-w-0 items-center gap-1 p-1">
                <Button
                  {...state.attributes}
                  {...state.listeners}
                  aria-label={`Reorder color stop at ${stop.position}%`}
                  disabled={state.disabled}
                  ref={state.setActivatorNodeRef}
                  size="icon-sm"
                  variant="ghost"
                >
                  <GripVertical />
                </Button>
                <Button
                  aria-pressed={selected.id === stop.id}
                  className="min-w-0 flex-1 justify-start"
                  disabled={props.disabled}
                  onClick={() => setSelectedId(stop.id)}
                  size="sm"
                  variant="card-action"
                >
                  <ColorSwatch className="size-5 shrink-0" color={stop.color} />
                  <span className="truncate">{stop.color}</span>
                  <span className="ml-auto shrink-0">{stop.position}%</span>
                  {selected.id === stop.id ? (
                    <Caption aria-hidden="true" className="shrink-0 text-primary">
                      Editing
                    </Caption>
                  ) : null}
                </Button>
                <Button
                  aria-label={`Remove color stop at ${stop.position}%`}
                  disabled={props.disabled || stops.length <= 2}
                  onClick={() => save(stops.filter((item) => item.id !== stop.id))}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Trash2 />
                </Button>
              </div>
            )}
          />
          <ColorControl
            disabled={props.disabled}
            label="Selected stop color"
            layout="inline"
            value={selected.color}
            onChange={(color) => update({ color })}
          />
          <DesignRange
            disabled={props.disabled}
            label="Stop position"
            value={selected.position}
            min={0}
            max={100}
            suffix="%"
            onChange={(position) => update({ position })}
          />
          <Button
            disabled={props.disabled}
            onClick={() => save([...stops].reverse().map((stop) => ({ ...stop, position: 100 - stop.position })))}
            variant="outline"
          >
            Reverse gradient
          </Button>
          <Field orientation="horizontal">
            <Checkbox
              checked={Boolean(props.settings.includeFallback)}
              disabled={props.disabled}
              id="gradient-fallback"
              onCheckedChange={(checked) => setting("includeFallback", checked === true)}
            />
            <FieldLabel htmlFor="gradient-fallback">Include solid-color fallback</FieldLabel>
          </Field>
          <Caption>Drag handles or press Space, use arrow keys, and press Space again to reorder stops.</Caption>
        </>
      }
    />
  );
}
