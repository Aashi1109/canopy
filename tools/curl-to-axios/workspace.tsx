"use client";

import {
  Overline,
  Muted,
  FieldLabel,
  CodeBlock,
  List,
  P,
  AlertBanner,
  ToolActionButton,
  SegmentedControl,
  Select,
  ToolOptionsPanel,
} from "@smarttools/ui";
import { useEffect, useId, useRef, useState } from "react";

import { SplitStack } from "@/components/Stacks";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import { SourceTextarea } from "@/components/WorkspaceInput";

const REQUEST_STYLES = [
  { label: "axios.request", value: "request" },
  { label: "Aliases", value: "alias" },
  { label: "axios(config)", value: "config" },
] as const;

function resultText(result: WorkspaceProps["result"]): string {
  return result?.render === "text" ? result.text : "";
}

export default function CurlToAxiosWorkspace(props: WorkspaceProps) {
  const inputId = useId();
  const languageId = useId();
  const moduleId = useId();
  const copyTimer = useRef<number | undefined>(undefined);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const output = resultText(props.result);
  const issues = props.result?.issues ?? [];
  const verdict = props.result?.verdict;
  const inputSpec = props.spec.input;
  const moduleFormat = typeof props.settings.moduleFormat === "string" ? props.settings.moduleFormat : "none";
  const outputLanguage =
    typeof props.settings.outputLanguage === "string" ? props.settings.outputLanguage : "javascript";
  const requestStyle = typeof props.settings.requestStyle === "string" ? props.settings.requestStyle : "config";

  useEffect(() => {
    props.onToolbarActionsChange?.({ exampleLabel: "Load example" });
    return () => props.onToolbarActionsChange?.(null);
  }, [props.onToolbarActionsChange]);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);
  useEffect(() => setCopyStatus("idle"), [output]);

  if (inputSpec.kind !== "text") return null;

  async function copyOutput() {
    window.clearTimeout(copyTimer.current);
    try {
      await navigator.clipboard.writeText(output);
      setCopyStatus("copied");
      copyTimer.current = window.setTimeout(() => setCopyStatus("idle"), 2_000);
    } catch {
      setCopyStatus("failed");
    }
  }

  function downloadOutput() {
    if (!output || props.result?.render !== "text" || !props.result.downloadName) return;
    const url = URL.createObjectURL(new Blob([output], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.download = props.result.downloadName;
    link.href = url;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

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
      <div className="grid min-h-0 grid-rows-[minmax(12rem,0.55fr)_minmax(14rem,1fr)] gap-4 border-r border-border p-5 max-[54rem]:min-h-[44rem] max-[54rem]:border-r-0 max-[54rem]:border-b">
        <section className="flex min-h-0 flex-col gap-2" aria-labelledby={`${inputId}-label`}>
          <FieldLabel className="text-muted-foreground" htmlFor={inputId} id={`${inputId}-label`}>
            {inputSpec.label} <span aria-hidden="true">*</span>
          </FieldLabel>
          <SourceTextarea
            className="min-h-0 flex-1"
            disabled={props.disabled}
            id={inputId}
            maxLength={inputSpec.maxLength}
            onChange={(text) => props.onInputChange({ ...props.input, text })}
            placeholder={inputSpec.placeholder}
            required
            value={props.input.text}
          />
        </section>

        <section className="flex min-h-0 flex-col gap-2" aria-labelledby={`${languageId}-heading`}>
          <header className="flex min-h-8 shrink-0 flex-wrap items-center justify-between gap-2">
            <Overline className="text-muted-foreground" id={`${languageId}-heading`}>
              Generated output
            </Overline>
            <div className="flex items-center gap-2">
              <FieldLabel className="sr-only" htmlFor={languageId}>
                Output language
              </FieldLabel>
              <Select
                className="w-36"
                disabled={props.disabled}
                id={languageId}
                onChange={(event) => props.onSettingChange("outputLanguage", event.currentTarget.value)}
                size="xs"
                value={outputLanguage}
              >
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
              </Select>
              <ToolActionButton action="copy" disabled={!output} onClick={() => void copyOutput()} type="button">
                {copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Copy failed" : "Copy"}
              </ToolActionButton>
              <ToolActionButton
                action="download"
                iconOnly
                disabled={!output}
                onClick={downloadOutput}
                title="Download generated output"
                type="button"
              >
                <span className="sr-only">Download generated output</span>
              </ToolActionButton>
            </div>
          </header>
          <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-input bg-muted/45">
            {output ? (
              <CodeBlock className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-4">
                {output}
              </CodeBlock>
            ) : (
              <div className="grid flex-1 place-items-center p-6 text-center">
                <Muted>Generated Axios code appears here as you edit the cURL command.</Muted>
              </div>
            )}
          </div>
          {issues.length ? (
            <AlertBanner title="Some cURL flags were not converted" variant="warning">
              <List className="list-disc space-y-1 pl-4">
                {issues.map((issue, index) => (
                  <li key={`${index}-${issue.message}`}>{issue.message}</li>
                ))}
              </List>
            </AlertBanner>
          ) : null}
          {props.error ? (
            <AlertBanner title="Unable to convert" variant="error">
              {props.error}
            </AlertBanner>
          ) : verdict ? (
            <AlertBanner
              title={verdict.label}
              variant={verdict.level === "ok" ? "success" : verdict.level === "warn" ? "warning" : "error"}
            >
              {verdict.detail}
            </AlertBanner>
          ) : null}
        </section>
      </div>

      <ToolOptionsPanel
        className="h-full overflow-y-auto bg-card p-[22px] max-[54rem]:min-h-[26rem]"
        title="OUTPUT & RUNTIME"
        variant="plain"
      >
        <div className="grid gap-1.5">
          <FieldLabel className="text-muted-foreground" htmlFor={moduleId}>
            Module format
          </FieldLabel>
          <Select
            disabled={props.disabled}
            id={moduleId}
            onChange={(event) => props.onSettingChange("moduleFormat", event.currentTarget.value)}
            value={moduleFormat}
          >
            <option value="none">No import</option>
            <option value="esm">ES module import</option>
            <option value="commonjs">CommonJS require</option>
          </Select>
        </div>

        <SegmentedControl
          aria-label="Request style"
          items={REQUEST_STYLES.map((item) => ({ ...item, disabled: props.disabled }))}
          onValueChange={(value) => props.onSettingChange("requestStyle", value)}
          value={requestStyle}
        />

        <AlertBanner title="Unsupported flags are not converted" variant="warning">
          <P>
            Forms, cookie jars, proxies, redirects, certificates, uploads, and unsupported shell syntax are ignored.
          </P>
        </AlertBanner>
      </ToolOptionsPanel>
    </SplitStack>
  );
}
