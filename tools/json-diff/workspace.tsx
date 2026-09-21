"use client";

import { useCallback, useId, useRef, useState } from "react";

import { DiffView } from "@/components/DiffView";
import { highlightJson } from "@/components/JsonResultRenderer";
import { ResultActions } from "@/components/ResultView";
import { SettingsPanel } from "@/components/SettingsPanel";
import { SplitStack } from "@/components/Stacks";
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

export default function JsonDiffWorkspace(props: WorkspaceProps) {
  const inputId = useId();
  const focusInputOnMount = useRef(false);
  const attachPrimaryEditor = useCallback((editor: CodeEditorHandle | null) => {
    if (editor && focusInputOnMount.current) {
      focusInputOnMount.current = false;
      editor.focus();
    }
  }, []);
  const [dismissedResult, setDismissedResult] = useState<WorkspaceProps["result"]>(null);
  const result = props.result?.render === "diff" && props.result !== dismissedResult ? props.result : null;
  const inputSpec = props.spec.input;
  if (inputSpec.kind !== "fields") return null;

  const sourcePane = (channel: "text" | "secondary", index: number) => {
    const field = inputSpec.fields[index];
    const id = `${inputId}-${channel}`;
    const error =
      props.error && (props.error.includes("JSON B") ? channel === "secondary" : channel === "text")
        ? props.error
        : undefined;
    const change = (text: string) => props.onInputChange({ ...props.input, files: [], [channel]: text });

    return (
      <WorkspaceSurface
        actions={
          <ToolActionButton
            action="paste"
            aria-label={`Paste into ${field.label}`}
            disabled={props.disabled}
            onClick={async () => {
              try {
                change(await navigator.clipboard.readText());
              } catch {
                toast.error(`Paste failed. Use your keyboard to paste into ${field.label}.`);
              }
            }}
            type="button"
          >
            Paste
          </ToolActionButton>
        }
        className="h-full"
        description={channel === "text" ? "Original · baseline" : "Changed · compared with JSON A"}
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
          language="json"
          onChange={change}
          placeholder={field.placeholder}
          required
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

  return (
    <SplitStack
      className="h-full"
      collapseLabel="settings panel"
      collapseSide="secondary"
      collapsible
      defaultCollapsed="secondary"
      defaultSize={75}
      minSize={75}
    >
      {result ? (
        <WorkspaceSurface
          actions={
            <>
              <Button
                onClick={() => {
                  focusInputOnMount.current = true;
                  setDismissedResult(result);
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Edit JSON
              </Button>
              <ResultActions canCopy canDownload result={result} />
            </>
          }
          className="h-full"
          meta={<span role="status">{result.verdict?.label ?? "Comparison ready"}</span>}
          metaPosition="start"
          purpose="result"
          title="Comparison"
        >
          <DiffView layout="split" renderLine={highlightJson} result={result} />
        </WorkspaceSurface>
      ) : (
        <SplitStack className="h-full" defaultSize={50} minSize={25}>
          {sourcePane("text", 0)}
          {sourcePane("secondary", 1)}
        </SplitStack>
      )}
      <ToolOptionsPanel className="h-full overflow-y-auto bg-card p-[18px]" title="SETTINGS" variant="plain">
        <SettingsPanel
          disabled={props.disabled}
          onChange={props.onSettingChange}
          pane="side"
          spec={props.spec.settings}
          values={props.settings}
        />
        <Muted className="mt-3">
          JSON A is the baseline. Red lines are removed; green lines are added in JSON B. Whitespace and object-key
          order are ignored.
        </Muted>
      </ToolOptionsPanel>
    </SplitStack>
  );
}
