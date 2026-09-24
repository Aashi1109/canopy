"use client";

import { useCallback, useState } from "react";
import { SquareRoundCorner } from "lucide-react";

import { DesignWorkspace } from "@/app/devtools/components/color-design/DesignWorkspace";
import { ResultSurface } from "@/components/ResultSurface";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import { Button, ButtonGroup, Checkbox, Field, Input, Select } from "@/components/ui/index.tsx";

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

export default function BorderRadiusWorkspace(props: WorkspaceProps) {
  const [bounds, setBounds] = useState({ width: 300, height: 180 });
  const measurePreview = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setBounds({ width: Math.max(1, entry.contentRect.width - 8), height: Math.max(1, entry.contentRect.height - 8) }),
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
  const scale = Math.min(1, bounds.width / width, bounds.height / height);
  const css = props.result?.render === "text" ? props.result.text : "";
  const radius = css.replace(/^border-radius:\s*/, "").replace(/;$/, "");
  const previewRadius = radius.replace(
    /([\d.]+)rem/g,
    (_, value: string) => `${Number(value) * number("rootFontSize", 16)}px`,
  );

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
      <div className={elliptical ? "grid max-w-64 grid-cols-2 gap-2" : "max-w-32"} key={key}>
        <Field htmlFor={`radius-${key}`} label={`${label}${elliptical ? " X" : ""}`}>
          <Input
            disabled={props.disabled}
            min={0}
            max={10000}
            step="any"
            type="number"
            leadingIcon={<SquareRoundCorner className={rotation} />}
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
              leadingIcon={<SquareRoundCorner className={rotation} />}
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
    return (
      <Field htmlFor={`radius-${key}`} label={label} key={key}>
        <Input
          disabled={props.disabled}
          min={min}
          max={max}
          type="number"
          suffix="px"
          value={number(key, fallback)}
          onChange={(event) => {
            const next = event.currentTarget.valueAsNumber;
            if (Number.isFinite(next)) props.onSettingChange(key, Math.min(max, Math.max(min, next)));
          }}
        />
      </Field>
    );
  }

  return (
    <DesignWorkspace
      compactOutput
      workspaceClassName="min-h-[32rem] grid-rows-[minmax(22rem,2fr)_minmax(10rem,1fr)]"
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
            {radius ? (
              <div
                aria-label="Border radius shape preview"
                role="img"
                className="absolute left-1/2 top-1/2 bg-primary"
                style={{
                  width,
                  height,
                  borderRadius: previewRadius,
                  transform: `translate(-50%, -50%) scale(${scale})`,
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{props.error || "Preparing shape…"}</p>
            )}
          </div>
          <div className="flex justify-between gap-3">
            {CORNERS.slice(2).map(([key, label, rotation]) => cornerControl(key, label, rotation))}
          </div>
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
          <Button disabled={props.disabled} variant="outline" onClick={() => preset("card")}>
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
