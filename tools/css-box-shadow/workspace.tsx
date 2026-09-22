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
  OrderableList,
  Select,
  Textarea,
} from "@/components/ui/index.tsx";
import { parseColor, rgbToHex } from "@/lib/devtools/shared/color";
import { DEFAULT_LAYER, readLayers, shadowValue, type ShadowLayer } from "./model";

const PRESETS: Record<string, ShadowLayer[]> = {
  Soft: [DEFAULT_LAYER],
  Layered: [
    { ...DEFAULT_LAYER, id: "near", y: 2, blur: 4, spread: -1, color: "#0f172a1a" },
    { ...DEFAULT_LAYER, id: "far", y: 16, blur: 32, spread: -8, color: "#0f172a33" },
  ],
  Inset: [{ ...DEFAULT_LAYER, inset: true, y: 3, blur: 8, spread: -1 }],
  Hard: [{ ...DEFAULT_LAYER, x: 8, y: 8, blur: 0, spread: 0, color: "#2563eb" }],
};
const LENGTHS = [
  { key: "x", label: "Horizontal offset", min: -100, max: 100 },
  { key: "y", label: "Vertical offset", min: -100, max: 100 },
  { key: "blur", label: "Blur", min: 0, max: 200 },
  { key: "spread", label: "Spread", min: -100, max: 100 },
] as const;

