"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleCheck, GripVertical, LockKeyhole, LockKeyholeOpen } from "lucide-react";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import { ResultSurface } from "@/components/ResultSurface";
import { CopyButton } from "@/components/ResultView";
import { ScrollRegion } from "@/components/Stacks";
import { SyntaxHighlight } from "@/components/content/SyntaxHighlight";
import {
  Button,
  ColorControl,
  ColorSwatch,
  Field,
  Input,
  OrderableList,
  Select,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/index.tsx";
import { DesignWorkspace } from "@/app/devtools/components/color-design/DesignWorkspace";
import { generatePalette, HARMONIES, paletteForSettings, type PaletteColor } from "./model";
import { parseColor, rgbToHex } from "@/lib/devtools/shared/color";

export default function PaletteWorkspace(props: WorkspaceProps) {
  const [selectedId, setSelectedId] = useState("color-1");
  const { palette, error } = useMemo(() => {
    try {
      return { palette: paletteForSettings(props.settings, true), error: "" };
    } catch (cause) {
      return { palette: [], error: cause instanceof Error ? cause.message : "Check your colors." };
    }
  }, [props.settings]);
  const selected = palette.find((item) => item.id === selectedId) ?? palette[0];
  const seed = String(props.settings.seed ?? "#3366FF");
  const harmony = String(props.settings.harmony ?? "analogous");
  const count = Number(props.settings.count ?? 5);
  const minimumCount = Math.max(2, palette.findLastIndex((color) => color.locked) + 1);
  const update = props.onSettingChange;
  const save = useCallback((next: PaletteColor[]) => update("colors", JSON.stringify(next)), [update]);
  const generate = useCallback(
    (nextSeed = seed, nextHarmony = harmony, nextCount = count, nextVariation = 0) => {
      try {
        save(generatePalette(nextSeed, nextHarmony, nextCount, nextVariation, palette));
      } catch {
        /* Keep the edited palette and its locks while the seed is incomplete. */
      }
    },
    [count, harmony, palette, save, seed],
  );
  const variation = Number(props.settings.variation ?? 0);
  useEffect(() => {
    props.onToolbarActionsChange?.({
      before: (
        <Button
          disabled={props.disabled || Boolean(error)}
          size="xs"
          onClick={() => {
            update("variation", variation + 1);
            generate(seed, harmony, count, variation + 1);
          }}
        >
          Generate variation
        </Button>
      ),
    });
    return () => props.onToolbarActionsChange?.(null);
  }, [count, error, generate, harmony, props.disabled, props.onToolbarActionsChange, seed, update, variation]);
  return (
    <DesignWorkspace
      title={<span className="text-sm font-normal normal-case tracking-normal">Your palette</span>}
      workspaceClassName="[&>section>header]:py-3"
      controlTitle="Build a palette"
      compactOutput
      previewMeta={
        <span className="text-xs text-muted-foreground">
          {palette.length} colors · {palette.filter((color) => color.locked).length} locked
        </span>
      }
      preview={
        <ScrollRegion accessibleName="Palette swatches" className="h-full">
          <div className="@container flex min-h-full flex-col px-4 pt-4">
            <p className="mb-3 text-xs text-muted-foreground">
              Select a color to edit · Click HEX to copy · Lock colors to keep them
            </p>
            {error ? (
              <p className="text-sm text-destructive" role="status">
                {error}
              </p>
            ) : (
              <TooltipProvider>
                <OrderableList
                  ariaLabel="Palette colors"
                  className="grid grid-cols-2 gap-y-3 overflow-hidden rounded-sm @min-[640px]:grid-flow-col @min-[640px]:auto-cols-fr @min-[640px]:grid-cols-none [&>li]:min-w-0"
                  layout="grid"
                  dragSurface="card"
                  items={palette}
                  getId={(item) => item.id}
                  getLabel={(item) => item.color}
                  onReorder={save}
                  renderItem={(item, state) => {
                    let valid = true;
                    let label = item.color;
                    let foreground = "#000000";
                    try {
                      const rgb = parseColor(item.color);
                      label = rgbToHex(rgb);
                      const linear = [rgb.red, rgb.green, rgb.blue].map((value) => {
                        const channel = (value * rgb.alpha + 255 * (1 - rgb.alpha)) / 255;
                        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
                      });
                      foreground =
                        0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2] > 0.179 ? "#000000" : "#FFFFFF";
                    } catch {
                      valid = false;
                    }
                    return (
                      <div className="group min-w-0">
                        <div className="relative">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="card-action"
                                className="relative w-full cursor-grab select-none active:cursor-grabbing"
                                style={{ height: 136, padding: 0, color: foreground }}
                                onMouseDown={(event) => state.listeners?.onMouseDown?.(event)}
                                onTouchStart={(event) => state.listeners?.onTouchStart?.(event)}
                                aria-label={`Edit ${item.color}`}
                                aria-pressed={selected?.id === item.id}
                                onClick={() => {
                                  if (!state.isDragging) setSelectedId(item.id);
                                }}
                              >
                                <ColorSwatch
                                  color={item.color}
                                  className="pointer-events-none h-full w-full rounded-none border-0"
                                />
                                <span className="pointer-events-none absolute inset-x-2.5 top-2.5 flex items-start justify-between text-xs font-normal">
                                  <span>{String(palette.indexOf(item) + 1).padStart(2, "0")}</span>
                                  {selected?.id === item.id ? (
                                    <CircleCheck
                                      className="size-[18px]"
                                      style={{ color: foreground }}
                                      aria-hidden="true"
                                    />
                                  ) : null}
                                </span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Click to edit. Drag to reorder, or use the handle below.</TooltipContent>
                          </Tooltip>
                        </div>
                        <div className="flex h-9 min-w-0 items-center justify-center">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex text-xs font-medium text-foreground [&_button]:font-mono [&_button]:text-xs [&_button]:font-medium [&_button]:text-foreground [&_span]:text-foreground!">
                                <CopyButton disabled={!valid} content={label} label={`Copy ${label}`}>
                                  {valid ? <SyntaxHighlight code={label} language="css" /> : "Invalid"}
                                </CopyButton>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Copy {label}</TooltipContent>
                          </Tooltip>
                        </div>
                        <div className="flex justify-center gap-1 pb-1.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Reorder ${item.color}`}
                                ref={state.setActivatorNodeRef}
                                {...state.attributes}
                                {...state.listeners}
                              >
                                <GripVertical className="text-muted-foreground" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Drag to reorder, or press Space, arrow keys, then Space.</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-muted-foreground aria-pressed:bg-accent aria-pressed:text-primary"
                                aria-label={`${item.locked ? "Unlock" : "Lock"} ${item.color}`}
                                aria-pressed={item.locked}
                                onClick={() =>
                                  save(
                                    palette.map((color) =>
                                      color.id === item.id ? { ...color, locked: !color.locked } : color,
                                    ),
                                  )
                                }
                              >
                                {item.locked ? <LockKeyhole /> : <LockKeyholeOpen />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {item.locked ? "Unlock color" : "Keep this color when generating"}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    );
                  }}
                />
              </TooltipProvider>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 py-1 text-xs text-muted-foreground">
              <span>
                {selected
                  ? `${String(palette.indexOf(selected) + 1).padStart(2, "0")} selected · Edit in the right panel`
                  : "Select a color to edit"}
              </span>
              <Button asChild variant="link" size="xs">
                <a href="/devtools/contrast-checker">Check contrast ↗</a>
              </Button>
            </div>
          </div>
        </ScrollRegion>
      }
      output={
        <ResultSurface
          colorPreviews
          downloadMenu
          spec={props.spec}
          result={props.running || props.error ? null : props.result}
          retainedResult={props.result ? { ...props.result, artifacts: undefined } : null}
          error={props.error}
          running={props.running}
          title="Export palette"
        />
      }
      controls={
        <>
          <ColorControl
            layout="inline"
            label="Starting color"
            value={seed}
            onChange={(value) => {
              update("seed", value);
              generate(value);
            }}
          />
          <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-3">
            <Field htmlFor="palette-harmony" label="Harmony">
              <Select
                value={harmony}
                onChange={(event) => {
                  update("harmony", event.target.value);
                  generate(seed, event.target.value);
                }}
              >
                {HARMONIES.map((value) => (
                  <option key={value} value={value}>
                    {value[0].toUpperCase() + value.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field htmlFor="palette-count" label="Colors">
              <Input
                type="number"
                min={minimumCount}
                max={10}
                value={count}
                onChange={(event) => {
                  const next = event.target.valueAsNumber;
                  if (Number.isInteger(next) && next >= minimumCount && next <= 10) {
                    update("count", next);
                    generate(seed, harmony, next);
                  }
                }}
              />
            </Field>
          </div>
          {minimumCount > 2 ? (
            <p className="text-xs text-muted-foreground">
              Unlock later swatches to use fewer than {minimumCount} colors.
            </p>
          ) : null}
          {selected ? (
            <div className="border-t border-border pt-4">
              <ColorControl
                layout="inline"
                label={`Selected color · ${palette.indexOf(selected) + 1}`}
                value={selected.color}
                onChange={(value) =>
                  save(palette.map((color) => (color.id === selected.id ? { ...color, color: value } : color)))
                }
              />
            </div>
          ) : null}
          <Field htmlFor="palette-export-format" label="Export format">
            <Select
              value={String(props.settings.format ?? "css")}
              onChange={(event) => update("format", event.target.value)}
            >
              <option value="css">CSS variables</option>
              <option value="json">JSON</option>
              <option value="svg">SVG swatches</option>
            </Select>
          </Field>
        </>
      }
    />
  );
}
