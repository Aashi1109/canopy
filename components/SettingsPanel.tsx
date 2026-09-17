"use client";

import {
  FieldDescription,
  FieldLegend,
  Caption,
  FieldLabel,
  Button,
  Input,
  RadioGroup,
  RadioGroupItem,
  Select,
  Switch,
  Textarea,
} from "@canopy/ui";
import { Plus, RotateCw, Trash2 } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useId } from "react";
import type { FieldKind, FieldSpec, SettingRow, SettingsSpec, WatermarkPosition } from "@/lib/tool-framework/settings";
import { cn } from "@canopy/ui/lib/utils";

export interface SettingsPanelProps {
  className?: string;
  disabled?: boolean;
  layout?: "grid" | "stack";
  onChange: (key: string, value: unknown) => void;
  pane?: "main" | "side";
  spec: SettingsSpec;
  values: Readonly<Record<string, unknown>>;
}

interface FieldRenderContext {
  disabled: boolean;
  id: string;
  onChange: (value: unknown) => void;
  value: unknown;
}

type FieldRendererRegistry = {
  [Kind in FieldKind]: (field: Extract<FieldSpec, { kind: Kind }>, context: FieldRenderContext) => ReactNode;
};

const FIELD_ICONS = { "rotate-cw": RotateCw };

interface FieldFrameProps {
  children: ReactNode;
  help?: string;
  id: string;
  label: string;
}

function FieldFrame({ children, help, id, label }: FieldFrameProps) {
  return (
    <div className="grid gap-1.5">
      <FieldLabel className="text-muted-foreground" htmlFor={id}>
        {label}
      </FieldLabel>
      {children}
      {help ? (
        <FieldDescription className="text-muted-foreground" id={`${id}-help`}>
          {help}
        </FieldDescription>
      ) : null}
    </div>
  );
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function rowsValue(value: unknown, fallback: readonly SettingRow[]): readonly SettingRow[] {
  if (!Array.isArray(value)) return fallback;
  const rows: SettingRow[] = [];
  for (const entry of value) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("key" in entry) ||
      !("value" in entry) ||
      typeof entry.key !== "string" ||
      typeof entry.value !== "string"
    ) {
      return fallback;
    }
    rows.push({ key: entry.key, value: entry.value });
  }
  return rows;
}

const POSITIONS: readonly { label: string; value: WatermarkPosition }[] = [
  { label: "Top left", value: "top-left" },
  { label: "Top center", value: "top-center" },
  { label: "Top right", value: "top-right" },
  { label: "Middle left", value: "middle-left" },
  { label: "Middle center", value: "middle-center" },
  { label: "Middle right", value: "middle-right" },
  { label: "Bottom left", value: "bottom-left" },
  { label: "Bottom center", value: "bottom-center" },
  { label: "Bottom right", value: "bottom-right" },
];

function movePosition(event: KeyboardEvent<HTMLButtonElement>, index: number, onChange: (value: unknown) => void) {
  const row = Math.floor(index / 3);
  const column = index % 3;
  const nextIndex = {
    ArrowDown: Math.min(row + 1, 2) * 3 + column,
    ArrowLeft: row * 3 + Math.max(column - 1, 0),
    ArrowRight: row * 3 + Math.min(column + 1, 2),
    ArrowUp: Math.max(row - 1, 0) * 3 + column,
    End: POSITIONS.length - 1,
    Home: 0,
  }[event.key];
  if (nextIndex === undefined) return;
  event.preventDefault();
  if (nextIndex === index) return;
  onChange(POSITIONS[nextIndex].value);
  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[nextIndex]?.focus();
}

