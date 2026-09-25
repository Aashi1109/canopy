"use client";

import { Strong, CodeBlock, Muted } from "@/components/ui/index.tsx";
import { ArrowRight } from "lucide-react";
import { Fragment, useEffect, useMemo } from "react";

import { SettingsPanel } from "@/components/SettingsPanel";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";

import { buildReplacementPreview, type ReplacementPreview } from "./preview";

function PreviewText({ preview }: { preview: ReplacementPreview }) {
  return preview.parts.map((part, index) => {
    if (part.kind === "text") {
      return <Fragment key={index}>{part.text}</Fragment>;
    }
    if (part.kind === "unpreviewed") {
      return (
        <span className="rounded-sm border border-dashed border-border bg-muted px-1 text-muted-foreground" key={index}>
          {`[${part.hiddenMatchCount} more matches not expanded] ${part.text}`}
        </span>
      );
    }

    return (
      <span className="inline-flex items-baseline gap-1" key={index}>
        <Strong
          className="rounded-sm bg-destructive/10 px-1 text-foreground line-through decoration-destructive/70"
          data-preview-role="found"
        >
          {part.found || "empty match"}
        </Strong>
        <ArrowRight aria-hidden="true" className="relative top-0.5 inline size-3 shrink-0 text-muted-foreground" />
        <Strong className="rounded-sm bg-success/10 px-1 text-foreground" data-preview-role="replacement">
          {part.replacement || "delete"}
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

function previewMeta(preview: ReplacementPreview): string {
  if (preview.invalidPattern) return "Invalid regular expression";
  if (preview.count === 0) return "No matches";
  if (preview.truncated) {
    return `${preview.count} matches · First ${preview.previewedCount} expanded · Focus to edit`;
  }
  return `${preview.count} inline ${preview.count === 1 ? "preview" : "previews"} · Focus to edit`;
}

export default function FindAndReplaceWorkspace(props: WorkspaceProps) {
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
      ? "Enter the text or pattern to find."
      : preview.invalidPattern
        ? "Enter a valid regular expression in Find."
        : preview.count === 0
          ? "No matches were found in the source text."
          : null;

  useEffect(() => {
    props.onValidationChange?.(validationReason);
    return () => props.onValidationChange?.(null);
  }, [props.onValidationChange, validationReason]);

  const actionLabel =
    preview.count > 0
      ? `Apply ${preview.count} ${preview.count === 1 ? "replacement" : "replacements"}`
      : "Apply replacements";

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
            {validationReason ??
              (preview.count > 0 ? previewMeta(preview) : "Matches preview inline before you apply replacements.")}
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
