"use client";

import { ArrowLeftRight } from "lucide-react";

import { DesignWorkspace } from "@/app/devtools/components/color-design/DesignWorkspace";
import { ResultSurface } from "@/components/ResultSurface";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import {
  Button,
  Checkbox,
  Field,
  Input,
  Select,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/index.tsx";

const UNITS = ["px", "rem", "em", "pt", "%", "vw", "vh", "vmin", "vmax"];

export default function CssUnitConverterWorkspace(props: WorkspaceProps) {
  const from = String(props.settings.from ?? "px");
  const to = String(props.settings.to ?? "rem");
  const used = new Set([
    from,
    to,
    ...Array.from(props.input.text.matchAll(/(?:\d|\.)\s*(rem|em|px|pt|%|vmin|vmax|vw|vh)(?![a-z])/gi), (match) =>
      match[1].toLowerCase(),
    ),
  ]);
  const emContext = String(props.settings.emContext ?? "element");
  const percentageReference = String(props.settings.percentageReference ?? "parent-font");
  const parentUsed =
    (used.has("em") && emContext === "parent") || (used.has("%") && percentageReference === "parent-font");
  const viewportUsed = ["vw", "vh", "vmin", "vmax"].some((unit) => used.has(unit));
  const number = (key: string, fallback: number) => Number(props.settings[key] ?? fallback);

  function numeric(key: string, label: string, fallback: number, description?: string, max = 10000, min = 0.01) {
    return (
      <Field htmlFor={`unit-${key}`} label={label} description={description} key={key}>
        <Input
          disabled={props.disabled}
          min={min}
          max={max}
          step="any"
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
  function swap() {
    const result = props.running || props.error ? null : props.result;
    if (result?.render === "text") props.onInputChange({ ...props.input, text: result.text.split("\n")[0] });
    else if (result?.render === "table")
      props.onInputChange({ ...props.input, text: result.rows.map((row) => row[2] || row[1]).join("\n") });
    props.onSettingChange("from", to);
    props.onSettingChange("to", from);
  }

  return (
    <DesignWorkspace
      compactInput
      workspaceClassName="min-h-[33rem] grid-rows-[20rem_minmax(13rem,1fr)]"
      title="Convert CSS values"
      controlTitle="Conversion context"
      preview={
        <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-3">
          <div className="flex items-end gap-3">
            <Field className="flex-1" htmlFor="unit-from" label="From">
              <Select
                disabled={props.disabled}
                value={from}
                onChange={(event) => props.onSettingChange("from", event.target.value)}
              >
                {UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </Select>
            </Field>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="Swap units"
                    disabled={props.disabled}
                    variant="outline"
                    size="icon-sm"
                    onClick={swap}
                  >
                    <ArrowLeftRight aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Swap units</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Field className="flex-1" htmlFor="unit-to" label="To">
              <Select
                disabled={props.disabled}
                value={to}
                onChange={(event) => props.onSettingChange("to", event.target.value)}
              >
                {UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field
            htmlFor="unit-values"
            label="Values"
            error={props.error}
            description={props.error ? undefined : "One value per line. A unit suffix overrides From for that value."}
          >
            <Textarea
              className="h-32 min-h-32 field-sizing-fixed py-2"
              disabled={props.disabled}
              rows={6}
              placeholder="16px&#10;2rem&#10;50%"
              value={props.input.text}
              onChange={(event) => props.onInputChange({ ...props.input, text: event.target.value })}
            />
          </Field>
        </div>
      }
      controls={
        <>
          {used.has("rem") ? numeric("base", "Root font size", 16, "rem is relative to the root element.") : null}
          {used.has("em") ? (
            <>
              <Field htmlFor="unit-em-context" label="em reference">
                <Select
                  disabled={props.disabled}
                  value={emContext}
                  onChange={(event) => props.onSettingChange("emContext", event.target.value)}
                >
                  <option value="element">Element (spacing and sizes)</option>
                  <option value="parent">Parent (font-size)</option>
                </Select>
              </Field>
              {emContext === "element"
                ? numeric(
                    "elementFontSize",
                    "Element font size",
                    16,
                    "Use the element’s computed font size for em lengths.",
                  )
                : null}
            </>
          ) : null}
          {used.has("%") ? (
            <>
              <Field htmlFor="unit-percentage-reference" label="Percentage reference">
                <Select
                  disabled={props.disabled}
                  value={percentageReference}
                  onChange={(event) => props.onSettingChange("percentageReference", event.target.value)}
                >
                  <option value="parent-font">Parent font size</option>
                  <option value="length">Explicit reference length</option>
                </Select>
              </Field>
              {percentageReference === "length"
                ? numeric(
                    "percentageBase",
                    "100% reference length",
                    100,
                    "Supply the actual reference for the CSS property, such as the containing block width.",
                    100000,
                  )
                : null}
            </>
          ) : null}
          {parentUsed
            ? numeric("parentFontSize", "Parent font size", 16, "Reference for font-size in em or percent.")
            : null}
          {viewportUsed ? (
            <div className="grid grid-cols-2 gap-3">
              {numeric("viewportWidth", "Viewport width", 1366, undefined, 100000, 1)}
              {numeric("viewportHeight", "Viewport height", 768, undefined, 100000, 1)}
            </div>
          ) : null}
          <Field htmlFor="unit-precision" label="Decimal places">
            <Input
              disabled={props.disabled}
              min={0}
              max={12}
              step={1}
              type="number"
              value={props.settings.roundResults === true ? 4 : number("precision", 6)}
              onChange={(event) => {
                const next = event.currentTarget.valueAsNumber;
                if (!Number.isFinite(next)) return;
                props.onSettingChange("roundResults", false);
                props.onSettingChange("precision", Math.min(12, Math.max(0, Math.round(next))));
              }}
            />
          </Field>
          <Checkbox
            disabled={props.disabled}
            label="Include calculation"
            checked={props.settings.includeFormula === true}
            onCheckedChange={(checked) => props.onSettingChange("includeFormula", Boolean(checked))}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            Percentages depend on the CSS property. Viewport units use the dimensions you supply. Negative values may
            not be allowed by your target property.
          </p>
        </>
      }
      output={
        <ResultSurface
          error={props.error}
          result={props.running || props.error ? null : props.result}
          retainedResult={props.result}
          running={props.running}
          spec={props.spec}
          title="Converted values"
        />
      }
    />
  );
}
