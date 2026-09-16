"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Caption,
  FieldLabel,
  Input,
} from "@smarttools/ui";
import { useEffect, useId, useState } from "react";
import { validateFileSelection } from "@/components/FileInput";
import { PdfFileWorkspace, PdfPageSelectionOverlay } from "@/components/PdfFileWorkspace";
import type { PdfPageImage } from "@/components/PdfPagesSurface";
import { SettingsPanel } from "@/components/SettingsPanel";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import { parsePageRange, validateImageSelection } from "@/lib/tool-framework/media/validation";
import { parsePageSelection } from "@/lib/tool-framework/settings";

function selectedPages(value: unknown, pageCount: number): number[] {
  const expression = (Array.isArray(value) ? value.join(",") : String(value ?? "all"))
    .trim()
    .toLowerCase();
  if (expression === "odd" || expression === "even") {
    const pages = parsePageSelection(expression, pageCount) as number[];
    if (!pages.length) throw new Error("No pages match this selection. Choose pages in your PDF.");
    return pages;
  }
  const result = parsePageRange(expression, pageCount);
  if (!result.ok) throw new Error(result.message);
  return result.pages;
}

function PlacementPreview({
  imageUrl,
  page,
  settings,
}: {
  imageUrl: string | null;
  page: PdfPageImage;
  settings: WorkspaceProps["settings"];
}) {
  const [vertical, horizontal] = String(settings.position ?? "bottom-center").split("-");
  const placement = {
    left: horizontal === "left" ? "14%" : horizontal === "right" ? "86%" : "50%",
    top: vertical === "top" ? "14%" : vertical === "bottom" ? "86%" : "50%",
    opacity: Math.max(0.05, Number(settings.opacity ?? 25) / 100),
    transform: `translate(-50%, -50%) rotate(${Number(settings.watermarkRotation ?? -30)}deg)`,
  };
  const size = Number(settings.watermarkSize ?? 48);
  return settings.watermarkKind === "image" ? (
    imageUrl && (
      <img
        alt="Approximate watermark"
        className="pointer-events-none absolute h-auto"
        src={imageUrl}
        style={{ ...placement, width: `${Math.max(1, Math.min(100, size))}%` }}
      />
    )
  ) : (
    <span
      className="pointer-events-none absolute max-w-[85%] text-center font-bold text-foreground"
      style={{ ...placement, fontSize: `${(size / page.pageWidth) * 100}cqw` }}
    >
      {String(settings.watermarkText ?? "DRAFT")}
    </span>
  );
}

export default function WatermarkPdfWorkspace(props: WorkspaceProps) {
  const document = props.input.files.find(
    (file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name),
  );
  const watermark = props.input.files.find((file) => file !== document);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [inputIssue, setInputIssue] = useState("");
  const imageInputId = useId();
  useEffect(() => {
    setInputIssue("");
    if (!watermark) {
      setImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(watermark);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [document, watermark]);
  if (props.spec.input.kind !== "files") return null;
  const inputSpec = props.spec.input;
  const { watermarkKind, ...watermarkFields } = props.spec.settings.fields;
  const sourceSpec = {
    ...props.spec,
    input: {
      ...inputSpec,
      accept: "application/pdf",
      label: "PDF document",
      multiple: false,
      maxFiles: 1,
    },
  };
  const updateFiles = (files: File[]) => {
    const selection = validateFileSelection([], files, inputSpec);
    setInputIssue(selection.issue);
    if (!selection.issue) props.onInputChange({ ...props.input, files: selection.files });
  };
  return (
    <PdfFileWorkspace
      {...props}
      spec={sourceSpec}
      input={{ ...props.input, files: document ? [document] : [] }}
      onInputChange={(input) => updateFiles([...input.files, ...(watermark ? [watermark] : [])])}
      definitionKey="watermark-pdf"
      optionsTitle="Watermark settings"
      getPlan={(settings, pageCount) => {
        const pages = selectedPages(settings.pages, pageCount);
        if (settings.watermarkKind === "image") {
          if (!watermark) throw new Error("Choose a JPG or PNG watermark image.");
          const image = validateImageSelection([{ size: watermark.size }]);
          if (!image.ok) throw new Error(image.message);
        } else if (!String(settings.watermarkText ?? "").trim())
          throw new Error("Enter watermark text.");
        return {
          title: `${pages.length} ${pages.length === 1 ? "page will" : "pages will"} receive a watermark`,
          detail:
            "Placement is approximate. Apply the watermark and check the downloaded PDF. Your original stays unchanged.",
        };
      }}
      pageClassName="rounded-lg border-0 [container-type:inline-size]"
      renderPageOverlay={(page, pages) => {
        let selection: number[];
        try {
          selection = selectedPages(props.settings.pages, pages.length);
        } catch {
          selection = [];
        }
        const selected = selection.includes(page.pageNumber);
        return (
          <>
            {selected && (
              <PlacementPreview imageUrl={imageUrl} page={page} settings={props.settings} />
            )}
            <PdfPageSelectionOverlay
              pageNumber={page.pageNumber}
              selected={selected}
              disabled={props.disabled}
              onToggle={() =>
                props.onSettingChange(
                  "pages",
                  (selected
                    ? selection.filter((number) => number !== page.pageNumber)
                    : [...selection, page.pageNumber]
                  ).join(","),
                )
              }
            />
          </>
        );
      }}
      renderOptions={() => (
        <>
          <SettingsPanel
            disabled={props.disabled}
            onChange={props.onSettingChange}
            spec={{ fields: { watermarkKind } }}
            values={props.settings}
          />
          {props.settings.watermarkKind === "image" && (
            <div className="grid gap-2">
              <FieldLabel htmlFor={imageInputId}>
                {watermark ? "Replace watermark image" : "Watermark image"}
              </FieldLabel>
              <Input
                accept="image/jpeg,image/png"
                disabled={props.disabled}
                id={imageInputId}
                type="file"
                onChange={(event) => {
                  const image = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (!image) return;
                  const selection = validateFileSelection([], [image], {
                    ...inputSpec,
                    accept: "image/jpeg,image/png",
                    multiple: false,
                    maxFiles: 1,
                  });
                  const valid = validateImageSelection([{ size: image.size }]);
                  if (selection.issue || !valid.ok) {
                    setInputIssue(selection.issue || (!valid.ok ? valid.message : ""));
                    return;
                  }
                  updateFiles([...(document ? [document] : []), image]);
                }}
              />
              <Caption className="text-muted-foreground">
                JPG or PNG · 25 MiB max · PDF and image combined: 50 MiB max
              </Caption>
              {watermark && (
                <div className="flex min-w-0 items-center gap-2">
                  <Caption className="min-w-0 flex-1 break-all">{watermark.name}</Caption>
                  <Button
                    disabled={props.disabled}
                    onClick={() => updateFiles(document ? [document] : [])}
                    size="sm"
                    variant="outline"
                  >
                    Remove image
                  </Button>
                </div>
              )}
            </div>
          )}
          {inputIssue && (
            <Alert variant="destructive">
              <AlertTitle>File not added</AlertTitle>
              <AlertDescription>{inputIssue}</AlertDescription>
            </Alert>
          )}
          <SettingsPanel
            disabled={props.disabled}
            onChange={props.onSettingChange}
            spec={{ fields: watermarkFields }}
            values={props.settings}
          />
        </>
      )}
    />
  );
}
