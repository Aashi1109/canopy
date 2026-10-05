"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useCallback, useId, useRef, useState } from "react";

import { DiffView, type DiffViewProps } from "@/components/DiffView";
import { ResultActions } from "@/components/ResultView";
import { SettingsPanel } from "@/components/SettingsPanel";
import { SettingsStack, SplitStack } from "@/components/Stacks";
import { WorkspaceSurface } from "@/components/Surfaces";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import { SourceTextarea } from "@/components/WorkspaceInput";
import type { CodeEditorHandle } from "@/components/content/CodeEditor";
import {
  Button,
  FieldError,
  FieldLabel,
  Muted,
  ToolActionButton,
  ToolOptionsPanel,
  toast,
} from "@/components/ui/index.tsx";

type DiffWorkspaceProps = WorkspaceProps & {
  editLabel: string;
  renderLine?: DiffViewProps["renderLine"];
  settingsNote?: ReactNode;
};

export function DiffWorkspace({ editLabel, renderLine, settingsNote, ...props }: DiffWorkspaceProps) {
  const t = useTranslations("Workbench");
  const inputId = useId();
  const focusInputOnMount = useRef(false);
  const attachPrimaryEditor = useCallback((editor: CodeEditorHandle | null) => {
    if (editor && focusInputOnMount.current) {
      focusInputOnMount.current = false;
      editor.focus();
    }
  }, []);
  const [dismissedResult, setDismissedResult] = useState<WorkspaceProps["result"]>(null);
  const output = props.result !== dismissedResult ? props.result : null;
  const result = output?.render === "diff" ? output : output?.render === "text" ? output.diffPreview : null;
  const inputSpec = props.spec.input;
  if (inputSpec.kind !== "fields") return null;

  const sourcePane = (channel: "text" | "secondary", index: number) => {
    const field = inputSpec.fields[index];
    const id = `${inputId}-${channel}`;
    const error =
      props.error && (props.error.includes(inputSpec.fields[1].label) ? channel === "secondary" : channel === "text")
        ? props.error
        : undefined;
    const change = (text: string) => props.onInputChange({ ...props.input, files: [], [channel]: text });

    return (
      <WorkspaceSurface
        actions={
          <ToolActionButton
            action="paste"
            aria-label={t("pasteInto", { label: field.label })}
            disabled={props.disabled}
            onClick={async () => {
              try {
                change(await navigator.clipboard.readText());
              } catch {
                toast.error(t("pasteKeyboard", { label: field.label }));
              }
            }}
            type="button"
          >
            {t("paste")}
          </ToolActionButton>
        }
        className="h-full"
        description={channel === "text" ? t("diffOriginal") : t("diffChanged", { label: inputSpec.fields[0].label })}
        purpose="editor"
        title={field.label}
      >
        <FieldLabel className="sr-only" htmlFor={id}>
          {field.label}
        </FieldLabel>
        <SourceTextarea
          aria-label={field.label}
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={Boolean(error)}
          className="min-h-0 flex-1"
          disabled={props.disabled}
          editorRef={channel === "text" ? attachPrimaryEditor : undefined}
          id={id}
          language={field.language ?? "text"}
          onChange={change}
          placeholder={field.placeholder}
          required={field.required}
          value={props.input[channel] ?? ""}
          wrap="off"
        />
        {error ? (
          <FieldError className="px-4 py-2" id={`${id}-error`} role="alert">
            {error}
          </FieldError>
        ) : null}
      </WorkspaceSurface>
    );
  };

  const comparison = result ? (
    <WorkspaceSurface
      actions={
        <>
          <Button
            onClick={() => {
              focusInputOnMount.current = true;
              setDismissedResult(output);
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            {editLabel}
          </Button>
          <ResultActions canCopy canDownload result={output} />
        </>
      }
      className="h-full"
      meta={<span role="status">{output?.verdict?.label ?? t("comparisonReady")}</span>}
      metaPosition="start"
      purpose="result"
      title={t("comparison")}
    >
      <DiffView layout="split" renderLine={renderLine} result={result} />
    </WorkspaceSurface>
  ) : (
    <SplitStack className="h-full" defaultSize={50} minSize={25}>
      {sourcePane("text", 0)}
      {sourcePane("secondary", 1)}
    </SplitStack>
  );

  if (!Object.keys(props.spec.settings.fields).length) return comparison;

  return (
    <SettingsStack className="h-full" defaultCollapsed="secondary" defaultSize={75} minSize={75}>
      {comparison}
      <ToolOptionsPanel className="h-full overflow-y-auto bg-card p-[18px]" title={t("options")} variant="plain">
        <SettingsPanel
          disabled={props.disabled}
          onChange={props.onSettingChange}
          pane="side"
          spec={props.spec.settings}
          values={props.settings}
        />
        {settingsNote ? <Muted className="mt-3">{settingsNote}</Muted> : null}
      </ToolOptionsPanel>
    </SettingsStack>
  );
}
