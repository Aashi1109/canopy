"use client";
import { useTranslations as useToolTranslations } from "next-intl";

import { Button, Caption, FieldLabel, Input, Select } from "@/components/ui/index.tsx";
import { MoveHorizontal, MoveVertical, PanelBottom, PanelLeft } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { CropFrame } from "@/components/CropFrame";
import { workspaceFileId } from "@/components/FileInput";
import { GeneratedPdfPreview } from "@/components/GeneratedPdfPreview";
import { PdfFileWorkspace } from "@/components/PdfFileWorkspace";
import type { PdfPageImage } from "@/components/PdfPagesSurface";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import { cropEditorPlan, cropPlan } from "./plan";

const DIMENSIONS = [
  ["cropX", "Left", PanelLeft],
  ["cropY", "Bottom", PanelBottom],
  ["cropWidth", "Width", MoveHorizontal],
  ["cropHeight", "Height", MoveVertical],
] as const;

function getPlan(
  settings: WorkspaceProps["settings"],
  count: number,
  pages: readonly PdfPageImage[],
  text: (key: string, values: Record<string, number>) => string,
) {
  const { selected } = cropPlan(settings, pages);
  return { title: text("workspace.pagesSelected", { selected: selected.length, count }), detail: null };
}

function CropSettings({
  pages,
  props,
  completed,
}: {
  pages: readonly PdfPageImage[];
  props: WorkspaceProps;
  completed: boolean;
}) {
  const toolText = useToolTranslations("Tool.runtime");
  const id = useId();
  const seeded = useRef(false);
  useEffect(() => {
    if (!pages.length || seeded.current) return;
    seeded.current = true;
    for (const [key, value] of Object.entries({
      pages: "all",
      cropX: 0,
      cropY: 0,
      cropWidth: Math.floor(Math.min(...pages.map((p) => p.pageWidth))),
      cropHeight: Math.floor(Math.min(...pages.map((p) => p.pageHeight))),
    })) {
      props.onSettingChange(key, value);
    }
  }, [pages, props.onSettingChange]);
  const expression = Array.isArray(props.settings.pages)
    ? props.settings.pages.join(",")
    : String(props.settings.pages ?? "all");
  const mode = ["all", "odd", "even"].includes(expression) ? expression : "custom";
  let summary = "";
  try {
    const { selected } = cropPlan(props.settings, pages);
    summary = toolText(completed ? "workspace.pagesCroppedSummary" : "workspace.pagesSelectedSummary", {
      selected: selected.length,
      count: pages.length,
      unchanged: pages.length - selected.length,
    });
  } catch {
    /* The shared action area displays validation. */
  }
  return (
    <>
      <div className="grid gap-1.5">
        <FieldLabel htmlFor={`${id}-pages`}>{toolText("workspace.apply_crop_to_968ae0")}</FieldLabel>
        <Select
          id={`${id}-pages`}
          disabled={props.disabled}
          value={mode}
          onChange={(event) =>
            props.onSettingChange("pages", event.target.value === "custom" ? "" : event.target.value)
          }
        >
          <option value="all">{toolText("workspace.all_pages_903542")}</option>
          <option value="odd">{toolText("workspace.odd_pages_e31c32")}</option>
          <option value="even">{toolText("workspace.even_pages_bd5d2d")}</option>
          <option value="custom">{toolText("workspace.custom_pages_ffe911")}</option>
        </Select>
      </div>
      {mode === "custom" && (
        <div className="grid gap-1.5">
          <FieldLabel htmlFor={`${id}-range`}>{toolText("workspace.page_range_6578bb")}</FieldLabel>
          <Input
            id={`${id}-range`}
            disabled={props.disabled}
            value={expression}
            placeholder="2-4"
            onChange={(event) => props.onSettingChange("pages", event.target.value)}
          />
        </div>
      )}
      {summary && <Caption role="status">{summary}</Caption>}
      <FieldLabel>{toolText("workspace.crop_box_pdf_4d9949")}</FieldLabel>
      <div className="grid grid-cols-2 gap-3">
        {DIMENSIONS.map(([key, label, Icon]) => (
          <div className="grid gap-1.5" key={key}>
            <FieldLabel htmlFor={`${id}-${key}`}>{toolText(`workspace.dimensions.${key}`)}</FieldLabel>
            <Input
              id={`${id}-${key}`}
              aria-describedby={`${id}-units`}
              disabled={props.disabled}
              leadingIcon={<Icon />}
              suffix="pt"
              type="number"
              min={key === "cropWidth" || key === "cropHeight" ? 1 : 0}
              step={1}
              value={String(props.settings[key] ?? 0)}
              onChange={(event) =>
                props.onSettingChange(key, event.target.value === "" ? "" : Math.round(event.target.valueAsNumber))
              }
            />
          </div>
        ))}
      </div>
      <Caption id={`${id}-units`}>{toolText("workspace.use_whole_number_cc79b4")}</Caption>
    </>
  );
}

