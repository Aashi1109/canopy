"use client";
import { useTranslations as useToolTranslations } from "next-intl";

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
  const toolText = useToolTranslations("Tool.runtime");
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
      title={toolText("workspace.gradient_preview_201b51")}
      controlTitle={toolText("workspace.gradient")}
      previewActions={
        <Button disabled={props.disabled} onClick={reset} size="sm" variant="ghost">
          <RotateCcw />
          {toolText("workspace.reset_daee76")}
        </Button>
      }
      preview={
        <div className="flex h-full min-h-0 flex-col gap-3 p-4">
          <div
            aria-label={toolText("workspace.live_gradient_preview_59c765")}
            className="min-h-32 flex-1 rounded-lg border border-border"
            role="img"
            style={{ backgroundImage: preview || undefined }}
          />
          <Caption>
            {preview ? toolText("workspace.select_a_stop_796479") : toolText("workspace.correct_the_selected_d845b2")}
          </Caption>
          {!props.input.text && (
            <Button
              className="self-start"
              disabled={props.disabled}
              onClick={() => preset(DEFAULT_STOPS)}
              variant="outline"
            >
              {toolText("workspace.use_these_colors_ee98d2")}
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
          title={toolText("workspace.css_b581e4")}
        />
      }
      controls={
        <>
          <Field>
            <FieldLabel htmlFor="gradient-preset">{toolText("workspace.preset_7252e7")}</FieldLabel>
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
                {toolText("workspace.custom_494ca7")}
              </option>
              {Object.keys(PRESETS).map((name) => (
                <option key={name} value={name}>
                  {toolText(`workspace.presets.${name}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="gradient-type">{toolText("workspace.type_baaddf")}</FieldLabel>
            <Select
              disabled={props.disabled}
              id="gradient-type"
              value={type}
              onChange={(event) => setting("type", event.target.value)}
            >
              <option value="linear">{toolText("workspace.linear_e6950b")}</option>
              <option value="radial">{toolText("workspace.radial_02693d")}</option>
            </Select>
          </Field>
          {type === "linear" ? (
            <DesignRange
              disabled={props.disabled}
              label={toolText("workspace.angle_196803")}
              value={Number(props.settings.angle ?? 135)}
              min={0}
              max={360}
              suffix="°"
              onChange={(value) => setting("angle", value)}
            />
          ) : (
            <>
              <Field>
                <FieldLabel htmlFor="gradient-shape">{toolText("workspace.shape_e0e492")}</FieldLabel>
                <Select
                  disabled={props.disabled}
                  id="gradient-shape"
                  value={String(props.settings.radialShape ?? "circle")}
                  onChange={(event) => setting("radialShape", event.target.value)}
                >
                  <option value="circle">{toolText("workspace.circle_b93d3b")}</option>
                  <option value="ellipse">{toolText("workspace.ellipse_cb1ee8")}</option>
                </Select>
              </Field>
              <Field aria-labelledby="gradient-center-label">
                <FieldTitle id="gradient-center-label">{toolText("workspace.center_d94606")}</FieldTitle>
                <div className="grid grid-cols-2 gap-2">
                  {(["X", "Y"] as const).map((axis) => (
                    <Input
                      aria-label={toolText("workspace.centerValue", { axis })}
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
            <FieldLabel>{toolText("workspace.stopCount", { count: stops.length })}</FieldLabel>
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
              {toolText("workspace.add_9fd728")}
            </Button>
          </div>
          <OrderableList
            animateSelection
            ariaLabel={toolText("workspace.gradientStops")}
            className="flex flex-col gap-1"
            disabled={props.disabled}
            getId={(stop) => stop.id}
            getLabel={(stop) => toolText("workspace.colorStop", { position: stop.position })}
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
                  aria-label={toolText("workspace.reorderStop", { position: stop.position })}
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
                      {toolText("workspace.editing_fab453")}
                    </Caption>
                  ) : null}
                </Button>
                <Button
                  aria-label={toolText("workspace.removeStop", { position: stop.position })}
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
            label={toolText("workspace.selected_stop_color_fa9570")}
            layout="inline"
            value={selected.color}
            onChange={(color) => update({ color })}
          />
          <DesignRange
            disabled={props.disabled}
            label={toolText("workspace.stop_position_a2b6f9")}
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
            {toolText("workspace.reverse_gradient_9d7833")}
          </Button>
          <Field orientation="horizontal">
            <Checkbox
              checked={Boolean(props.settings.includeFallback)}
              disabled={props.disabled}
              id="gradient-fallback"
              onCheckedChange={(checked) => setting("includeFallback", checked === true)}
            />
            <FieldLabel htmlFor="gradient-fallback">{toolText("workspace.include_solid_color_c5bb47")}</FieldLabel>
          </Field>
          <Caption>{toolText("workspace.drag_handles_or_6b416f")}</Caption>
        </>
      }
    />
  );
}
