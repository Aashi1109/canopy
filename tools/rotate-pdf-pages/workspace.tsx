"use client";

import { useTranslations } from "next-intl";

import { Button, Caption, FieldLabel, Input, Select } from "@/components/ui/index.tsx";
import { RotateCcw, RotateCw, FlipVertical2 } from "lucide-react";
import { useId, useState } from "react";

import { GeneratedPdfPreview } from "@/components/GeneratedPdfPreview";
import { PdfFileWorkspace } from "@/components/PdfFileWorkspace";
import type { PdfPageImage } from "@/components/PdfPagesSurface";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import { parsePageSelection } from "@/lib/tool-framework/settings";

function rotationPlan(settings: WorkspaceProps["settings"], count: number, t: ReturnType<typeof useTranslations>) {
  const raw = settings.rotateSelectedOnly === false ? "all" : settings.pages;
  const expression = Array.isArray(raw) ? raw.join(",") : String(raw ?? "all");
  let parsed: ReturnType<typeof parsePageSelection>;
  try {
    parsed = parsePageSelection(expression, count);
  } catch {
    throw new Error(t("workspace.choosePages", { count }));
  }
  const selected = parsed === "all" ? Array.from({ length: count }, (_, index) => index + 1) : parsed;
  if (!selected.length) throw new Error(t("workspace.choosePages", { count }));
  const turn = settings.degrees === "180" ? 180 : settings.degrees === "270" ? 270 : 90;
  return { selected, turn } as const;
}

function getPlan(settings: WorkspaceProps["settings"], count: number, t: ReturnType<typeof useTranslations>) {
  const { selected, turn } = rotationPlan(settings, count, t);
  return { title: t("workspace.planTitle", { selected: selected.length, count, degrees: turn }), detail: null };
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
  const t = useTranslations("Tool.runtime");
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
    const { selected } = rotationPlan(props.settings, pages.length, t);
    if (pages.length)
      summary = t("workspace.summary", {
        selected: selected.length,
        count: pages.length,
        state: completed ? "completed" : "pending",
        unchanged: pages.length - selected.length,
      });
  } catch (error) {
    if (pages.length && mode === "custom") rangeError = t("workspace.validPages");
  }
  return (
    <>
      <div className="grid gap-2">
        <FieldLabel>{t("workspace.rotation")}</FieldLabel>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label={t("workspace.rotationAngle")}>
          {(
            [
              ["90", t("workspace.right"), RotateCw],
              ["180", t("workspace.halfTurn"), FlipVertical2],
              ["270", t("workspace.left"), RotateCcw],
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
        <Caption>{t("workspace.addedToTheCurrentOrientationPreviewUpdates")}</Caption>
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor={`${id}-scope`}>{t("workspace.applyTo")}</FieldLabel>
        <Select
          id={`${id}-scope`}
          value={mode}
          disabled={props.disabled}
          onChange={(event) => {
            props.onSettingChange("rotateSelectedOnly", true);
            props.onSettingChange("pages", event.target.value === "custom" ? "" : event.target.value);
          }}
        >
          <option value="all">{t("workspace.allPages")}</option>
          <option value="odd">{t("workspace.oddPages")}</option>
          <option value="even">{t("workspace.evenPages")}</option>
          <option value="custom">{t("workspace.customPages")}</option>
        </Select>
      </div>
      {mode === "custom" && (
        <div className="grid gap-2">
          <FieldLabel htmlFor={`${id}-range`}>{t("workspace.pageRange")}</FieldLabel>
          <Input
            id={`${id}-range`}
            value={expression}
            aria-invalid={Boolean(rangeError)}
            aria-describedby={rangeError ? `${id}-error` : undefined}
            disabled={props.disabled}
            placeholder={t("workspace.rangeExample")}
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
  const t = useTranslations("Tool.runtime");
  const [dismissed, setDismissed] = useState<WorkspaceProps["result"]>(null);
  const completed = props.result && props.result !== dismissed;
  const output =
    completed && props.result?.render === "files"
      ? props.result.files.find((file) => file.mime === "application/pdf")
      : undefined;
  return (
    <PdfFileWorkspace
      {...props}
      definitionKey="rotate-pdf-pages"
      optionsTitle={t("workspace.rotatePages")}
      getPlan={(settings, count) => getPlan(settings, count, t)}
      getPageRotation={(page, pages) => {
        try {
          const { selected, turn } = rotationPlan(props.settings, pages.length, t);
          return selected.includes(page.pageNumber) ? turn : 0;
        } catch {
          return 0;
        }
      }}
      renderOptions={(pages) => (
        <RotationSettings
          props={props}
          pages={pages}
          completed={Boolean(completed && !props.running && !props.error)}
        />
      )}
      secondaryActions={<Caption>{t("workspace.yourOriginalStaysUnchangedPageOrderAnd")}</Caption>}
      completedPreview={
        output ? <GeneratedPdfPreview fill file={output} definitionKey="rotate-pdf-pages" /> : undefined
      }
      completionActions={
        <div className="grid grid-cols-2 gap-2">
          <Button className="w-full" variant="outline" onClick={() => setDismissed(props.result)}>
            {t("workspace.editRotation")}
          </Button>
          <Button
            className="w-full"
            variant="outline"
            onClick={() => props.onInputChange({ ...props.input, files: [] })}
          >
            {t("workspace.rotateAnotherPdf")}
          </Button>
        </div>
      }
    />
  );
}