export default function CropPdfWorkspace(props: WorkspaceProps) {
  const toolText = useToolTranslations("Tool.runtime");
  const [dismissedResult, setDismissedResult] = useState<WorkspaceProps["result"]>(null);
  const completed = Boolean(props.result && props.result !== dismissedResult);
  const output =
    completed && props.result?.render === "files"
      ? props.result.files.find((file) => file.mime === "application/pdf")
      : undefined;
  const change: WorkspaceProps["onSettingChange"] = (key, value) => {
    props.onSettingChange(key, value);
  };
  const inputChange = props.onInputChange;
  const edit = () => setDismissedResult(props.result);
  return (
    <PdfFileWorkspace
      {...props}
      onInputChange={inputChange}
      onSettingChange={change}
      definitionKey="crop-pdf"
      optionsTitle={toolText("workspace.cropSettings")}
      getPlan={(settings, count, pages) => getPlan(settings, count, pages, toolText)}
      primaryAction={
        props.primaryAction ? { ...props.primaryAction, label: toolText("workspace.crop_pdf_dc4bdb") } : null
      }
      renderOptions={(pages) => (
        <CropSettings
          key={props.input.files[0] ? workspaceFileId(props.input.files[0]) : "empty"}
          pages={pages}
          props={{ ...props, onSettingChange: change }}
          completed={completed && !props.running && !props.error}
        />
      )}
      renderPageOverlay={(page, pages) => {
        if (!page.url) return null;
        try {
          const { box, bounds, selected } = cropEditorPlan(props.settings, pages);
          if (!selected.includes(page.pageNumber)) return null;
          return (
            <div
              className="absolute bottom-0 left-0"
              style={{
                width: `${(bounds.width / page.pageWidth) * 100}%`,
                height: `${(bounds.height / page.pageHeight) * 100}%`,
              }}
            >
              <CropFrame
                handles="all"
                box={box}
                bounds={bounds}
                disabled={props.disabled}
                originBottomLeft
                onChange={(next) => {
                  for (const [key, axis] of [
                    ["cropX", "x"],
                    ["cropY", "y"],
                    ["cropWidth", "width"],
                    ["cropHeight", "height"],
                  ] as const)
                    if (next[axis] !== props.settings[key]) change(key, next[axis]);
                }}
              />
            </div>
          );
        } catch {
          return null;
        }
      }}
      secondaryActions={
        <div className="flex flex-wrap gap-2">
          <Caption>{toolText("workspace.drag_to_move_22b33b")}</Caption>
        </div>
      }
      completedPreview={output ? <GeneratedPdfPreview fill file={output} definitionKey="crop-pdf" /> : undefined}
      completionActions={
        <div className="grid w-full grid-cols-2 gap-2">
          <Button className="w-full" variant="outline" onClick={edit}>
            {toolText("workspace.edit_crop_d614bb")}
          </Button>
          <Button className="w-full" variant="outline" onClick={() => inputChange({ ...props.input, files: [] })}>
            {toolText("workspace.crop_another_pdf_2a6923")}
          </Button>
        </div>
      }
    />
  );
}