const FIELD_RENDERERS: FieldRendererRegistry = {
  text: (field, context) => (
    <FieldFrame help={field.help} id={context.id} label={field.label}>
      <Input
        aria-describedby={field.help ? `${context.id}-help` : undefined}
        disabled={context.disabled}
        id={context.id}
        maxLength={field.maxLength}
        onChange={(event) => context.onChange(event.currentTarget.value)}
        placeholder={field.placeholder}
        value={stringValue(context.value, field.default)}
      />
    </FieldFrame>
  ),
  textarea: (field, context) => (
    <FieldFrame help={field.help} id={context.id} label={field.label}>
      <Textarea
        aria-describedby={field.help ? `${context.id}-help` : undefined}
        disabled={context.disabled}
        id={context.id}
        onChange={(event) => context.onChange(event.currentTarget.value)}
        rows={field.rows}
        value={stringValue(context.value, field.default)}
      />
    </FieldFrame>
  ),
  password: (field, context) => (
    <FieldFrame help={field.help} id={context.id} label={field.label}>
      <Input
        aria-describedby={field.help ? `${context.id}-help` : undefined}
        disabled={context.disabled}
        id={context.id}
        onChange={(event) => context.onChange(event.currentTarget.value)}
        placeholder={field.placeholder}
        type="password"
        value={stringValue(context.value, field.default)}
      />
    </FieldFrame>
  ),
  number: (field, context) => {
    const Icon = field.leadingIcon ? FIELD_ICONS[field.leadingIcon] : undefined;
    return (
      <FieldFrame help={field.help} id={context.id} label={field.label}>
        <div className="flex items-center gap-2">
          <Input
            aria-describedby={field.help ? `${context.id}-help` : undefined}
            disabled={context.disabled}
            id={context.id}
            max={field.max}
            min={field.min}
            leadingIcon={Icon ? <Icon /> : undefined}
            onChange={(event) =>
              context.onChange(
                Number.isNaN(event.currentTarget.valueAsNumber)
                  ? event.currentTarget.value
                  : event.currentTarget.valueAsNumber,
              )
            }
            step={field.step}
            suffix={field.suffix}
            type="number"
            value={
              typeof context.value === "number" || typeof context.value === "string" ? context.value : field.default
            }
          />
        </div>
      </FieldFrame>
    );
  },
  slider: (field, context) => {
    const value = numberValue(context.value, field.default);
    return (
      <FieldFrame help={field.help} id={context.id} label={field.label}>
        <div className="flex items-center gap-3">
          <Input
            aria-describedby={field.help ? `${context.id}-help` : undefined}
            disabled={context.disabled}
            id={context.id}
            max={field.max}
            min={field.min}
            onChange={(event) => context.onChange(event.currentTarget.valueAsNumber)}
            step={field.step}
            type="range"
            value={value}
          />
          <output className="min-w-12 text-right" htmlFor={context.id}>
            <Caption>
              {value}
              {field.suffix}
            </Caption>
          </output>
        </div>
      </FieldFrame>
    );
  },
  toggle: (field, context) => (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <FieldLabel className="text-foreground" htmlFor={context.id}>
          {field.label}
        </FieldLabel>
        {field.help ? (
          <FieldDescription className="mt-0.5 text-muted-foreground" id={`${context.id}-help`}>
            {field.help}
          </FieldDescription>
        ) : null}
      </div>
      <Switch
        aria-describedby={field.help ? `${context.id}-help` : undefined}
        className="shrink-0"
        checked={typeof context.value === "boolean" ? context.value : field.default}
        disabled={context.disabled}
        id={context.id}
        onCheckedChange={context.onChange}
      />
    </div>
  ),
  select: (field, context) => (
    <FieldFrame help={field.help} id={context.id} label={field.label}>
      <Select
        aria-describedby={field.help ? `${context.id}-help` : undefined}
        className="w-full"
        disabled={context.disabled}
        id={context.id}
        onChange={(event) => context.onChange(event.currentTarget.value)}
        value={stringValue(context.value, field.default)}
      >
        {field.choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.aspectRatio ? (
              <span className="flex min-w-0 max-w-full items-center gap-2">
                <span aria-hidden="true" className="inline-flex size-4 shrink-0 items-center justify-center">
                  <span
                    className="rounded-[2px] border-[1.5px] border-current"
                    style={{
                      width: 14 * Math.min(1, choice.aspectRatio),
                      height: 14 / Math.max(1, choice.aspectRatio),
                    }}
                  />
                </span>
                <span className="truncate">{choice.label}</span>
              </span>
            ) : (
              choice.label
            )}
          </option>
        ))}
      </Select>
    </FieldFrame>
  ),
  preset: (field, context) => (
    <fieldset className="grid gap-2">
      <FieldLegend>{field.label}</FieldLegend>
      <RadioGroup
        aria-describedby={field.help ? `${context.id}-help` : undefined}
        disabled={context.disabled}
        onValueChange={context.onChange}
        value={stringValue(context.value, field.default)}
      >
        {field.choices.map((choice) => {
          const choiceId = `${context.id}-${choice.value}`;
          return (
            <div className="flex items-start gap-3 rounded-lg border border-border p-3" key={choice.value}>
              <RadioGroupItem id={choiceId} value={choice.value} />
              <FieldLabel className="grid cursor-pointer gap-0.5" htmlFor={choiceId}>
                <span>{choice.label}</span>
                {choice.detail ? <Caption className="text-muted-foreground">{choice.detail}</Caption> : null}
              </FieldLabel>
            </div>
          );
        })}
      </RadioGroup>
      {field.help ? (
        <FieldDescription className="text-muted-foreground" id={`${context.id}-help`}>
          {field.help}
        </FieldDescription>
      ) : null}
    </fieldset>
  ),
  color: (field, context) => {
    const value = stringValue(context.value, field.default);
    return (
      <FieldFrame help={field.help} id={context.id} label={field.label}>
        <div className="flex items-center gap-2">
          <Input
            aria-describedby={field.help ? `${context.id}-help` : undefined}
            className="w-16 px-2"
            disabled={context.disabled}
            id={context.id}
            onChange={(event) => context.onChange(event.currentTarget.value)}
            type="color"
            value={value === "transparent" ? "#000000" : value}
          />
          <div className="min-w-0 flex-1">
            <FieldLabel className="sr-only" htmlFor={`${context.id}-value`}>
              {field.label} value
            </FieldLabel>
            <Input
              disabled={context.disabled}
              id={`${context.id}-value`}
              onChange={(event) => context.onChange(event.currentTarget.value)}
              value={value}
            />
          </div>
          {field.allowTransparent ? (
            <Button
              disabled={context.disabled}
              onClick={() => context.onChange("transparent")}
              type="button"
              variant="outline"
            >
              Transparent
            </Button>
          ) : null}
        </div>
      </FieldFrame>
    );
  },
  date: (field, context) => (
    <FieldFrame help={field.help} id={context.id} label={field.label}>
      <Input
        aria-describedby={field.help ? `${context.id}-help` : undefined}
        disabled={context.disabled}
        id={context.id}
        onChange={(event) => context.onChange(event.currentTarget.value)}
        type="date"
        value={stringValue(context.value, field.default)}
      />
    </FieldFrame>
  ),
  position: (field, context) => {
    const value = stringValue(context.value, field.default);
    return (
      <fieldset className="grid gap-2">
        <FieldLegend>{field.label}</FieldLegend>
        <div
          aria-describedby={field.help ? `${context.id}-help` : undefined}
          aria-label={field.label}
          className="flex min-w-0 max-w-full flex-nowrap gap-1.5 overflow-x-auto p-1"
          role="radiogroup"
        >
          {POSITIONS.map((position, index) => (
            <Button
              aria-checked={position.value === value}
              aria-label={position.label}
              className="shrink-0 aria-checked:border-primary aria-checked:bg-accent aria-checked:text-primary"
              size="icon"
              disabled={context.disabled}
              key={position.value}
              onClick={() => context.onChange(position.value)}
              onKeyDown={(event) => movePosition(event, index, context.onChange)}
              role="radio"
              tabIndex={position.value === value ? 0 : -1}
              type="button"
              variant="outline"
            >
              <span
                aria-hidden="true"
                className="grid h-6 w-[18px] shrink-0 grid-cols-3 grid-rows-3 rounded-[3px] border border-current p-0.5"
              >
                <span
                  className="size-1 self-center justify-self-center rounded-full bg-current"
                  style={{ gridColumn: (index % 3) + 1, gridRow: Math.floor(index / 3) + 1 }}
                />
              </span>
            </Button>
          ))}
        </div>
        <Caption className="text-muted-foreground">
          {POSITIONS.find((position) => position.value === value)?.label}
        </Caption>
        {field.help ? (
          <FieldDescription className="text-muted-foreground" id={`${context.id}-help`}>
            {field.help}
          </FieldDescription>
        ) : null}
      </fieldset>
    );
  },
  pages: (field, context) => {
    // "all" / "odd" / "even" stay as the keyword the user typed; only an
    // explicit page list is rendered as a comma-separated expression.
    const asExpression = (selection: typeof field.default): string =>
      Array.isArray(selection) ? selection.join(",") : String(selection);
    const value = Array.isArray(context.value)
      ? context.value.join(",")
      : stringValue(context.value, asExpression(field.default));
    const keyword = value.trim().toLowerCase();
    const mode = ["all", "odd", "even"].includes(keyword) ? keyword : "custom";
    if (field.presets) {
      return (
        <div className="grid gap-3">
          <FieldFrame help={field.help} id={context.id} label={field.label}>
            <Select
              aria-describedby={field.help ? `${context.id}-help` : undefined}
              className="w-full"
              disabled={context.disabled}
              id={context.id}
              onChange={(event) =>
                context.onChange(event.currentTarget.value === "custom" ? "" : event.currentTarget.value)
              }
              value={mode}
            >
              <option value="all">All pages</option>
              <option value="odd">Odd pages</option>
              <option value="even">Even pages</option>
              <option value="custom">Custom ranges</option>
            </Select>
          </FieldFrame>
          {mode === "custom" && (
            <FieldFrame id={`${context.id}-ranges`} label="Page ranges">
              <Input
                disabled={context.disabled}
                id={`${context.id}-ranges`}
                onChange={(event) => context.onChange(event.currentTarget.value)}
                placeholder="1,3,5-9"
                value={value}
              />
            </FieldFrame>
          )}
        </div>
      );
    }
    return (
      <FieldFrame help={field.help} id={context.id} label={field.label}>
        <Input
          aria-describedby={field.help ? `${context.id}-help` : undefined}
          disabled={context.disabled}
          id={context.id}
          onChange={(event) => context.onChange(event.currentTarget.value)}
          placeholder="1,3,5-9, odd, even, or all"
          value={value}
        />
      </FieldFrame>
    );
  },
  rows: (field, context) => {
    const rows = rowsValue(context.value, field.default);
    return (
      <fieldset aria-describedby={field.help ? `${context.id}-help` : undefined} className="grid gap-3">
        <FieldLegend>{field.label}</FieldLegend>
        {rows.map((row, index) => {
          const keyId = `${context.id}-${index}-key`;
          const valueId = `${context.id}-${index}-value`;
          return (
            <div
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2"
              key={`${context.id}-${index}`}
            >
              <div className="grid gap-1.5">
                <FieldLabel htmlFor={keyId}>{field.keyLabel}</FieldLabel>
                <Input
                  disabled={context.disabled}
                  id={keyId}
                  onChange={(event) =>
                    context.onChange(
                      rows.map((entry, rowIndex) =>
                        rowIndex === index ? { ...entry, key: event.currentTarget.value } : entry,
                      ),
                    )
                  }
                  value={row.key}
                />
              </div>
              <div className="grid gap-1.5">
                <FieldLabel htmlFor={valueId}>{field.valueLabel}</FieldLabel>
                <Input
                  disabled={context.disabled}
                  id={valueId}
                  onChange={(event) =>
                    context.onChange(
                      rows.map((entry, rowIndex) =>
                        rowIndex === index ? { ...entry, value: event.currentTarget.value } : entry,
                      ),
                    )
                  }
                  value={row.value}
                />
              </div>
              <Button
                aria-label={`Remove row ${index + 1}`}
                disabled={context.disabled}
                onClick={() => context.onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          );
        })}
        <Button
          className="w-fit"
          disabled={context.disabled}
          onClick={() => context.onChange([...rows, { key: "", value: "" }])}
          type="button"
          variant="outline"
        >
          <Plus aria-hidden="true" /> Add row
        </Button>
        {field.help ? (
          <FieldDescription className="text-muted-foreground" id={`${context.id}-help`}>
            {field.help}
          </FieldDescription>
        ) : null}
      </fieldset>
    );
  },
};

export function SettingsPanel({
  className,
  disabled = false,
  layout = "stack",
  onChange,
  pane,
  spec,
  values,
}: SettingsPanelProps) {
  const idPrefix = useId();
  return (
    <div
      className={cn(
        layout === "grid" ? "grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-4" : "grid gap-5",
        className,
      )}
    >
      {Object.entries(spec.fields).map(([key, field]) => {
        if (pane && (pane === "main" ? field.pane !== "main" : field.pane === "main")) return null;
        if (field.visibleWhen && values[field.visibleWhen.key] !== field.visibleWhen.equals) return null;
        const context: FieldRenderContext = {
          disabled,
          id: `${idPrefix}-${key}`,
          onChange: (value) => onChange(key, value),
          value: values[key] ?? field.default,
        };
        return (
          <div
            className={
              layout !== "grid"
                ? undefined
                : field.span === "full"
                  ? "col-span-full"
                  : field.span === 2
                    ? "sm:col-span-2"
                    : undefined
            }
            key={key}
          >
            {FIELD_RENDERERS[field.kind](field as never, context)}
          </div>
        );
      })}
    </div>
  );
}
