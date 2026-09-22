"use client";
import { useState } from "react";
import { GripVertical, LockKeyhole, LockKeyholeOpen } from "lucide-react";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import { ResultSurface } from "@/components/ResultSurface";
import { CopyButton } from "@/components/ResultView";
import { Button, ColorControl, ColorSwatch, Field, Input, OrderableList, Select } from "@/components/ui/index.tsx";
import { DesignWorkspace } from "@/app/devtools/components/color-design/DesignWorkspace";
import { generatePalette, HARMONIES, paletteForSettings, type PaletteColor } from "./model";
import { parseColor, rgbToHex } from "@/lib/devtools/shared/color";

export default function PaletteWorkspace(props: WorkspaceProps) {
  const [selectedId, setSelectedId] = useState("color-1");
  let palette: PaletteColor[] = [];
  let error = "";
  try {
    palette = paletteForSettings(props.settings, true);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Check your colors.";
  }
  const selected = palette.find((item) => item.id === selectedId) ?? palette[0];
  const seed = String(props.settings.seed ?? "#3366FF");
  const harmony = String(props.settings.harmony ?? "analogous");
  const count = Number(props.settings.count ?? 5);
  const minimumCount = Math.max(2, palette.findLastIndex((color) => color.locked) + 1);
  const update = (key: string, value: string | number) => props.onSettingChange(key, value);
  const save = (next: PaletteColor[]) => update("colors", JSON.stringify(next));
  const generate = (nextSeed = seed, nextHarmony = harmony, nextCount = count, nextVariation = 0) => {
    try {
      save(generatePalette(nextSeed, nextHarmony, nextCount, nextVariation, palette));
    } catch {
      /* Keep the edited palette and its locks while the seed is incomplete. */
    }
  };
  return (
    <DesignWorkspace
      title="Your palette"
      controlTitle="Build a palette"
      compactOutput
      previewActions={
        <Button
          variant="outline"
          onClick={() => {
            const variation = Number(props.settings.variation ?? 0) + 1;
            update("variation", variation);
            generate(seed, harmony, count, variation);
          }}
        >
          Generate variation
        </Button>
      }
      preview={
        <div className="flex h-full flex-col gap-4 p-5">
          <p className="text-xs text-muted-foreground">
            Select a swatch to edit it. Lock favorites before generating; drag the handles to reorder.
          </p>
          {error ? (
            <p className="text-sm text-destructive" role="status">
              {error}
            </p>
          ) : (
            <OrderableList
              ariaLabel="Palette colors"
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5"
              layout="grid"
              items={palette}
              getId={(item) => item.id}
              getLabel={(item) => item.color}
              onReorder={save}
              renderItem={(item, state) => {
                let valid = true;
                let label = item.color;
                try {
                  label = rgbToHex(parseColor(item.color));
                } catch {
                  valid = false;
                }
                return (
                  <div
                    className={`overflow-hidden rounded-lg border ${selected?.id === item.id ? "border-primary ring-1 ring-primary" : "border-border"}`}
                  >
                    <Button
                      variant="ghost"
                      className="w-full rounded-none"
                      style={{ height: "6rem", padding: 0 }}
                      aria-label={`Edit ${item.color}`}
                      aria-pressed={selected?.id === item.id}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <ColorSwatch color={item.color} className="h-full w-full rounded-none border-0" />
                    </Button>
                    <div className="space-y-2 p-2">
                      <span className="block truncate text-center font-mono text-xs">
                        {valid ? label : "Invalid color"}
                      </span>
                      <div className="flex items-center justify-between gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Reorder ${item.color}`}
                          ref={state.setActivatorNodeRef}
                          {...state.attributes}
                          {...state.listeners}
                        >
                          <GripVertical className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
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
                          {item.locked ? <LockKeyhole className="size-4" /> : <LockKeyholeOpen className="size-4" />}
                        </Button>
                        <CopyButton iconOnly disabled={!valid} content={label} label={`Copy ${label}`} />
                      </div>
                    </div>
                  </div>
                );
              }}
            />
          )}
          <p className="mt-auto text-xs text-muted-foreground">
            {palette.filter((color) => color.locked).length} locked · Check text/background pairs in{" "}
            <a className="text-primary underline underline-offset-4" href="/devtools/contrast-checker">
              Contrast Checker
            </a>
            .
          </p>
        </div>
      }
      output={
        <ResultSurface
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
            compact
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
                compact
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
          <Button
            variant="ghost"
            onClick={() => {
              update("seed", "#3366FF");
              update("harmony", "analogous");
              update("count", 5);
              update("variation", 0);
              update("colors", "");
            }}
          >
            Reset palette
          </Button>
        </>
      }
    />
  );
}