export default function BoxShadowWorkspace(props: WorkspaceProps) {
  const [selectedId, setSelectedId] = useState(DEFAULT_LAYER.id);
  let layers: ShadowLayer[];
  try {
    layers =
      typeof props.settings.layers === "string" && props.settings.layers.trim()
        ? readLayers(props.settings.layers)
        : [
            {
              ...DEFAULT_LAYER,
              color: props.input.text || DEFAULT_LAYER.color,
              x: Number(props.settings.x ?? 0),
              y: Number(props.settings.y ?? 12),
              blur: Number(props.settings.blur ?? 30),
              spread: Number(props.settings.spread ?? -8),
              inset: Boolean(props.settings.inset),
            },
          ];
  } catch {
    layers = [DEFAULT_LAYER];
  }
  const selected = layers.find((layer) => layer.id === selectedId) ?? layers[0];
  let preview = "none";
  try {
    preview = shadowValue(props.input.text || DEFAULT_LAYER.color, {
      ...props.settings,
      layers: JSON.stringify(layers),
    });
  } catch {
    /* Runtime reports invalid edits beside the generated output. */
  }
  function safeColor(value: unknown, fallback: string) {
    try {
      return rgbToHex(parseColor(String(value ?? fallback)));
    } catch {
      return fallback;
    }
  }
  function save(next: ShadowLayer[]) {
    props.onInputChange({ ...props.input, text: next[0].color });
    props.onSettingChange("layers", JSON.stringify(next));
  }
  function update(patch: Partial<ShadowLayer>) {
    save(layers.map((layer) => (layer.id === selected.id ? { ...layer, ...patch } : layer)));
  }
  function setting(key: string, value: unknown) {
    if (!props.input.text) save(layers);
    props.onSettingChange(key, value);
  }
  function preset(next: ShadowLayer[]) {
    save(next);
    setSelectedId(next[0].id);
    props.onSettingChange("additionalLayers", "");
  }
  function reset() {
    preset([DEFAULT_LAYER]);
    props.onSettingChange("previewBackground", "#f1f5f9");
    props.onSettingChange("previewObject", "#ffffff");
    props.onSettingChange("linkOpacity", false);
    props.onSettingChange("showBrowserPrefixes", false);
  }

  return (
    <DesignWorkspace
      compactOutput
      title="Shadow preview"
      controlTitle="Shadow layers"
      previewActions={
        <Button disabled={props.disabled} onClick={reset} size="sm" variant="ghost">
          <RotateCcw />
          Reset
        </Button>
      }
      preview={
        <div className="flex h-full min-h-0 flex-col">
          <div
            className="grid min-h-48 flex-1 place-items-center overflow-auto p-16"
            style={{ backgroundColor: safeColor(props.settings.previewBackground, "#f1f5f9") }}
          >
            <div
              aria-label="Object with the generated box shadow"
              className="h-28 w-44 shrink-0 rounded-xl"
              role="img"
              style={{ backgroundColor: safeColor(props.settings.previewObject, "#ffffff"), boxShadow: preview }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 p-3">
            <Caption>
              {layers.filter((layer) => layer.enabled).length} enabled layers · first layer paints on top
            </Caption>
            {!props.input.text && (
              <Button disabled={props.disabled} onClick={() => preset([DEFAULT_LAYER])} size="sm" variant="outline">
                Use this shadow
              </Button>
            )}
          </div>
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
            <FieldLabel htmlFor="shadow-preset">Preset</FieldLabel>
            <Select
              disabled={props.disabled}
              id="shadow-preset"
              value=""
              onChange={(event) => {
                const next = PRESETS[event.target.value];
                if (next) preset(next);
              }}
            >
              <option value="">Choose a starting point</option>
              {Object.keys(PRESETS).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel>Layers · {layers.length}/12</FieldLabel>
            <Button
              disabled={props.disabled || layers.length >= 12}
              onClick={() => {
                const layer = { ...selected, id: crypto.randomUUID(), enabled: true };
                save([...layers, layer]);
                setSelectedId(layer.id);
              }}
              size="sm"
              variant="outline"
            >
              <Plus />
              Add
            </Button>
          </div>
          <OrderableList
            ariaLabel="Shadow layers"
            className="flex flex-col gap-2"
            disabled={props.disabled}
            getId={(layer) => layer.id}
            getLabel={(layer) => `Shadow layer ${layers.indexOf(layer) + 1}`}
            items={layers}
            onReorder={save}
            renderItem={(layer, state) => (
              <div className="flex min-w-0 items-center gap-2">
                <Button
                  {...state.attributes}
                  {...state.listeners}
                  aria-label={`Reorder shadow layer ${layers.indexOf(layer) + 1}`}
                  disabled={state.disabled}
                  ref={state.setActivatorNodeRef}
                  size="icon-sm"
                  variant="ghost"
                >
                  <GripVertical />
                </Button>
                <Checkbox
                  aria-label={`Enable shadow layer ${layers.indexOf(layer) + 1}`}
                  checked={layer.enabled}
                  disabled={props.disabled}
                  onCheckedChange={(checked) =>
                    save(layers.map((item) => (item.id === layer.id ? { ...item, enabled: checked === true } : item)))
                  }
                />
                <Button
                  aria-pressed={selected.id === layer.id}
                  className="min-w-0 flex-1 justify-start"
                  disabled={props.disabled}
                  onClick={() => setSelectedId(layer.id)}
                  size="sm"
                  variant={selected.id === layer.id ? "secondary" : "ghost"}
                >
                  <ColorSwatch className="size-5 shrink-0" color={layer.color} />
                  <span className="truncate">
                    Layer {layers.indexOf(layer) + 1}
                    {layer.inset ? " · inset" : ""}
                  </span>
                </Button>
                <Button
                  aria-label={`Remove shadow layer ${layers.indexOf(layer) + 1}`}
                  disabled={props.disabled || layers.length <= 1}
                  onClick={() => save(layers.filter((item) => item.id !== layer.id))}
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
            label="Selected shadow color"
            value={selected.color}
            onChange={(color) => update({ color })}
          />
          {LENGTHS.map(({ key, label, min, max }) => (
            <DesignRange
              disabled={props.disabled}
              key={key}
              label={label}
              value={selected[key]}
              min={min}
              max={max}
              suffix="px"
              onChange={(value) => update({ [key]: value })}
            />
          ))}
          <Field orientation="horizontal">
            <Checkbox
              checked={selected.inset}
              disabled={props.disabled}
              id="shadow-inset"
              onCheckedChange={(checked) => update({ inset: checked === true })}
            />
            <FieldLabel htmlFor="shadow-inset">Inset shadow</FieldLabel>
          </Field>
          <details>
            <summary className="cursor-pointer font-caption text-sm font-medium">Preview colors</summary>
            <div className="mt-4 flex flex-col gap-4">
              <ColorControl
                disabled={props.disabled}
                label="Background"
                value={String(props.settings.previewBackground ?? "#f1f5f9")}
                onChange={(value) => setting("previewBackground", value)}
              />
              <ColorControl
                disabled={props.disabled}
                label="Object"
                value={String(props.settings.previewObject ?? "#ffffff")}
                onChange={(value) => setting("previewObject", value)}
              />
            </div>
          </details>
          <details>
            <summary className="cursor-pointer font-caption text-sm font-medium">Advanced CSS layers</summary>
            <div className="mt-4 flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor="shadow-extra">Additional layers</FieldLabel>
                <Textarea
                  disabled={props.disabled}
                  id="shadow-extra"
                  rows={4}
                  value={String(props.settings.additionalLayers ?? "")}
                  onChange={(event) => setting("additionalLayers", event.target.value)}
                />
                <Caption>
                  One shadow per line. Use two to four pixel lengths, optional inset, and HEX or comma-separated
                  rgb()/rgba().
                </Caption>
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  checked={Boolean(props.settings.linkOpacity)}
                  disabled={props.disabled}
                  id="shadow-link"
                  onCheckedChange={(checked) => setting("linkOpacity", checked === true)}
                />
                <FieldLabel htmlFor="shadow-link">Use first enabled layer opacity for extra rgba() layers</FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  checked={Boolean(props.settings.showBrowserPrefixes)}
                  disabled={props.disabled}
                  id="shadow-prefixes"
                  onCheckedChange={(checked) => setting("showBrowserPrefixes", checked === true)}
                />
                <FieldLabel htmlFor="shadow-prefixes">Include WebKit prefix</FieldLabel>
              </Field>
            </div>
          </details>
          <Caption>Drag handles or press Space, use arrow keys, and press Space again to reorder layers.</Caption>
        </>
      }
    />
  );
}
