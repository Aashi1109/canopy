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
  layout?: "stacked" | "inline";
};

/** A keyboard-accessible native picker with CSS paste and explicit opacity. */
export function ColorControl({
  value,
  onChange,
  label,
  disabled,
  compact = false,
  layout = "inline",
}: ColorControlProps) {
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
  const inline = layout === "inline";
  const opacityInput = (
    <Input
      aria-label={`${label} opacity percent`}
      disabled={disabled || !color}
      id={`${id}-opacity-percent`}
      max={100}
      min={0}
      onChange={(event) => changeOpacity(event.target.value)}
      step={0.1}
      suffix="%"
      type="number"
      value={opacity}
    />
  );
  return (
    <div
      aria-labelledby={`${id}-label`}
      className={
        inline
          ? "grid min-w-0 grid-cols-[minmax(0,1fr)_5.5rem] items-start gap-2"
          : compact
            ? "grid min-w-0 gap-2"
            : "grid min-w-0 gap-3"
      }
      role="group"
    >
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor={`${id}-text`} id={`${id}-label`}>
          {label}
        </FieldLabel>
        <div
          className={inline ? "relative min-w-0" : "grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-2"}
        >
          {inline ? (
            <span className="group/color-picker absolute inset-y-0 left-2 z-10 flex w-6 items-center justify-center">
              <span aria-hidden="true">
                <ColorSwatch
                  className="size-4 rounded-full group-focus-within/color-picker:ring-2 group-focus-within/color-picker:ring-ring group-focus-within/color-picker:ring-offset-2"
                  color={color ? rgbToHex(color) : "transparent"}
                />
              </span>
              <Input
                aria-label={`Choose ${label.toLowerCase()} visually`}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
                disabled={disabled}
                type="color"
                value={opaque}
                onChange={(event) =>
                  onChange(editableColor({ ...parseColor(event.target.value), alpha: color?.alpha ?? 1 }))
                }
              />
            </span>
          ) : (
            <Input
              aria-label={`Choose ${label.toLowerCase()} visually`}
              disabled={disabled}
              type="color"
              value={opaque}
              onChange={(event) =>
                onChange(editableColor({ ...parseColor(event.target.value), alpha: color?.alpha ?? 1 }))
              }
            />
          )}
          <Input
            aria-describedby={error ? `${id}-error` : undefined}
            aria-invalid={Boolean(error)}
            autoComplete="off"
            code
            disabled={disabled}
            id={`${id}-text`}
            leadingIcon={inline ? <span className="size-4" /> : undefined}
            onChange={(event) => onChange(event.target.value)}
            placeholder="#2563eb, rgb(), hsl(), or a name"
            spellCheck={false}
            value={value}
          />
        </div>
        {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
      </Field>
      {inline ? (
        <Field>
          <FieldLabel htmlFor={`${id}-opacity-percent`}>Opacity</FieldLabel>
          {opacityInput}
        </Field>
      ) : (
        <div
          className={
            compact
              ? "grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-2"
              : "grid grid-cols-[minmax(0,1fr)_5.5rem] items-end gap-3"
          }
        >
          <Field
            className={compact ? "grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2" : undefined}
            orientation={compact ? "horizontal" : "vertical"}
          >
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
          {opacityInput}
        </div>
      )}
      {!compact && !inline ? (
        <ColorSwatch
          className="h-9"
          color={color ? rgbToHex(color) : "transparent"}
          label={color ? `${label}: ${rgbToHex(color)}` : `${label}: no valid color`}
        />
      ) : null}
    </div>
  );
}
