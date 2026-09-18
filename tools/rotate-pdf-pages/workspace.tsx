"use client";

import { Button, Caption, FieldLabel, Input, Select } from "@/components/ui/index.tsx";
import { RotateCcw, RotateCw, FlipVertical2 } from "lucide-react";
import { useId, useState } from "react";

import { GeneratedPdfPreview } from "@/components/GeneratedPdfPreview";
import { PdfFileWorkspace } from "@/components/PdfFileWorkspace";
import type { PdfPageImage } from "@/components/PdfPagesSurface";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import { parsePageSelection } from "@/lib/tool-framework/settings";

function rotationPlan(settings: WorkspaceProps["settings"], count: number) {
  const raw = settings.rotateSelectedOnly === false ? "all" : settings.pages;
  const expression = Array.isArray(raw) ? raw.join(",") : String(raw ?? "all");
  const parsed = parsePageSelection(expression, count);
  const selected = parsed === "all" ? Array.from({ length: count }, (_, index) => index + 1) : parsed;
  if (!selected.length) throw new Error(`Choose pages from 1 to ${count}.`);
  const turn = settings.degrees === "180" ? 180 : settings.degrees === "270" ? 270 : 90;
  return { selected, turn } as const;
}

function getPlan(settings: WorkspaceProps["settings"], count: number) {
  const { selected, turn } = rotationPlan(settings, count);
  return { title: `${selected.length} of ${count} pages · ${turn}° clockwise`, detail: null };
}

function RotationSettings({
  props,
  pages,
  completed,
}: {
  props: WorkspaceProps;
  pages: readonly PdfPageImage[];
  completed: boolean;
}) {
  const id = useId();
  const expression = Array.isArray(props.settings.pages)
    ? props.settings.pages.join(",")
    : String(props.settings.pages ?? "all");
  const mode =
    props.settings.rotateSelectedOnly === false
      ? "all"
      : ["all", "odd", "even"].includes(expression)
        ? expression
        : "custom";
  let summary = "";
  let rangeError = "";
  try {
    const { selected } = rotationPlan(props.settings, pages.length);
    if (pages.length)
      summary = `${selected.length} of ${pages.length} pages ${completed ? "rotated" : "will rotate"}. ${pages.length - selected.length} unchanged.`;
  } catch (error) {
    if (pages.length && mode === "custom")
      rangeError = error instanceof Error ? error.message : "Enter valid page numbers.";
  }
  return (
    <>
      <div className="grid gap-2">
        <FieldLabel>Rotation</FieldLabel>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Rotation angle">
          {(
            [
              ["90", "90° right", RotateCw],
              ["180", "180°", FlipVertical2],
              ["270", "90° left", RotateCcw],
            ] as const
          ).map(([value, label, Icon]) => (
            <Button
              key={value}
              variant={props.settings.degrees === value ? "default" : "outline"}
              aria-pressed={props.settings.degrees === value}
              disabled={props.disabled}
              onClick={() => props.onSettingChange("degrees", value)}
            >
              <Icon aria-hidden="true" />
              {label}
            </Button>
          ))}
        </div>
        <Caption>Added to the current orientation. Preview updates immediately.</Caption>
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor={`${id}-scope`}>Apply to</FieldLabel>
        <Select
          id={`${id}-scope`}
          value={mode}
          disabled={props.disabled}
          onChange={(event) => {
            props.onSettingChange("rotateSelectedOnly", true);
            props.onSettingChange("pages", event.target.value === "custom" ? "" : event.target.value);
          }}
        >
          <option value="all">All pages</option>
          <option value="odd">Odd pages</option>
          <option value="even">Even pages</option>
          <option value="custom">Custom pages</option>
        </Select>
      </div>
      {mode === "custom" && (
        <div className="grid gap-2">
          <FieldLabel htmlFor={`${id}-range`}>Page range</FieldLabel>
          <Input
            id={`${id}-range`}
            value={expression}
            aria-invalid={Boolean(rangeError)}
            aria-describedby={rangeError ? `${id}-error` : undefined}
            disabled={props.disabled}
            placeholder="e.g. 1, 3-5"
            onChange={(event) => props.onSettingChange("pages", event.target.value)}
          />
          {rangeError && (
            <Caption id={`${id}-error`} role="alert">
              {rangeError}
            </Caption>
          )}
        </div>
      )}
      {summary && <Caption role="status">{summary}</Caption>}
    </>
  );
}

export default function RotatePdfPagesWorkspace(props: WorkspaceProps) {
  const [dismissed, setDismissed] = useState<WorkspaceProps["result"]>(null);
  const completed = props.result && props.result !== dismissed && !props.running;
  const output =
    completed && props.result?.render === "files"
      ? props.result.files.find((file) => file.mime === "application/pdf")
      : undefined;
  return (
    <PdfFileWorkspace
      {...props}
      result={completed ? props.result : null}
      definitionKey="rotate-pdf-pages"
      optionsTitle="Rotate pages"
      getPlan={getPlan}
      getPageRotation={(page, pages) => {
        try {
          const { selected, turn } = rotationPlan(props.settings, pages.length);
          return selected.includes(page.pageNumber) ? turn : 0;
        } catch {
          return 0;
        }
      }}
      renderOptions={(pages) => <RotationSettings props={props} pages={pages} completed={Boolean(completed)} />}
      secondaryActions={<Caption>Your original stays unchanged. Page order and quality are preserved.</Caption>}
      completedPreview={
        output ? <GeneratedPdfPreview fill file={output} definitionKey="rotate-pdf-pages" /> : undefined
      }
      completionActions={
        <div className="grid grid-cols-2 gap-2">
          <Button className="w-full" variant="outline" onClick={() => setDismissed(props.result)}>
            Edit rotation
          </Button>
          <Button
            className="w-full"
            variant="outline"
            onClick={() => props.onInputChange({ ...props.input, files: [] })}
          >
            Rotate another PDF
          </Button>
        </div>
      }
    />
  );
}
