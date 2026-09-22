"use client";

import { useId } from "react";

import { parseColor, rgbToHex, type RgbColor } from "@/lib/devtools/shared/color";
import { ColorSwatch } from "./ColorSwatch.tsx";
import { Field, FieldError, FieldLabel } from "./field.tsx";
import { Input } from "./input.tsx";

export type ColorControlProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
  compact?: boolean;
};

/** A keyboard-accessible native picker with CSS paste and explicit opacity. */
export function ColorControl({ value, onChange, label, disabled, compact = false }: ColorControlProps) {
  const id = useId();
  let color: RgbColor | undefined;
  let error = "";
  try {
    color = parseColor(value);
  } catch (cause) {
    if (value.trim()) error = cause instanceof Error ? cause.message : "Enter a valid color.";
  }
  const opaque = color ? rgbToHex({ ...color, alpha: 1 }) : "#2563EB";
  const opacity = color ? Number((color.alpha * 100).toFixed(1)) : 100;
  const editableColor = (next: RgbColor) =>
    next.alpha === 1 ? rgbToHex(next) : `rgb(${next.red} ${next.green} ${next.blue} / ${next.alpha})`;
  const changeOpacity = (next: string) => {
    const alpha = Number(next) / 100;
    if (color && next !== "" && Number.isFinite(alpha) && alpha >= 0 && alpha <= 1)
      onChange(editableColor({ ...color, alpha }));
  };
  return (
    <div className="grid min-w-0 gap-3">
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor={`${id}-text`}>{label}</FieldLabel>
        <div className="grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-2">
          <Input
            aria-label={`Choose ${label.toLowerCase()} visually`}
            disabled={disabled}
            type="color"
            value={opaque}
            onChange={(event) =>
              onChange(editableColor({ ...parseColor(event.target.value), alpha: color?.alpha ?? 1 }))
            }
          />
          <Input
            aria-describedby={error ? `${id}-error` : undefined}
            aria-invalid={Boolean(error)}
            autoComplete="off"
            code
            disabled={disabled}
            id={`${id}-text`}
            onChange={(event) => onChange(event.target.value)}
            placeholder="#2563eb, rgb(), hsl(), or a name"
            spellCheck={false}
            value={value}
          />
        </div>
        {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
      </Field>
      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-end gap-3">
        <Field>
          <FieldLabel htmlFor={`${id}-opacity`}>Opacity</FieldLabel>
          <Input
            aria-label={`${label} opacity`}
            aria-valuetext={`${opacity}%`}
            disabled={disabled || !color}
            id={`${id}-opacity`}
            max={100}
            min={0}
            onChange={(event) => changeOpacity(event.target.value)}
            step={0.1}
            type="range"
            value={opacity}
          />
        </Field>
        <Input
          aria-label={`${label} opacity percent`}
          disabled={disabled || !color}
          max={100}
          min={0}
          onChange={(event) => changeOpacity(event.target.value)}
          step={0.1}
          suffix="%"
          type="number"
          value={opacity}
        />
      </div>
      {!compact ? (
        <ColorSwatch
          className="h-9"
          color={color ? rgbToHex(color) : "transparent"}
          label={color ? `${label}: ${rgbToHex(color)}` : `${label}: no valid color`}
        />
      ) : null}
    </div>
  );
}
