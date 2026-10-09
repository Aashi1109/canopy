"use client";
import { useTranslations as useToolTranslations } from "next-intl";

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
  const toolText = useToolTranslations("Tool.runtime");
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
      title={toolText("workspace.convert_css_values_50a491")}
      controlTitle={toolText("workspace.conversionContext")}
      preview={
        <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-3">
          <div className="flex items-end gap-3">
            <Field className="flex-1" htmlFor="unit-from" label={toolText("workspace.from_218197")}>
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
                    aria-label={toolText("workspace.swap_units_8104cc")}
                    disabled={props.disabled}
                    variant="outline"
                    size="icon-sm"
                    onClick={swap}
                  >
                    <ArrowLeftRight aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{toolText("workspace.swap_units_8104cc")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Field className="flex-1" htmlFor="unit-to" label={toolText("workspace.to_f4b06e")}>
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
            label={toolText("workspace.values_53b09e")}
            error={props.error}
            description={props.error ? undefined : toolText("workspace.one_value_per_dc46f4")}
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
          {used.has("rem")
            ? numeric("base", toolText("workspace.rootFontSize"), 16, toolText("workspace.remReference"))
            : null}
          {used.has("em") ? (
            <>
              <Field htmlFor="unit-em-context" label={toolText("workspace.em_reference_bef2dc")}>
                <Select
                  disabled={props.disabled}
                  value={emContext}
                  onChange={(event) => props.onSettingChange("emContext", event.target.value)}
                >
                  <option value="element">{toolText("workspace.element_spacing_and_c30723")}</option>
                  <option value="parent">{toolText("workspace.parent_font_size_c13498")}</option>
                </Select>
              </Field>
              {emContext === "element"
                ? numeric(
                    "elementFontSize",
                    toolText("workspace.elementFontSize"),
                    16,
                    toolText("workspace.elementReference"),
                  )
                : null}
            </>
          ) : null}
          {used.has("%") ? (
            <>
              <Field htmlFor="unit-percentage-reference" label={toolText("workspace.percentage_reference_14b5c0")}>
                <Select
                  disabled={props.disabled}
                  value={percentageReference}
                  onChange={(event) => props.onSettingChange("percentageReference", event.target.value)}
                >
                  <option value="parent-font">{toolText("workspace.parent_font_size_d6ad58")}</option>
                  <option value="length">{toolText("workspace.explicit_reference_length_f7beb3")}</option>
                </Select>
              </Field>
              {percentageReference === "length"
                ? numeric(
                    "percentageBase",
                    toolText("workspace.referenceLength"),
                    100,
                    toolText("workspace.actualReference"),
                    100000,
                  )
                : null}
            </>
          ) : null}
          {parentUsed
            ? numeric("parentFontSize", toolText("workspace.parentFontSize"), 16, toolText("workspace.parentReference"))
            : null}
          {viewportUsed ? (
            <div className="grid grid-cols-2 gap-3">
              {numeric("viewportWidth", toolText("workspace.viewportWidth"), 1366, undefined, 100000, 1)}
              {numeric("viewportHeight", toolText("workspace.viewportHeight"), 768, undefined, 100000, 1)}
            </div>
          ) : null}
          <Field htmlFor="unit-precision" label={toolText("workspace.decimal_places_004a34")}>
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
            label={toolText("workspace.include_calculation_a40841")}
            checked={props.settings.includeFormula === true}
            onCheckedChange={(checked) => props.onSettingChange("includeFormula", Boolean(checked))}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            {toolText("workspace.percentages_depend_on_683f68")}
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
          title={toolText("workspace.converted_values_b10d04")}
        />
      }
    />
  );
}
