"use client";

import { useTranslations } from "next-intl";
import { Strong, CodeBlock, Muted } from "@/components/ui/index.tsx";
import { ArrowRight } from "lucide-react";
import { Fragment, useEffect, useMemo } from "react";

import { SettingsPanel } from "@/components/SettingsPanel";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";

import { buildReplacementPreview, type ReplacementPreview } from "./preview";

function PreviewText({ preview }: { preview: ReplacementPreview }) {
  const t = useTranslations("Tool.runtime");
  return preview.parts.map((part, index) => {
    if (part.kind === "text") {
      return <Fragment key={index}>{part.text}</Fragment>;
    }
    if (part.kind === "unpreviewed") {
      return (
        <span className="rounded-sm border border-dashed border-border bg-muted px-1 text-muted-foreground" key={index}>
          {t("find.hiddenMatches", { count: part.hiddenMatchCount })} {part.text}
        </span>
      );
    }

    return (
      <span className="inline-flex items-baseline gap-1" key={index}>
        <Strong
          className="rounded-sm bg-destructive/10 px-1 text-foreground line-through decoration-destructive/70"
          data-preview-role="found"
        >
          {part.found || t("find.emptyMatch")}
        </Strong>
        <ArrowRight aria-hidden="true" className="relative top-0.5 inline size-3 shrink-0 text-muted-foreground" />
        <Strong className="rounded-sm bg-success/10 px-1 text-foreground" data-preview-role="replacement">
          {part.replacement || t("find.delete")}
        </Strong>
      </span>
    );
  });
}

function AppliedResultText({ preview }: { preview: ReplacementPreview }) {
  return preview.parts.map((part, index) => {
    if (part.kind === "text") {
      return <Fragment key={index}>{part.text}</Fragment>;
    }
    if (part.kind === "unpreviewed") return null;
    return (
      <Strong
        className="rounded-sm bg-success/10 px-1 text-foreground"
        data-preview-role="applied-replacement"
        key={index}
      >
        {part.replacement || ""}
      </Strong>
    );
  });
}

function previewMeta(preview: ReplacementPreview, t: ReturnType<typeof useTranslations>): string {
  if (preview.invalidPattern) return t("find.invalidPattern");
  if (preview.count === 0) return t("find.noMatches");
  if (preview.truncated) {
    return t("find.truncatedPreview", { count: preview.count, shown: preview.previewedCount });
  }
  return t("find.inlinePreview", { count: preview.count });
}

export default function FindAndReplaceWorkspace(props: WorkspaceProps) {
  const t = useTranslations("Tool.runtime");
  const inputSpec = props.spec.input;
  const find = typeof props.settings.find === "string" ? props.settings.find : "";
  const replace = typeof props.settings.replace === "string" ? props.settings.replace : "";
  const preview = useMemo(
    () =>
      buildReplacementPreview(props.input.text, {
        ci: props.settings.ci === true,
        find,
        regex: props.settings.regex === true,
        replace,
      }),
    [find, props.input.text, props.settings.ci, props.settings.regex, replace],
  );

  const validationReason = !props.input.text.trim()
    ? null
    : !find
      ? t("find.enterPattern")
      : preview.invalidPattern
        ? t("find.validPattern")
        : preview.count === 0
          ? t("find.noSourceMatches")
          : null;

  useEffect(() => {
    props.onValidationChange?.(validationReason);
    return () => props.onValidationChange?.(null);
  }, [props.onValidationChange, validationReason]);

  const actionLabel = preview.count > 0 ? t("find.applyCount", { count: preview.count }) : t("find.apply");

  useEffect(() => {
    props.onToolbarActionsChange?.({ primaryActionLabel: actionLabel });
    return () => props.onToolbarActionsChange?.(null);
  }, [actionLabel, props.onToolbarActionsChange]);

  if (inputSpec.kind !== "text") return null;

  const highlightedResult =
    props.result?.render === "text" &&
    !preview.truncated &&
    props.result.text ===
      preview.parts.map((part) => (part.kind === "replacement" ? part.replacement : part.text)).join("");

  return (
    <ToolWorkspace
      {...props}
      highlightedInput={preview.count > 0 ? <PreviewText preview={preview} /> : undefined}
      inputHighlightMode="preview"
      renderInputSettings={() => (
        <div className="grid shrink-0 gap-2 px-4 pt-4">
          <SettingsPanel
            disabled={props.disabled}
            layout="grid"
            onChange={props.onSettingChange}
            onSubmit={() => {
              if (!props.primaryAction || props.primaryAction.disabled || props.primaryAction.running) return;
              props.primaryAction.onRun();
            }}
            pane="input"
            spec={props.spec.settings}
            values={props.settings}
          />
          <Muted
            className={
              validationReason && (preview.invalidPattern || !find) ? "text-destructive" : "text-muted-foreground"
            }
            role={validationReason && (preview.invalidPattern || !find) ? "alert" : "status"}
          >
            {validationReason ?? (preview.count > 0 ? previewMeta(preview, t) : t("find.previewHint"))}
          </Muted>
        </div>
      )}
      renderResult={
        highlightedResult
          ? () => (
              <CodeBlock className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-4 text-foreground">
                <AppliedResultText preview={preview} />
              </CodeBlock>
            )
          : undefined
      }
    />
  );
}
