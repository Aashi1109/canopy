"use client";
import { useTranslations as useToolTranslations } from "next-intl";

import { GripVertical, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { DesignWorkspace } from "@/app/devtools/components/color-design/DesignWorkspace";
import { ResultSurface } from "@/components/ResultSurface";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
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
  { key: "blur", label: "Blur", min: 0, max: 200 },
  { key: "spread", label: "Spread", min: -100, max: 100 },
] as const;

export default function BoxShadowWorkspace(props: WorkspaceProps) {
  const toolText = useToolTranslations("Tool.runtime");
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
      title={toolText("workspace.shadow_preview_ea1c1a")}
      controlTitle={toolText("workspace.shadowLayers")}
      previewActions={
        <Button disabled={props.disabled} onClick={reset} size="sm" variant="ghost">
          <RotateCcw />
          {toolText("workspace.reset_daee76")}
        </Button>
      }
      preview={
        <div className="flex h-full min-h-0 flex-col">
          <div
            className="grid min-h-48 flex-1 place-items-center overflow-auto p-16"
            style={{ backgroundColor: safeColor(props.settings.previewBackground, "#f1f5f9") }}
          >
            <div
              aria-label={toolText("workspace.object_with_the_1ac233")}
              className="h-28 w-44 shrink-0 rounded-xl"
              role="img"
              style={{ backgroundColor: safeColor(props.settings.previewObject, "#ffffff"), boxShadow: preview }}
            />
          </div>
          {!props.input.text && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-3">
              <Button disabled={props.disabled} onClick={() => preset([DEFAULT_LAYER])} size="sm" variant="outline">
                {toolText("workspace.use_this_shadow_2aebea")}
              </Button>
            </div>
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
            <FieldLabel htmlFor="shadow-preset">{toolText("workspace.preset_7252e7")}</FieldLabel>
            <Select
              disabled={props.disabled}
              id="shadow-preset"
              value=""
              onChange={(event) => {
                const next = PRESETS[event.target.value];
                if (next) preset(next);
              }}
            >
              <option value="">{toolText("workspace.choose_a_starting_a136fd")}</option>
              {Object.keys(PRESETS).map((name) => (
                <option key={name} value={name}>
                  {toolText(`workspace.presets.${name}`)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel>{toolText("workspace.layerCount", { count: layers.length })}</FieldLabel>
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
              {toolText("workspace.add_9fd728")}
            </Button>
          </div>
          <OrderableList
            animateSelection
            ariaLabel={toolText("workspace.shadowLayers")}
            className="flex flex-col gap-1"
            disabled={props.disabled}
            getId={(layer) => layer.id}
            getLabel={(layer) => toolText("workspace.shadowLayer", { number: layers.indexOf(layer) + 1 })}
            items={layers}
            selectedId={selected.id}
            onReorder={save}
            renderItem={(layer, state) => (
              <div className="flex min-w-0 items-center gap-1 p-1">
                <Button
                  {...state.attributes}
                  {...state.listeners}
                  aria-label={toolText("workspace.reorderLayer", { number: layers.indexOf(layer) + 1 })}
                  disabled={state.disabled}
                  ref={state.setActivatorNodeRef}
                  size="icon-sm"
                  variant="ghost"
                >
                  <GripVertical />
                </Button>
                <Checkbox
                  aria-label={toolText("workspace.enableLayer", { number: layers.indexOf(layer) + 1 })}
                  checked={layer.enabled}
                  disabled={props.disabled}
                  onCheckedChange={(checked) =>
                    save(layers.map((item) => (item.id === layer.id ? { ...item, enabled: checked === true } : item)))
                  }
                />
                <Button
                  aria-label={toolText("workspace.editLayer", { number: layers.indexOf(layer) + 1 })}
                  aria-pressed={selected.id === layer.id}
                  className="min-w-0 flex-1 justify-start"
                  disabled={props.disabled}
                  onClick={() => setSelectedId(layer.id)}
                  size="sm"
                  variant="card-action"
                >
                  <ColorSwatch className="size-5 shrink-0" color={layer.color} />
                  <span className="min-w-0 truncate">
                    {toolText("workspace.layerName", {
                      number: layers.indexOf(layer) + 1,
                      inset: layer.inset ? "yes" : "no",
                    })}
                  </span>
                  {selected.id === layer.id ? (
                    <Caption aria-hidden="true" className="ml-auto shrink-0 text-primary">
                      {toolText("workspace.editing_fab453")}
                    </Caption>
                  ) : null}
                </Button>
                <Button
                  aria-label={toolText("workspace.removeLayer", { number: layers.indexOf(layer) + 1 })}
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
            label={toolText("workspace.selected_shadow_color_fee0dd")}
            layout="inline"
            value={selected.color}
            onChange={(color) => update({ color })}
          />
          <Field aria-labelledby="shadow-offset-label">
            <FieldTitle id="shadow-offset-label">{toolText("workspace.offset_b1a1e8")}</FieldTitle>
            <div className="grid grid-cols-2 gap-2">
              {(["x", "y"] as const).map((key) => (
                <Input
                  aria-label={toolText(key === "x" ? "workspace.horizontalOffset" : "workspace.verticalOffset")}
                  disabled={props.disabled}
                  key={key}
                  leadingIcon={key.toUpperCase()}
                  max={100}
                  min={-100}
                  step={1}
                  suffix="px"
                  type="number"
                  value={selected[key]}
                  onChange={(event) => {
                    const next = event.target.valueAsNumber;
                    if (Number.isFinite(next)) update({ [key]: Math.max(-100, Math.min(100, next)) });
                  }}
                />
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            {LENGTHS.map(({ key, label, min, max }) => (
              <Field key={key}>
                <FieldLabel htmlFor={`shadow-${key}`}>{toolText(`workspace.lengths.${key}`)}</FieldLabel>
                <Input
                  disabled={props.disabled}
                  id={`shadow-${key}`}
                  leadingIcon={label[0]}
                  max={max}
                  min={min}
                  step={1}
                  suffix="px"
                  type="number"
                  value={selected[key]}
                  onChange={(event) => {
                    const next = event.target.valueAsNumber;
                    if (Number.isFinite(next)) update({ [key]: Math.max(min, Math.min(max, next)) });
                  }}
                />
              </Field>
            ))}
          </div>
          <Field orientation="horizontal">
            <Checkbox
              checked={selected.inset}
              disabled={props.disabled}
              id="shadow-inset"
              onCheckedChange={(checked) => update({ inset: checked === true })}
            />
            <FieldLabel htmlFor="shadow-inset">{toolText("workspace.inset_shadow_3baaef")}</FieldLabel>
          </Field>
          <Accordion type="multiple">
            <AccordionItem value="preview-colors">
              <AccordionTrigger>{toolText("workspace.preview_colors_710006")}</AccordionTrigger>
              <AccordionContent className="flex flex-col gap-5">
                <ColorControl
                  disabled={props.disabled}
                  label={toolText("workspace.background_ea2b8a")}
                  layout="inline"
                  value={String(props.settings.previewBackground ?? "#f1f5f9")}
                  onChange={(value) => setting("previewBackground", value)}
                />
                <ColorControl
                  disabled={props.disabled}
                  label={toolText("workspace.object_62a6da")}
                  layout="inline"
                  value={String(props.settings.previewObject ?? "#ffffff")}
                  onChange={(value) => setting("previewObject", value)}
                />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="advanced-layers">
              <AccordionTrigger>{toolText("workspace.advanced_css_layers_291360")}</AccordionTrigger>
              <AccordionContent className="flex flex-col gap-4">
                <Field>
                  <FieldLabel htmlFor="shadow-extra">{toolText("workspace.additional_layers_3940c3")}</FieldLabel>
                  <Textarea
                    disabled={props.disabled}
                    id="shadow-extra"
                    rows={4}
                    value={String(props.settings.additionalLayers ?? "")}
                    onChange={(event) => setting("additionalLayers", event.target.value)}
                  />
                  <Caption>{toolText("workspace.one_shadow_per_987f6b")}</Caption>
                </Field>
                <Field orientation="horizontal">
                  <Checkbox
                    checked={Boolean(props.settings.linkOpacity)}
                    disabled={props.disabled}
                    id="shadow-link"
                    onCheckedChange={(checked) => setting("linkOpacity", checked === true)}
                  />
                  <FieldLabel htmlFor="shadow-link">{toolText("workspace.use_first_enabled_318bdf")}</FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <Checkbox
                    checked={Boolean(props.settings.showBrowserPrefixes)}
                    disabled={props.disabled}
                    id="shadow-prefixes"
                    onCheckedChange={(checked) => setting("showBrowserPrefixes", checked === true)}
                  />
                  <FieldLabel htmlFor="shadow-prefixes">
                    {toolText("workspace.include_webkit_prefix_f1ba8a")}
                  </FieldLabel>
                </Field>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          <Caption>{toolText("workspace.drag_handles_or_a9f0bc")}</Caption>
        </>
      }
    />
  );
}
