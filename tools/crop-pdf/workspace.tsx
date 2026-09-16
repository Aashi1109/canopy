"use client";

import { Button, Caption, FieldLabel, Input, Select } from "@smarttools/ui";
import { MoveHorizontal, MoveVertical, PanelBottom, PanelLeft } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { CropFrame } from "@/components/CropFrame";
import { workspaceFileId } from "@/components/FileInput";
import { GeneratedPdfPreview } from "@/components/GeneratedPdfPreview";
import { PdfFileWorkspace } from "@/components/PdfFileWorkspace";
import type { PdfPageImage } from "@/components/PdfPagesSurface";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import { cropPlan } from "./plan";

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
) {
  const { selected } = cropPlan(settings, pages);
  return { title: `${selected.length} of ${count} pages selected`, detail: null };
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
    summary = `${selected.length} of ${pages.length} pages ${completed ? "cropped" : "selected"}. ${pages.length - selected.length} unchanged.`;
  } catch {
    /* The shared action area displays validation. */
  }
  return (
    <>
      <div className="grid gap-1.5">
        <FieldLabel htmlFor={`${id}-pages`}>Apply crop to</FieldLabel>
        <Select
          id={`${id}-pages`}
          disabled={props.disabled}
          value={mode}
          onChange={(event) =>
            props.onSettingChange(
              "pages",
              event.target.value === "custom" ? "" : event.target.value,
            )
          }
        >
          <option value="all">All pages</option>
          <option value="odd">Odd pages</option>
          <option value="even">Even pages</option>
          <option value="custom">Custom pages</option>
        </Select>
      </div>
      {mode === "custom" && (
        <div className="grid gap-1.5">
          <FieldLabel htmlFor={`${id}-range`}>Page range</FieldLabel>
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
      <FieldLabel>Crop box · PDF points</FieldLabel>
      <div className="grid grid-cols-2 gap-3">
        {DIMENSIONS.map(([key, label, Icon]) => (
          <div className="grid gap-1.5" key={key}>
            <FieldLabel htmlFor={`${id}-${key}`}>{label}</FieldLabel>
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
                props.onSettingChange(
                  key,
                  event.target.value === "" ? "" : Math.round(event.target.valueAsNumber),
                )
              }
            />
          </div>
        ))}
      </div>
      <Caption id={`${id}-units`}>
        Use whole-number points. Bottom is measured upward from the page edge. 72 pt = 1 inch.
      </Caption>
    </>
  );
}

export default function CropPdfWorkspace(props: WorkspaceProps) {
  const [dismissedResult, setDismissedResult] = useState<WorkspaceProps["result"]>(null);
  const completed = Boolean(props.result && props.result !== dismissedResult && !props.running);
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
      result={completed ? props.result : null}
      onInputChange={inputChange}
      onSettingChange={change}
      definitionKey="crop-pdf"
      optionsTitle="Crop settings"
      getPlan={getPlan}
      primaryAction={props.primaryAction ? { ...props.primaryAction, label: "Crop PDF" } : null}
      renderOptions={(pages) => (
        <CropSettings
          key={props.input.files[0] ? workspaceFileId(props.input.files[0]) : "empty"}
          pages={pages}
          props={{ ...props, onSettingChange: change }}
          completed={completed}
        />
      )}
      renderPageOverlay={(page, pages) => {
        if (!page.url) return null;
        try {
          const { box, selected } = cropPlan(props.settings, pages);
          if (!selected.includes(page.pageNumber)) return null;
          return (
            <CropFrame
              handles="all"
              box={box}
              bounds={{ width: Math.floor(page.pageWidth), height: Math.floor(page.pageHeight) }}
              disabled={props.disabled}
              originBottomLeft
              onChange={(next) => {
                for (const [key, axis] of [
                  ["cropX", "x"],
                  ["cropY", "y"],
                  ["cropWidth", "width"],
                  ["cropHeight", "height"],
                ] as const)
                  if (next[axis] !== box[axis]) change(key, next[axis]);
              }}
            />
          );
        } catch {
          return null;
        }
      }}
      secondaryActions={
        <div className="flex flex-wrap gap-2">
          <Caption>
            Drag to move. Drag an edge or corner to resize. Arrow keys move by 1 pt; Shift moves by
            10 pt.
          </Caption>
        </div>
      }
      completedPreview={
        output ? <GeneratedPdfPreview fill file={output} definitionKey="crop-pdf" /> : undefined
      }
      completionActions={
        <div className="grid w-full grid-cols-2 gap-2">
          <Button className="w-full" variant="outline" onClick={edit}>
            Edit crop
          </Button>
          <Button
            className="w-full"
            variant="outline"
            onClick={() => inputChange({ ...props.input, files: [] })}
          >
            Crop another PDF
          </Button>
        </div>
      }
    />
  );
}
