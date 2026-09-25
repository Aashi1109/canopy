"use client";

import { useId, useState } from "react";

import { DesignWorkspace } from "@/app/devtools/components/color-design/DesignWorkspace";
import { ResultSurface } from "@/components/ResultSurface";
import { ColorValueList } from "@/app/devtools/components/color-design/ColorValueList";
import { SettingsPanel } from "@/components/SettingsPanel";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import { Button, ColorControl, ColorSwatch, Field, Input } from "@/components/ui/index.tsx";
import { hslToRgb, parseColor, rgbToHex, rgbToHsl, type RgbColor } from "@/lib/devtools/shared/color";

type Channels = [number, number, number];

export default function ColorPickerWorkspace(props: WorkspaceProps) {
  const id = useId();
  const [adjusted, setAdjusted] = useState<{ source: string; values: Channels }>();
  let color: RgbColor | undefined;
  try {
    color = parseColor(props.input.text);
  } catch {
    /* Input remains editable while incomplete. */
  }
  const hex = color ? rgbToHex(color) : "";
  const fallback = color ?? parseColor("#2563eb");
  const derived = rgbToHsl(fallback)
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number) as Channels;
  const channels = adjusted?.source === props.input.text ? adjusted.values : derived;

  const setInput = (text: string) => props.onInputChange({ ...props.input, text });
  const adjust = (index: number, value: string) => {
    const number = Number(value);
    if (value === "" || !Number.isFinite(number) || number < 0 || number > (index === 0 ? 360 : 100)) return;
    const next = [...channels] as Channels;
    next[index] = number;
    const source = rgbToHex(hslToRgb(...next, fallback.alpha));
    // Keep the chosen hue at zero saturation/lightness until it becomes visible.
    setAdjusted({ source, values: next });
    setInput(source);
  };

  return (
    <DesignWorkspace
      title="Choose a color"
      controlTitle="Color and output"
      previewActions={
        <Button disabled={props.disabled} onClick={() => setInput("#2563eb")} size="sm" variant="outline">
          Default blue
        </Button>
      }
      preview={
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 sm:grid-cols-[minmax(8rem,1fr)_minmax(12rem,1fr)]">
          <ColorSwatch
            className="min-h-28"
            color={hex || "transparent"}
            label={hex ? `Selected color ${hex}` : "Choose a color to preview it"}
          />
          <div className="grid content-center gap-3">
            {(["Hue", "Saturation", "Lightness"] as const).map((label, index) => (
              <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-end gap-3" key={label}>
                <Field htmlFor={`${id}-${label}`} label={label}>
                  <Input
                    aria-valuetext={`${channels[index]}${index === 0 ? " degrees" : "%"}`}
                    disabled={props.disabled}
                    id={`${id}-${label}`}
                    max={index === 0 ? 360 : 100}
                    min={0}
                    onChange={(event) => adjust(index, event.target.value)}
                    step={index === 0 ? 1 : 0.1}
                    type="range"
                    value={channels[index]}
                  />
                </Field>
                <Input
                  aria-label={`${label} value`}
                  disabled={props.disabled}
                  max={index === 0 ? 360 : 100}
                  min={0}
                  onChange={(event) => adjust(index, event.target.value)}
                  step={0.1}
                  suffix={index === 0 ? "°" : "%"}
                  type="number"
                  value={Number(channels[index].toFixed(2))}
                />
              </div>
            ))}
          </div>
        </div>
      }
      controls={
        <>
          <ColorControl
            layout="inline"
            disabled={props.disabled}
            label="HEX, RGB, HSL or color name"
            onChange={setInput}
            value={props.input.text}
          />
          <SettingsPanel
            disabled={props.disabled}
            onChange={props.onSettingChange}
            spec={props.spec.settings}
            values={props.settings}
          />
        </>
      }
      output={
        <ResultSurface
          error={props.error}
          renderResult={(result) =>
            result.render === "key-value" ? (
              <ColorValueList entries={result.entries} disabled={Boolean(props.running || props.error)} />
            ) : null
          }
          result={props.running || props.error ? null : props.result}
          retainedResult={props.result}
          running={props.running}
          spec={props.spec}
          title="Copy a color format"
        />
      }
    />
  );
}
