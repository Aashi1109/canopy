"use client";

import { useLocale, useTranslations } from "next-intl";
import { isLocale, localizeHref } from "@/lib/i18n/config";
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
  const t = useTranslations("Tool.runtime");
  const locale = useLocale();
  const [selectedId, setSelectedId] = useState("color-1");
  const { palette, error } = useMemo(() => {
    try {
      return { palette: paletteForSettings(props.settings, true), error: "" };
    } catch (cause) {
      const key = `errors.${cause instanceof Error && "code" in cause ? cause.code : ""}`;
      return { palette: [], error: t.has(key) ? t(key) : t("workspace.checkColors") };
    }
  }, [props.settings, t]);
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
          {t("workspace.generateVariation")}
        </Button>
      ),
    });
    return () => props.onToolbarActionsChange?.(null);
  }, [count, error, generate, harmony, props.disabled, props.onToolbarActionsChange, seed, update, variation, t]);
  return (
    <DesignWorkspace
      title={<span className="text-sm font-normal normal-case tracking-normal">{t("workspace.yourPalette")}</span>}
      workspaceClassName="[&>section>header]:py-3"
      controlTitle={t("workspace.buildAPalette")}
      compactOutput
      previewMeta={
        <span className="text-xs text-muted-foreground">
          {t("workspace.paletteCount", {
            count: palette.length,
            locked: palette.filter((color) => color.locked).length,
          })}
        </span>
      }
      preview={
        <ScrollRegion accessibleName={t("workspace.paletteSwatches")} className="h-full">
          <div className="@container flex min-h-full flex-col px-4 pt-4">
            <p className="mb-3 text-xs text-muted-foreground">{t("workspace.selectAColorToEditClickHex")}</p>
            {error ? (
              <p className="text-sm text-destructive" role="status">
                {error}
              </p>
            ) : (
              <TooltipProvider>
                <OrderableList
                  ariaLabel={t("workspace.paletteColors")}
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
                                aria-label={t("workspace.editColor", { color: item.color })}
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
                            <TooltipContent>{t("workspace.clickToEditDragToReorderOr")}</TooltipContent>
                          </Tooltip>
                        </div>
                        <div className="flex h-9 min-w-0 items-center justify-center">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex text-xs font-medium text-foreground [&_button]:font-mono [&_button]:text-xs [&_button]:font-medium [&_button]:text-foreground [&_span]:text-foreground!">
                                <CopyButton
                                  disabled={!valid}
                                  content={label}
                                  label={t("workspace.copyColor", { color: label })}
                                >
                                  {valid ? <SyntaxHighlight code={label} language="css" /> : t("workspace.invalid")}
                                </CopyButton>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{t("workspace.copyColor", { color: label })}</TooltipContent>
                          </Tooltip>
                        </div>
                        <div className="flex justify-center gap-1 pb-1.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t("workspace.reorderColor", { color: item.color })}
                                ref={state.setActivatorNodeRef}
                                {...state.attributes}
                                {...state.listeners}
                              >
                                <GripVertical className="text-muted-foreground" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t("workspace.dragToReorderOrPressSpaceArrow")}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-muted-foreground aria-pressed:bg-accent aria-pressed:text-primary"
                                aria-label={t("workspace.lockColor", {
                                  action: item.locked ? "unlock" : "lock",
                                  color: item.color,
                                })}
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
                              {item.locked ? t("workspace.unlockColor") : t("workspace.keepColor")}
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
                  ? t("workspace.selectedHint", { number: String(palette.indexOf(selected) + 1).padStart(2, "0") })
                  : t("workspace.selectColor")}
              </span>
              <Button asChild variant="link" size="xs">
                <a href={localizeHref("/devtools/contrast-checker", isLocale(locale) ? locale : "en")}>
                  {t("workspace.checkContrast")}
                </a>
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
          title={t("workspace.exportPalette")}
        />
      }
      controls={
        <>
          <ColorControl
            layout="inline"
            label={t("workspace.startingColor")}
            value={seed}
            onChange={(value) => {
              update("seed", value);
              generate(value);
            }}
          />
          <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-3">
            <Field htmlFor="palette-harmony" label={t("workspace.harmony")}>
              <Select
                value={harmony}
                onChange={(event) => {
                  update("harmony", event.target.value);
                  generate(seed, event.target.value);
                }}
              >
                {HARMONIES.map((value) => (
                  <option key={value} value={value}>
                    {t(`workspace.harmonyValue.${value}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field htmlFor="palette-count" label={t("workspace.colors2")}>
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
            <p className="text-xs text-muted-foreground">{t("workspace.minimumCount", { count: minimumCount })}</p>
          ) : null}
          {selected ? (
            <div className="border-t border-border pt-4">
              <ColorControl
                layout="inline"
                label={t("workspace.selectedColor", { number: palette.indexOf(selected) + 1 })}
                value={selected.color}
                onChange={(value) =>
                  save(palette.map((color) => (color.id === selected.id ? { ...color, color: value } : color)))
                }
              />
            </div>
          ) : null}
          <Field htmlFor="palette-export-format" label={t("workspace.exportFormat")}>
            <Select
              value={String(props.settings.format ?? "css")}
              onChange={(event) => update("format", event.target.value)}
            >
              <option value="css">{t("workspace.cssVariables")}</option>
              <option value="json">{t("workspace.json")}</option>
              <option value="svg">{t("workspace.svgSwatches")}</option>
            </Select>
          </Field>
        </>
      }
    />
  );
}
