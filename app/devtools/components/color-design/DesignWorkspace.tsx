"use client";

import { useId, type ReactNode } from "react";

import { WorkspaceSurface } from "@/components/Surfaces";
import { Field, Input, ToolOptionsPanel } from "@/components/ui/index.tsx";

/** Shared geometry for visual design tools; each tool owns its actual canvas and controls. */
export function DesignWorkspace({
  preview,
  controls,
  output,
  title = "Preview",
  controlTitle = "Adjust",
  previewActions,
  compactOutput = false,
  compactInput = false,
}: {
  preview: ReactNode;
  controls: ReactNode;
  output?: ReactNode;
  title?: string;
  controlTitle?: string;
  previewActions?: ReactNode;
  compactOutput?: boolean;
  compactInput?: boolean;
}) {
  return (
    <div className="grid h-full min-h-0 min-w-0 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_21rem] lg:overflow-hidden">
      <div
        className={
          output
            ? compactInput
              ? "grid min-h-[28rem] min-w-0 grid-rows-[15rem_minmax(13rem,1fr)] lg:min-h-0"
              : compactOutput
                ? "grid min-h-[31rem] min-w-0 grid-rows-[minmax(16rem,21rem)_minmax(10rem,1fr)] lg:min-h-0"
                : "grid min-h-[28rem] min-w-0 grid-rows-[minmax(14rem,1fr)_minmax(12rem,1fr)] lg:min-h-0"
            : "flex min-h-[20rem] min-w-0 flex-col lg:min-h-0"
        }
      >
        <WorkspaceSurface
          actions={previewActions}
          className="min-h-0 flex-1"
          contentClassName="min-h-0"
          purpose="preview"
          title={title}
        >
          {preview}
        </WorkspaceSurface>
        {output ? <div className="min-h-0 min-w-0 overflow-hidden border-t border-border">{output}</div> : null}
      </div>
      <ToolOptionsPanel
        className="min-h-0 min-w-0 overflow-y-auto border-t border-border p-5 lg:border-t-0 lg:border-l"
        title={controlTitle}
        variant="plain"
      >
        <div className="flex flex-col gap-5">{controls}</div>
      </ToolOptionsPanel>
    </div>
  );
}

/** A visual adjustment always keeps an exact, keyboard-editable value beside it. */
export function DesignRange({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_6rem] items-end gap-3">
      <Field htmlFor={`${id}-range`} label={label}>
        <Input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          className="border-0 bg-transparent px-0 shadow-none"
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </Field>
      <Input
        aria-label={`${label} value`}
        type="number"
        min={min}
        max={max}
        step={step}
        suffix={suffix}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.valueAsNumber;
          if (Number.isFinite(next)) onChange(Math.max(min, Math.min(max, next)));
        }}
      />
    </div>
  );
}
