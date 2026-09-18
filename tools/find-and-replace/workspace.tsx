"use client";

import { Strong, FieldLabel, CodeBlock, Muted, ToolOptionsPanel } from "@/components/ui/index.tsx";
import { ArrowRight } from "lucide-react";
import { Fragment, useEffect, useId, useMemo } from "react";

import { ResultSurface } from "@/components/ResultSurface";
import { ResultActions } from "@/components/ResultView";
import { SettingsPanel } from "@/components/SettingsPanel";
import { SplitStack } from "@/components/Stacks";
import { WorkspaceSurface } from "@/components/Surfaces";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import { SourceTextarea } from "@/components/WorkspaceInput";

import { buildReplacementPreview, type ReplacementPreview } from "./preview";

function PreviewText({ preview }: { preview: ReplacementPreview }) {
  return preview.parts.map((part, index) => {
    if (part.kind === "text") {
      return <Fragment key={index}>{part.text}</Fragment>;
    }
    if (part.kind === "unpreviewed") {
      return (
        <span
          className="rounded-sm border border-dashed border-border bg-muted px-1 text-muted-foreground"
          key={index}
          title={`${part.hiddenMatchCount} additional matches are not expanded inline`}
        >
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

function compactPreviewMeta(preview: ReplacementPreview): string {
  if (preview.invalidPattern) return "Invalid regex";
  if (preview.count === 0) return "No matches";
  return `${preview.count} ${preview.count === 1 ? "preview" : "previews"}`;
}

export default function FindAndReplaceWorkspace(props: WorkspaceProps) {
  const inputId = useId();
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

  const highlightedResult = props.result?.render === "text" && !preview.truncated;

  return (
    <SplitStack
      className="h-full"
      collapseLabel="find and replace settings"
      collapseSide="secondary"
      collapsible
      defaultSize={75}
      minSize={75}
    >
      <div className="grid h-full min-h-0 grid-rows-[minmax(14rem,1fr)_minmax(14rem,1fr)] gap-5 overflow-y-auto border-r border-border p-5 max-[64rem]:min-h-[44rem] max-[64rem]:border-r-0 max-[64rem]:border-b">
        <WorkspaceSurface
          className="h-full"
          contentClassName="bg-background"
          meta={
            <>
              <span className="max-[30rem]:hidden">{previewMeta(preview)}</span>
              <span className="hidden max-[30rem]:inline">{compactPreviewMeta(preview)}</span>
            </>
          }
          purpose="source"
          title="Source text"
          variant="card"
        >
          <FieldLabel className="sr-only" htmlFor={inputId}>
            {inputSpec.label}
          </FieldLabel>
          <SourceTextarea
            className="min-h-0 flex-1"
            disabled={props.disabled}
            highlightedValue={preview.count > 0 ? <PreviewText preview={preview} /> : undefined}
            highlightMode="preview"
            id={inputId}
            maxLength={inputSpec.maxLength}
            onChange={(text) => props.onInputChange({ ...props.input, text })}
            placeholder={inputSpec.placeholder}
            showLineNumbers={false}
            transparent
            value={props.input.text}
          />
        </WorkspaceSurface>

        {highlightedResult ? (
          <WorkspaceSurface
            actions={
              <ResultActions
                canCopy={Boolean(props.spec.capabilities?.copy)}
                canDownload={Boolean(props.spec.capabilities?.download)}
                result={props.result}
              />
            }
            className="h-full"
            contentClassName="bg-background"
            meta={`${preview.count} ${preview.count === 1 ? "replacement" : "replacements"} applied`}
            purpose="result"
            title="Replaced text"
            variant="card"
          >
            <div className="min-h-0 flex-1 overflow-auto rounded-lg bg-muted/45 p-4">
              <CodeBlock className="whitespace-pre-wrap break-words text-foreground">
                <AppliedResultText preview={preview} />
              </CodeBlock>
            </div>
          </WorkspaceSurface>
        ) : (
          <ResultSurface
            error={props.error}
            result={props.result}
            running={props.running}
            spec={props.spec}
            title="Replaced text"
            variant="card"
          />
        )}
      </div>

      <ToolOptionsPanel className="h-full overflow-y-auto bg-card p-[18px]" title="FIND & REPLACE" variant="plain">
        <SettingsPanel
          disabled={props.disabled}
          onChange={props.onSettingChange}
          pane="side"
          spec={props.spec.settings}
          values={props.settings}
        />
        <Muted className="text-muted-foreground">
          In the source, a red background marks text that will be removed; a green background marks what will replace
          it. Applied replacements stay highlighted in the result.
        </Muted>
        {validationReason ? (
          <Muted
            className={`${preview.invalidPattern || !find ? "text-destructive" : "text-muted-foreground"}`}
            role={preview.invalidPattern || !find ? "alert" : "status"}
          >
            {validationReason}
          </Muted>
        ) : preview.truncated ? (
          <Muted className="text-muted-foreground" role="status">
            {preview.count - preview.previewedCount} additional matches will still be replaced; they are grouped in the
            source to keep the editor responsive.
          </Muted>
        ) : null}
      </ToolOptionsPanel>
    </SplitStack>
  );
}
